import { SELF, env, runInDurableObject } from 'cloudflare:test';
import { GAMES, type CoupHistoryResponse, type CoupMatchRecord, type CoupRoomView } from '@cartolina/shared';
import { describe, expect, it } from 'vitest';
import { insertCoupMatch } from '../src/coup-history-db';
import { joined, newGameRoom } from './helpers';

const rowsOf = async (code: string) =>
  (await env.DB.prepare('SELECT id, match_id FROM coup_matches WHERE room_code = ?').bind(code).all<{ id: string; match_id: string }>()).results;

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

describe('histórico do Cúpi no servidor', () => {
  it('o registro diz que o Cúpi grava histórico', () => {
    expect(GAMES.coup.recordsHistory).toBe(true);
  });

  it('partida terminada grava uma vez só, esvazia a fila do DO e aparece em GET /history/coup', async () => {
    const code = await newGameRoom('coup');
    const players = await joined(code, 2);
    players[0]!.client.send({ t: 'action', action: { type: 'start' } });

    // Com 2 jogadores, renda e golpe não abrem janela de reação: a partida vai até o fim só com eles e `lose`.
    // `client.state(pred)` descarta os estados que não servem e devolve o próximo que serve; então cada jogador
    // espera o próximo estado em que TEM algo a fazer (ou o fim) e age pela própria visão. Uma ação repetida por
    // um estado velho só volta como erro (fora da vez), que o `state` ignora.
    await Promise.all(
      players.map(async (p) => {
        for (let step = 0; step < 200; step++) {
          const v = await p.client.state<CoupRoomView>((r) => r.game.phase === 'over' || r.game.can.lose || r.game.can.act.length > 0);
          if (v.game.phase === 'over') return;
          if (v.game.can.lose) p.client.send({ t: 'action', action: { type: 'lose', card: v.game.myCards[0]! } });
          else if (v.game.can.act.includes('coup')) {
            p.client.send({ t: 'action', action: { type: 'act', kind: 'coup', target: v.game.can.targets[0]! } });
          } else p.client.send({ t: 'action', action: { type: 'act', kind: 'income' } });
        }
        throw new Error('a partida não terminou em 200 passos');
      }),
    );

    const rows = await waitForRows(code);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.match_id).toMatch(new RegExp(`^${code}-\\d+-1$`));

    // alguém sai: novo commit, mas a mesma partida
    players[1]!.client.ws.close(1000, 'tchau');
    await players[0]!.client.state<CoupRoomView>((r) => r.seats.some((s) => !s.connected));
    await new Promise((r) => setTimeout(r, 200)); // dá tempo de uma gravação indevida aparecer
    expect(await rowsOf(code)).toHaveLength(1);
    for (let i = 0; i < 20 && (await pendingCount(code)) > 0; i++) await new Promise((r) => setTimeout(r, 50));
    expect(await pendingCount(code)).toBe(0);

    const res = await SELF.fetch('https://x/history/coup');
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('no-cache');
    const body = (await res.json()) as CoupHistoryResponse;
    expect(body.game).toBe('coup');
    expect(body.stats).toBeNull();
    const match = body.matches.find((m) => m.roomCode === code)!;
    expect(match.players.map((p) => p.name)).toEqual(['P0', 'P1']);
    expect(match.out).toHaveLength(1);
    const outName = match.out[0]!.name;
    expect(match.winner.name).not.toBe(outName);
    expect(match.winner.name).toBe(['P0', 'P1'].find((n) => n !== outName));
    expect(match.winnerCards.length).toBeGreaterThan(0);
  });

  it('before inválido dá 400', async () => {
    const bad = await SELF.fetch('https://x/history/coup?before=abc');
    expect(bad.status).toBe(400);
    expect(await bad.json()).toEqual({ error: 'bad_before' });
  });

  it('paginação: 20 por página, nextBefore pelo fim da 20ª, e a segunda traz o resto', async () => {
    const code = 'PGC4';
    const base = Date.now() + 10_000_000; // à frente de qualquer outra partida dos testes
    for (let i = 1; i <= 21; i++) {
      const rec: CoupMatchRecord = {
        id: `pgc4-${i}`,
        matchId: `${code}-1-${i}`,
        roomCode: code,
        playedAt: base + i,
        players: [
          { name: 'A', color: '#8EC5FF' },
          { name: 'B', color: '#FF8FAB' },
        ],
        out: [{ name: 'B', color: '#FF8FAB' }],
        winner: { name: 'A', color: '#8EC5FF' },
        winnerCards: ['duke'],
      };
      await insertCoupMatch(env.DB, rec);
    }
    try {
      const first = (await (await SELF.fetch('https://x/history/coup')).json()) as CoupHistoryResponse;
      expect(first.matches).toHaveLength(20);
      expect(first.matches[0]!.id).toBe('pgc4-21');
      expect(first.nextBefore).toBe(first.matches[19]!.playedAt);
      expect(first.nextBefore).toBe(base + 2);

      const second = (await (await SELF.fetch(`https://x/history/coup?before=${first.nextBefore}`)).json()) as CoupHistoryResponse;
      expect(second.matches.filter((m) => m.roomCode === code).map((m) => m.id)).toEqual(['pgc4-1']);
    } finally {
      await env.DB.prepare("DELETE FROM coup_matches WHERE room_code = 'PGC4'").run();
    }
  });
});
