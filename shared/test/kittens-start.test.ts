import { describe, expect, it } from 'vitest';
import { applyKittensAction, initialKittensState } from '../src/games/kittens/rules';
import { act, ctxOf, ids, refuse, started } from './kittens-helpers';

describe('começar', () => {
  it('precisa de 2 ativos', () => {
    expect(applyKittensAction(initialKittensState(), 'p0', { type: 'start' }, ctxOf(['p0']))).toEqual({
      ok: false,
      error: 'not_enough_players',
    });
  });

  it('só o host começa', () => {
    expect(refuse(initialKittensState(), 'p1', { type: 'start' }, ctxOf(ids(3)))).toBe('not_host');
  });

  it('distribui 8 cartas pra cada um e a vez é do primeiro assento', () => {
    const { state } = started(3);
    expect(state).toMatchObject({
      phase: 'playing',
      players: ids(3),
      alive: ids(3),
      current: 'p0',
      owed: 1,
      pending: null,
      choice: null,
      peek: null,
      winner: null,
      discard: [],
      out: [],
    });
    for (const p of ids(3)) expect(state.hands[p]).toHaveLength(8);
    expect(state.draw).toHaveLength(52 + 2 - 21 + 2 + 2); // pacote + 2 Latidores − mãos + Desarmes extras + tatus
  });

  it('não começa de novo no meio da partida', () => {
    const { state, ctx } = started(3);
    expect(refuse(state, 'p0', { type: 'start' }, ctx)).toBe('bad_phase');
  });
});

describe('lobby e jogar de novo', () => {
  it('o host volta pro lobby', () => {
    const { state, ctx } = started(3);
    expect(act(state, 'p0', { type: 'lobby' }, ctx)).toEqual(initialKittensState());
    expect(refuse(state, 'p1', { type: 'lobby' }, ctx)).toBe('not_host');
    expect(refuse(initialKittensState(), 'p0', { type: 'lobby' }, ctx)).toBe('bad_phase');
  });

  it('"jogar de novo" só no fim, e começa outra partida com quem está ativo', () => {
    const { state, ctx } = started(3);
    expect(refuse(state, 'p0', { type: 'again' }, ctx)).toBe('bad_phase');
    const over = { ...state, phase: 'gameover' as const, winner: 'p1', current: null };
    const again = act(over, 'p0', { type: 'again' }, ctxOf(['p0', 'p1']));
    expect(again).toMatchObject({ phase: 'playing', players: ['p0', 'p1'], winner: null, current: 'p0' });
  });
});
