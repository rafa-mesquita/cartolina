import { describe, expect, it } from 'vitest';
import { DIXIT_DECK_SIZE } from '../src/games/dixit/deck';
import { applyDixitAction, cleanDixitClue, dixitDeckTooSmall, initialDixitState } from '../src/games/dixit/rules';
import { act, ctxOf, ids, started } from './dixit-helpers';

describe('Dixit: lobby e início', () => {
  it('estado inicial é o lobby com meta 30', () => {
    expect(initialDixitState()).toMatchObject({ phase: 'lobby', target: 30, players: [], storyteller: null });
  });

  it('host troca a meta no lobby; outros não', () => {
    const ctx = ctxOf(ids(3));
    const s = act(initialDixitState(), 'p0', { type: 'setTarget', target: 15 }, ctx);
    expect(s.target).toBe(15);
    expect(applyDixitAction(s, 'p1', { type: 'setTarget', target: 30 }, ctx)).toEqual({ ok: false, error: 'not_host' });
  });

  it('precisa de 3 jogadores ativos', () => {
    const res = applyDixitAction(initialDixitState(), 'p0', { type: 'start' }, ctxOf(ids(2)));
    expect(res).toEqual({ ok: false, error: 'need_3_players' });
  });

  it('só o host começa', () => {
    expect(applyDixitAction(initialDixitState(), 'p1', { type: 'start' }, ctxOf(ids(3)))).toEqual({ ok: false, error: 'not_host' });
  });

  it('com 4 jogadores: 6 cartas cada, narrador sorteado, placar zerado', () => {
    const { state } = started(4);
    expect(state.phase).toBe('storytelling');
    expect(state.players).toEqual(ids(4));
    expect(state.inRound).toEqual(ids(4));
    for (const p of ids(4)) expect(state.hands[p]).toHaveLength(6);
    expect(state.deck).toHaveLength(DIXIT_DECK_SIZE - 24);
    expect(state.scores).toEqual({ p0: 0, p1: 0, p2: 0, p3: 0 });
    expect(ids(4)).toContain(state.storyteller);
    const all = [...state.deck, ...Object.values(state.hands).flat()];
    expect(new Set(all).size).toBe(DIXIT_DECK_SIZE);
  });

  it('com 3 jogadores: 7 cartas cada', () => {
    const { state } = started(3);
    for (const p of ids(3)) expect(state.hands[p]).toHaveLength(7);
  });

  it('baralho mínimo é jogadores × 7', () => {
    expect(dixitDeckTooSmall(10, 69)).toBe(true);
    expect(dixitDeckTooSmall(10, 70)).toBe(false);
    expect(dixitDeckTooSmall(10)).toBe(false);
  });

  it('voltar pro lobby mantém a meta; no lobby não dá', () => {
    const ctx = ctxOf(ids(3));
    const s = act(act(initialDixitState(15), 'p0', { type: 'start' }, ctx), 'p0', { type: 'lobby' }, ctx);
    expect(s).toEqual(initialDixitState(15));
    expect(applyDixitAction(s, 'p0', { type: 'lobby' }, ctx)).toEqual({ ok: false, error: 'bad_phase' });
  });

  it('limpa a dica: espaços e até 80 caracteres', () => {
    expect(cleanDixitClue('  uma   saudade\n')).toBe('uma saudade');
    expect(Array.from(cleanDixitClue('a'.repeat(200)))).toHaveLength(80);
  });
});
