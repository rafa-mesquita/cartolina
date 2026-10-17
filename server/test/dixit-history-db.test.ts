import { env } from 'cloudflare:test';
import type { DixitRoundRecord } from '@cartolina/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { allDixitRounds, dixitRoundsOfMatches, insertDixitRound, listDixitMatchIds } from '../src/dixit-history-db';

// Faixas próprias deste arquivo (o D1 dos testes é compartilhado): sala DBTS, played_at 50_000+ e 9_000_000_000_000+.
const FUTURE = 9_000_000_000_000;

function rec(matchId: string, playedAt: number, clue = 'luar'): DixitRoundRecord {
  return {
    id: crypto.randomUUID(),
    matchId,
    roomCode: 'DBTS',
    playedAt,
    target: 30,
    round: 1,
    storyteller: { name: 'Ana', color: '#8EC5FF' },
    clue,
    storyCard: 'd001',
    cards: [
      { card: 'd001', owner: { name: 'Ana', color: '#8EC5FF' } },
      { card: 'd002', owner: { name: 'Bia', color: '#FF8FAB' } },
    ],
    votes: [{ voter: { name: 'Bia', color: '#FF8FAB' }, card: 'd001' }],
    scores: [
      { name: 'Ana', color: '#8EC5FF', gained: 3, score: 3 },
      { name: 'Bia', color: '#FF8FAB', gained: 3, score: 3 },
    ],
  };
}

const clear = () => env.DB.prepare("DELETE FROM dixit_rounds WHERE room_code = 'DBTS'").run();
beforeEach(clear);
afterEach(clear);

describe('dixit-history-db', () => {
  it('grava e lê de volta a rodada inteira', async () => {
    const r = rec('DBTS-1-1', 50_001);
    await insertDixitRound(env.DB, r, 'k1');
    expect(await dixitRoundsOfMatches(env.DB, ['DBTS-1-1'])).toEqual([r]);
  });

  it('gravar a mesma revelação duas vezes deixa uma linha só', async () => {
    const r = rec('DBTS-1-1', 50_002);
    await insertDixitRound(env.DB, r, 'mesma');
    await insertDixitRound(env.DB, { ...r, id: crypto.randomUUID() }, 'mesma');
    expect(await dixitRoundsOfMatches(env.DB, ['DBTS-1-1'])).toHaveLength(1);
    await insertDixitRound(env.DB, { ...r, id: crypto.randomUUID() }, 'outra');
    expect(await dixitRoundsOfMatches(env.DB, ['DBTS-1-1'])).toHaveLength(2);
  });

  it('lista partidas pela 1ª rodada, mais recente primeiro, com before exclusivo', async () => {
    await insertDixitRound(env.DB, rec('DBTS-m1', 50_010), 'a');
    await insertDixitRound(env.DB, rec('DBTS-m1', 50_015), 'b');
    await insertDixitRound(env.DB, rec('DBTS-m2', 50_020), 'c');
    await insertDixitRound(env.DB, rec('DBTS-m3', 50_030), 'd');
    expect(await listDixitMatchIds(env.DB, 50_031, 2)).toEqual([
      { matchId: 'DBTS-m3', startedAt: 50_030 },
      { matchId: 'DBTS-m2', startedAt: 50_020 },
    ]);
    expect(await listDixitMatchIds(env.DB, 50_020, 1)).toEqual([{ matchId: 'DBTS-m1', startedAt: 50_010 }]);
  });

  it('rodadas das partidas pedidas, em ordem cronológica; sem partidas devolve vazio', async () => {
    await insertDixitRound(env.DB, rec('DBTS-m1', 50_042, 'segunda'), 'a');
    await insertDixitRound(env.DB, rec('DBTS-m1', 50_041, 'primeira'), 'b');
    await insertDixitRound(env.DB, rec('DBTS-m2', 50_043, 'outra'), 'c');
    expect((await dixitRoundsOfMatches(env.DB, ['DBTS-m1'])).map((r) => r.clue)).toEqual(['primeira', 'segunda']);
    expect(await dixitRoundsOfMatches(env.DB, [])).toEqual([]);
  });

  it('várias partidas de uma vez: todas as rodadas delas, em ordem cronológica', async () => {
    await insertDixitRound(env.DB, rec('DBTS-m1', 50_052, 'm1 segunda'), 'a');
    await insertDixitRound(env.DB, rec('DBTS-m2', 50_051, 'm2 primeira'), 'b');
    await insertDixitRound(env.DB, rec('DBTS-m1', 50_050, 'm1 primeira'), 'c');
    await insertDixitRound(env.DB, rec('DBTS-m3', 50_053, 'fora do pedido'), 'd');
    const clues = (await dixitRoundsOfMatches(env.DB, ['DBTS-m2', 'DBTS-m1'])).map((r) => r.clue);
    expect(clues).toEqual(['m1 primeira', 'm2 primeira', 'm1 segunda']);
  });

  it('no mesmo instante, a narração mais baixa vem primeiro', async () => {
    await insertDixitRound(env.DB, { ...rec('DBTS-m1', 50_060, 'terceira'), round: 3 }, 'a');
    await insertDixitRound(env.DB, { ...rec('DBTS-m1', 50_060, 'segunda'), round: 2 }, 'b');
    expect((await dixitRoundsOfMatches(env.DB, ['DBTS-m1'])).map((r) => r.clue)).toEqual(['segunda', 'terceira']);
  });

  it('estatísticas leem as rodadas MAIS RECENTES até o limite, em ordem cronológica', async () => {
    for (const t of [1, 4, 2, 3]) await insertDixitRound(env.DB, rec('DBTS-f', FUTURE + t), `k${t}`);
    expect((await allDixitRounds(env.DB, 2)).map((r) => r.playedAt)).toEqual([FUTURE + 3, FUTURE + 4]);
  });
});
