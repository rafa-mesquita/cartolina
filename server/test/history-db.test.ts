import { env } from 'cloudflare:test';
import type { RoundRecord } from '@cartolina/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { allRounds, insertRound, listRounds } from '../src/history-db';

function rec(playedAt: number): RoundRecord {
  return {
    id: crypto.randomUUID(),
    roomCode: 'ABCD',
    playedAt,
    mode: 'livre',
    level: 1,
    outcome: 'round_won',
    errors: 0,
    campaignId: null,
    theme: { titulo: 'Comidas', min: 'odeio', max: 'amo' },
    players: [{ name: 'Ana', color: '#8EC5FF' }],
    cards: [{ name: 'Ana', color: '#8EC5FF', value: 42, clue: 'pizza', error: false }],
  };
}

// A camada é agnóstica ao jogo; usa o 'dixit' (que nunca grava de verdade) para não misturar com o ITO dos outros testes.
beforeEach(async () => {
  await env.DB.prepare("DELETE FROM rounds WHERE game = 'dixit'").run();
});

describe('history-db', () => {
  it('grava e lista rodadas (mais recentes primeiro, com paginação)', async () => {
    for (const t of [10, 30, 20]) await insertRound(env.DB, 'dixit', rec(t), `k${t}`);
    const page1 = await listRounds(env.DB, 'dixit', null, 2);
    expect(page1.map((r) => r.playedAt)).toEqual([30, 20]);
    const page2 = await listRounds(env.DB, 'dixit', 20, 2);
    expect(page2.map((r) => r.playedAt)).toEqual([10]);
    expect(page1[0]).toEqual(expect.objectContaining({ roomCode: 'ABCD', theme: { titulo: 'Comidas', min: 'odeio', max: 'amo' } }));
    expect(page1[0]!.cards[0]).toEqual({ name: 'Ana', color: '#8EC5FF', value: 42, clue: 'pizza', error: false });
    expect((await allRounds(env.DB, 'dixit')).map((r) => r.playedAt)).toEqual([10, 20, 30]);
  });

  it('rodadas de um jogo não aparecem no outro', async () => {
    const mine = rec(5);
    await insertRound(env.DB, 'dixit', mine, 'k5');
    expect((await listRounds(env.DB, 'ito', null, 20)).map((r) => r.id)).not.toContain(mine.id);
    expect((await allRounds(env.DB, 'ito')).map((r) => r.id)).not.toContain(mine.id);
    expect((await listRounds(env.DB, 'dixit', null, 20)).map((r) => r.id)).toEqual([mine.id]);
  });

  it('estatísticas leem as rodadas MAIS RECENTES até o limite, em ordem cronológica', async () => {
    for (const t of [10, 40, 20, 30]) await insertRound(env.DB, 'dixit', rec(t), `k${t}`);
    expect((await allRounds(env.DB, 'dixit', 2)).map((r) => r.playedAt)).toEqual([30, 40]);
  });

  it('gravar a mesma revelação duas vezes deixa uma linha só', async () => {
    const r = rec(7);
    await insertRound(env.DB, 'dixit', r, 'mesma-chave');
    await insertRound(env.DB, 'dixit', { ...r, id: crypto.randomUUID() }, 'mesma-chave');
    expect(await listRounds(env.DB, 'dixit', null, 20)).toHaveLength(1);
    await insertRound(env.DB, 'dixit', { ...r, id: crypto.randomUUID() }, 'outra-chave');
    expect(await listRounds(env.DB, 'dixit', null, 20)).toHaveLength(2);
  });
});
