import { SELF, env, runInDurableObject } from 'cloudflare:test';
import { GAMES, type KittensHistoryResponse, type KittensMatchRecord, type KittensRoomView } from '@cartolina/shared';
import { describe, expect, it } from 'vitest';
import { insertKittensMatch } from '../src/kittens-history-db';
import { joined, newGameRoom } from './helpers';

const rowsOf = async (code: string) =>
  (await env.DB.prepare('SELECT id, match_id FROM kittens_matches WHERE room_code = ?').bind(code).all<{ id: string; match_id: string }>()).results;

/** O DO grava no D1 depois de transmitir o estado: espera a partida aparecer. */
async function waitForRows(code: string): Promise<Awaited<ReturnType<typeof rowsOf>>> {
  let rows = await rowsOf(code);
  for (let i = 0; i < 40 && rows.length === 0; i++) {
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

function record(code: string, i: number, playedAt: number): KittensMatchRecord {
  return {
    id: `${code.toLowerCase()}-${i}`,
    matchId: `${code}-1-${i}`,
    roomCode: code,
    playedAt,
    players: [A, B],
    exits: [{ who: B, how: 'boom' }],
    winner: A,
    perPlayer: [
      { who: A, nopes: 1, defuses: 0 },
      { who: B, nopes: 0, defuses: 1 },
    ],
  };
}

/** É a vez de `me` agir: escolha aberta dele, ou a vez dele sem carta no ar nem escolha. */
function mine(v: KittensRoomView, me: string): boolean {
  const c = v.game.choice;
  if (c && 'who' in c) return c.who === me;
  return c === null && v.game.pending === null && v.game.current === me;
}

describe('histórico do Tatubum no servidor', () => {
  it('o registro diz que o Tatubum grava histórico', () => {
    expect(GAMES.kittens.recordsHistory).toBe(true);
  });

  it('partida terminada grava uma vez só, esvazia a fila do DO e aparece em GET /history/kittens', async () => {
    const code = await newGameRoom('kittens');
    const players = await joined(code, 2);
    players[0]!.client.send({ t: 'action', action: { type: 'start' } });

    // Só compras: quem tira o Tatubum joga o Desarme e o esconde no topo, até alguém não ter mais Desarme e explodir.
    // Cada jogador espera o próximo estado em que TEM algo a fazer (ou o fim) e age pela própria visão; uma ação
    // repetida por um estado velho só volta como erro, que o `state` ignora.
    await Promise.all(
      players.map(async (p) => {
        for (let step = 0; step < 300; step++) {
          const v = await p.client.state<KittensRoomView>((r) => r.game.phase === 'gameover' || mine(r, p.id));
          if (v.game.phase === 'gameover') return;
          const c = v.game.choice;
          if (c?.kind === 'tatu') {
            p.client.send({ t: 'action', action: { type: 'choose', card: v.game.hand.find((x) => x.startsWith('cafune'))! } });
          } else if (c?.kind === 'cafune') p.client.send({ t: 'action', action: { type: 'choose', position: 0 } });
          else p.client.send({ t: 'action', action: { type: 'draw' } });
        }
        throw new Error('a partida não terminou em 300 passos');
      }),
    );

    const rows = await waitForRows(code);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.match_id).toMatch(new RegExp(`^${code}-\\d+-1$`));

    // alguém sai: novo commit, mas a mesma partida
    players[1]!.client.ws.close(1000, 'tchau');
    await players[0]!.client.state<KittensRoomView>((r) => r.seats.some((s) => !s.connected));
    await new Promise((r) => setTimeout(r, 200)); // dá tempo de uma gravação indevida aparecer
    expect(await rowsOf(code)).toHaveLength(1);
    for (let i = 0; i < 20 && (await pendingCount(code)) > 0; i++) await new Promise((r) => setTimeout(r, 50));
    expect(await pendingCount(code)).toBe(0);

    const res = await SELF.fetch('https://x/history/kittens');
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('no-cache');
    const body = (await res.json()) as KittensHistoryResponse;
    expect(body.game).toBe('kittens');
    expect(body.stats).not.toBeNull();

    // A partida vem direto do D1: a página 1 do histórico pode estar cheia de partidas de outros testes.
    const row = await env.DB.prepare('SELECT record_json FROM kittens_matches WHERE room_code = ?').bind(code).first<{ record_json: string }>();
    const match = JSON.parse(row!.record_json) as KittensMatchRecord;
    expect(match.players.map((p) => p.name)).toEqual(['P0', 'P1']);
    expect(match.exits).toHaveLength(1);
    expect(match.exits[0]!.how).toBe('boom');
    const loser = match.exits[0]!.who.name;
    expect(match.winner.name).toBe(['P0', 'P1'].find((n) => n !== loser));
    // Ninguém deu Nem vem!; quem explodiu tinha o Desarme da mão inicial e usou antes.
    expect(match.perPlayer.map((x) => x.nopes)).toEqual([0, 0]);
    expect(match.perPlayer.find((x) => x.who.name === loser)!.defuses).toBeGreaterThanOrEqual(1);
  });

  it('before inválido dá 400', async () => {
    const bad = await SELF.fetch('https://x/history/kittens?before=abc');
    expect(bad.status).toBe(400);
    expect(await bad.json()).toEqual({ error: 'bad_before' });
  });

  it('paginação: 20 por página, nextBefore pelo fim da 20ª, e a segunda traz o resto sem estatísticas', async () => {
    const code = 'PGK5';
    const base = Date.now() + 10_000_000; // à frente de qualquer outra partida dos testes
    for (let i = 1; i <= 21; i++) await insertKittensMatch(env.DB, record(code, i, base + i));
    try {
      const first = (await (await SELF.fetch('https://x/history/kittens')).json()) as KittensHistoryResponse;
      expect(first.matches).toHaveLength(20);
      expect(first.matches[0]!.id).toBe('pgk5-21');
      expect(first.nextBefore).toBe(base + 2);
      // A tem 21 partidas e 21 vitórias: no topo de quem mais vence.
      expect(first.stats?.mostWins[0]).toMatchObject({ name: 'A', count: 21, matches: 21, rate: 1 });

      const second = (await (await SELF.fetch(`https://x/history/kittens?before=${first.nextBefore}`)).json()) as KittensHistoryResponse;
      expect(second.matches.filter((m) => m.roomCode === code).map((m) => m.id)).toEqual(['pgk5-1']);
      expect(second.stats).toBeNull();
    } finally {
      await env.DB.prepare("DELETE FROM kittens_matches WHERE room_code = 'PGK5'").run();
    }
  });

  it('a mesma partida gravada de novo não duplica', async () => {
    const code = 'DUP5';
    await insertKittensMatch(env.DB, record(code, 1, 1000));
    await insertKittensMatch(env.DB, { ...record(code, 1, 2000), id: 'outro-id' });
    try {
      expect((await rowsOf(code)).map((r) => r.id)).toEqual(['dup5-1']);
    } finally {
      await env.DB.prepare("DELETE FROM kittens_matches WHERE room_code = 'DUP5'").run();
    }
  });
});
