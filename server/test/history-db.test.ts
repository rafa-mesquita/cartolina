import { env } from 'cloudflare:test';
import type { RoundRecord } from '@cartolina/shared';
import { describe, expect, it } from 'vitest';
import { SLUG_RE } from '../src/codes';
import { allRounds, createGroup, findGroup, insertRound, listRounds } from '../src/history-db';

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

describe('history-db', () => {
  it('cria e encontra grupo pelo slug', async () => {
    const g = await createGroup(env.DB, 'Galera', 1000);
    expect(g.slug).toMatch(SLUG_RE);
    expect(await findGroup(env.DB, g.slug)).toEqual(g);
    expect(await findGroup(env.DB, 'zzzzzzzzzz')).toBeNull();
  });

  it('grava e lista rodadas (mais recentes primeiro, com paginação)', async () => {
    const g = await createGroup(env.DB, 'Galera', 1000);
    for (const t of [10, 30, 20]) await insertRound(env.DB, g.id, rec(t), `k${t}`);
    const page1 = await listRounds(env.DB, g.id, null, 2);
    expect(page1.map((r) => r.playedAt)).toEqual([30, 20]);
    const page2 = await listRounds(env.DB, g.id, 20, 2);
    expect(page2.map((r) => r.playedAt)).toEqual([10]);
    expect(page1[0]).toEqual(expect.objectContaining({ roomCode: 'ABCD', theme: { titulo: 'Comidas', min: 'odeio', max: 'amo' } }));
    expect(page1[0]!.cards[0]).toEqual({ name: 'Ana', color: '#8EC5FF', value: 42, clue: 'pizza', error: false });
    expect((await allRounds(env.DB, g.id)).map((r) => r.playedAt)).toEqual([10, 20, 30]);
  });

  it('rodadas de um grupo não aparecem em outro', async () => {
    const a = await createGroup(env.DB, 'A', 1);
    const b = await createGroup(env.DB, 'B', 1);
    await insertRound(env.DB, a.id, rec(5), 'k5');
    expect(await listRounds(env.DB, b.id, null, 20)).toEqual([]);
  });

  it('gravar a mesma revelação duas vezes deixa uma linha só', async () => {
    const g = await createGroup(env.DB, 'Galera', 1000);
    const r = rec(7);
    await insertRound(env.DB, g.id, r, 'mesma-chave');
    await insertRound(env.DB, g.id, { ...r, id: crypto.randomUUID() }, 'mesma-chave');
    expect(await listRounds(env.DB, g.id, null, 20)).toHaveLength(1);
    await insertRound(env.DB, g.id, { ...r, id: crypto.randomUUID() }, 'outra-chave');
    expect(await listRounds(env.DB, g.id, null, 20)).toHaveLength(2);
  });
});
