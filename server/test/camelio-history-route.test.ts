import { SELF, env, runInDurableObject } from 'cloudflare:test';
import { GAMES, type CamelioHistoryResponse, type CamelioMatchRecord, type CamelioRoomView } from '@cartolina/shared';
import { describe, expect, it } from 'vitest';
import { insertCamelioMatch } from '../src/camelio-history-db';
import { COLORS, connect, joined, newGameRoom, type TestClient } from './helpers';

const rowsOf = async (code: string) =>
  (await env.DB.prepare('SELECT id, match_id FROM camelio_matches WHERE room_code = ?').bind(code).all<{ id: string; match_id: string }>()).results;

/** O DO grava no D1 depois de transmitir o estado: espera a partida aparecer (até `n` linhas). */
async function waitForRows(code: string, n = 1): Promise<Awaited<ReturnType<typeof rowsOf>>> {
  let rows = await rowsOf(code);
  for (let i = 0; i < 40 && rows.length < n; i++) {
    await new Promise((r) => setTimeout(r, 50));
    rows = await rowsOf(code);
  }
  return rows;
}

async function pendingCount(code: string): Promise<number> {
  const stub = env.ROOMS.get(env.ROOMS.idFromName(code));
  let size = 0;
  await runInDurableObject(stub, async (_instance, state) => {
    size = (await state.storage.list({ prefix: 'pendingRound:' })).size;
  });
  return size;
}

const A = { name: 'A', color: '#8EC5FF' } as const;
const B = { name: 'B', color: '#FF8FAB' } as const;

function record(code: string, i: number, playedAt: number): CamelioMatchRecord {
  return {
    id: `${code.toLowerCase()}-${i}`,
    matchId: `${code}-1-${i}`,
    roomCode: code,
    playedAt,
    target: 4,
    endReason: 'target',
    players: [A, B],
    winners: [0],
    final: [
      { colors: ['verde', 'amarelo', 'laranja', 'vermelho'], spheres: 0 },
      { colors: [], spheres: 3 },
    ],
    plays: [{ by: 1, to: 0, from: 'deck', card: { color: 'verde', spheres: 2, kind: 'normal' }, outcome: 'scored', sum: 5 }],
  };
}

type Player = { client: TestClient; id: string };

/**
 * O host acompanha o estado; quem tem a vez compra do monte pra si mesmo, até a partida acabar (no máximo 200 jogadas).
 * `view` é o estado do host no começo da partida.
 */
async function playToEnd(players: Player[], view: CamelioRoomView): Promise<CamelioRoomView> {
  const host = players[0]!;
  const match = view.game.match;
  for (let n = 0; n < 200 && view.game.phase === 'playing'; n++) {
    const actor = players.find((p) => p.id === view.game.turn)!;
    actor.client.send({ t: 'action', action: { type: 'play', from: 'deck', to: actor.id } });
    view = await host.client.state<CamelioRoomView>(
      (r) => r.game.match === match && (r.game.playCount === n + 1 || r.game.phase === 'over'),
    );
  }
  expect(view.game.phase).toBe('over');
  return view;
}

const isPlaying = (r: CamelioRoomView) => r.game.phase === 'playing';

describe('histórico do Cama-Leão no servidor', () => {
  it('o registro diz que o Cama-Leão grava histórico', () => {
    expect(GAMES.camelio.recordsHistory).toBe(true);
  });

  it('partida terminada grava uma vez só, esvazia a fila do DO, aparece em GET /history/camelio, e "jogar de novo" grava a segunda', async () => {
    const code = await newGameRoom('camelio');
    const players = await joined(code, 2);
    const host = players[0]!;
    host.client.send({ t: 'action', action: { type: 'start' } });
    const started = await Promise.all(players.map((p) => p.client.state<CamelioRoomView>(isPlaying)));
    const end = await playToEnd(players, started[0]!);

    const rows = await waitForRows(code);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.match_id).toMatch(new RegExp(`^${code}-\\d+-1$`));

    // alguém sai: novo commit, mas a mesma partida
    players[1]!.client.ws.close(1000, 'tchau');
    await host.client.state<CamelioRoomView>((r) => r.seats.some((s) => !s.connected));
    await new Promise((r) => setTimeout(r, 200)); // dá tempo de uma gravação indevida aparecer
    expect(await rowsOf(code)).toHaveLength(1);
    for (let i = 0; i < 20 && (await pendingCount(code)) > 0; i++) await new Promise((r) => setTimeout(r, 50));
    expect(await pendingCount(code)).toBe(0);

    const res = await SELF.fetch('https://x/history/camelio');
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('no-cache');
    const body = (await res.json()) as CamelioHistoryResponse;
    expect(body.game).toBe('camelio');
    expect(body.stats).not.toBeNull();

    // A partida vem direto do D1: a página 1 do histórico pode estar cheia de partidas de outros testes.
    const row = await env.DB.prepare('SELECT record_json FROM camelio_matches WHERE room_code = ?').bind(code).first<{ record_json: string }>();
    const match = JSON.parse(row!.record_json) as CamelioMatchRecord;
    expect(match.players.map((p) => p.name)).toEqual(['P0', 'P1']);
    expect(match.plays).toHaveLength(end.game.playCount);
    expect(match.plays.every((p) => p.by === p.to)).toBe(true);
    expect(match.winners.length).toBeGreaterThan(0);
    expect(match.winners.every((w) => w >= 0 && w < match.players.length)).toBe(true);
    expect(['target', 'deck']).toContain(match.endReason);

    // P1 volta pela mesma ficha e o host joga de novo: a segunda partida grava outra linha.
    const back = await connect(code);
    back.send({ t: 'join', token: players[1]!.token, name: 'P1', color: COLORS[1]! });
    await back.next('welcome');
    const again: Player[] = [host, { client: back, id: players[1]!.id }];
    await host.client.state<CamelioRoomView>((r) => r.seats.every((s) => s.connected));
    host.client.send({ t: 'action', action: { type: 'again' } });
    const novo = await host.client.state<CamelioRoomView>((r) => r.game.phase === 'playing' && r.game.match === 2 && r.game.playCount === 0);
    await playToEnd(again, novo);

    const both = await waitForRows(code, 2);
    expect(both.map((r) => r.match_id.split('-').pop()).sort()).toEqual(['1', '2']);
  });

  it('partida com jogador "Bot …" não grava', async () => {
    const code = await newGameRoom('camelio');
    const [human] = await joined(code, 1);
    const botClient = await connect(code);
    botClient.send({ t: 'join', token: crypto.randomUUID(), name: 'Bot Zé', color: COLORS[1]! });
    const bot = { client: botClient, id: (await botClient.next('welcome')).playerId };
    const players: Player[] = [human!, bot];
    human!.client.send({ t: 'action', action: { type: 'start' } });
    const started = await human!.client.state<CamelioRoomView>(isPlaying);
    await playToEnd(players, started);
    await new Promise((r) => setTimeout(r, 300)); // dá tempo de uma gravação indevida aparecer
    expect(await rowsOf(code)).toHaveLength(0);
    expect(await pendingCount(code)).toBe(0);
  });

  it('before inválido dá 400', async () => {
    const bad = await SELF.fetch('https://x/history/camelio?before=abc');
    expect(bad.status).toBe(400);
    expect(await bad.json()).toEqual({ error: 'bad_before' });
  });

  it('paginação: 20 por página, nextBefore pelo fim da 20ª, e a segunda traz o resto sem estatísticas', async () => {
    const code = 'PGC6';
    const base = Date.now() + 10_000_000; // à frente de qualquer outra partida dos testes
    for (let i = 1; i <= 21; i++) await insertCamelioMatch(env.DB, record(code, i, base + i));
    try {
      const first = (await (await SELF.fetch('https://x/history/camelio')).json()) as CamelioHistoryResponse;
      expect(first.matches).toHaveLength(20);
      expect(first.matches[0]!.id).toBe('pgc6-21');
      expect(first.nextBefore).toBe(base + 2);
      // A venceu as 21 partidas: é o domador (outras partidas dos testes têm só P0/P1, com menos vitórias).
      expect(first.stats?.domador).toEqual({ holders: [A], count: 21 });

      const second = (await (await SELF.fetch(`https://x/history/camelio?before=${first.nextBefore}`)).json()) as CamelioHistoryResponse;
      expect(second.matches.filter((m) => m.roomCode === code).map((m) => m.id)).toEqual(['pgc6-1']);
      expect(second.stats).toBeNull();
    } finally {
      await env.DB.prepare("DELETE FROM camelio_matches WHERE room_code = 'PGC6'").run();
    }
  });

  it('a mesma partida gravada de novo não duplica', async () => {
    const code = 'DUP6';
    await insertCamelioMatch(env.DB, record(code, 1, 1000));
    await insertCamelioMatch(env.DB, { ...record(code, 1, 2000), id: 'outro-id' });
    try {
      expect((await rowsOf(code)).map((r) => r.id)).toEqual(['dup6-1']);
    } finally {
      await env.DB.prepare("DELETE FROM camelio_matches WHERE room_code = 'DUP6'").run();
    }
  });
});
