import { env } from 'cloudflare:test';
import type { DixitRoundRecord } from '@cartolina/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { insertDixitRound } from '../src/dixit-history-db';
import { dixitHistoryPage } from '../src/dixit-history-page';

// Faixa própria deste arquivo: sala PGTS, played_at 10_000–10_999.
function rec(match: number, playedAt: number): DixitRoundRecord {
  return {
    id: crypto.randomUUID(),
    matchId: `PGTS-${match}`,
    roomCode: 'PGTS',
    playedAt,
    target: 30,
    round: 1,
    storyteller: { name: 'Ana', color: '#8EC5FF' },
    clue: `dica ${match}`,
    storyCard: 'd001',
    cards: [{ card: 'd001', owner: { name: 'Ana', color: '#8EC5FF' } }],
    votes: [],
    scores: [{ name: 'Ana', color: '#8EC5FF', gained: 0, score: 0 }],
  };
}

const clear = () => env.DB.prepare("DELETE FROM dixit_rounds WHERE room_code = 'PGTS'").run();
beforeEach(clear);
afterEach(clear);

/** Partidas PGTS-1…PGTS-n, cada uma começando em 10_000 + i. */
async function seed(n: number): Promise<void> {
  for (let i = 1; i <= n; i++) await insertDixitRound(env.DB, rec(i, 10_000 + i), `k${i}`);
}

const ids = (from: number, to: number) => Array.from({ length: from - to + 1 }, (_, i) => `PGTS-${from - i}`);

describe('dixitHistoryPage', () => {
  it('pagina de 20 em 20 partidas, com nextBefore = início da última', async () => {
    await seed(25);
    const p1 = await dixitHistoryPage(env.DB, 10_026);
    expect(p1.game).toBe('dixit');
    expect(p1.matches.map((m) => m.id)).toEqual(ids(25, 6));
    expect(p1.nextBefore).toBe(10_006);
    expect(p1.stats).toBeNull();
    const p2 = await dixitHistoryPage(env.DB, 10_006);
    expect(p2.matches.map((m) => m.id)).toEqual(ids(5, 1));
    expect(p2.nextBefore).toBeNull();
  });

  it('exatamente 20 partidas: não há próxima página', async () => {
    await seed(20);
    const p = await dixitHistoryPage(env.DB, 10_021);
    expect(p.matches).toHaveLength(20);
    expect(p.nextBefore).toBeNull();
  });

  it('a partida vem com todas as rodadas, mesmo as jogadas depois do cursor', async () => {
    await seed(2);
    await insertDixitRound(env.DB, rec(2, 10_500), 'k2b');
    const p = await dixitHistoryPage(env.DB, 10_003);
    expect(p.matches[0]!.id).toBe('PGTS-2');
    expect(p.matches[0]!.rounds.map((r) => r.playedAt)).toEqual([10_002, 10_500]);
  });

  it('primeira página (sem before) traz as estatísticas', async () => {
    await seed(1);
    const p = await dixitHistoryPage(env.DB, null);
    expect(p.stats).not.toBeNull();
    expect(Array.isArray(p.stats!.clueWall)).toBe(true);
  });
});
