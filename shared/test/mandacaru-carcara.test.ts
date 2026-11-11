import { describe, expect, it } from 'vitest';
import type { MandacaruState } from '../src/games/mandacaru/types';
import { MANDACARU_DISCARD_MS } from '../src/games/mandacaru/types';
import { T0, act, corner, ctxOf, ids, res, table, tryAct } from './mandacaru-helpers';

/** Procura uma semente cujo primeiro roll dá 7. */
function sevenCtx() {
  for (let seed = 1; seed < 500; seed++) {
    const rng = ctxOf(ids(3), { seed }).rng;
    const d = Math.floor(rng() * 6) + 1 + Math.floor(rng() * 6) + 1;
    if (d === 7) return ctxOf(ids(3), { seed });
  }
  throw new Error('sem 7');
}

describe('Mandacaru: saiu 7', () => {
  it('quem tem mais de 7 descarta metade; os outros esperam', () => {
    const s0 = table({ phase: 'roll', hands: { p1: { wood: 5, stone: 4 }, p2: { wood: 7 } } });
    let s = act(s0, 'p0', { type: 'roll' }, sevenCtx());
    expect(s.phase).toBe('discard');
    expect(s.discards).toEqual({ p1: 4 });
    expect(s.discardEndsAt).toBe(T0 + MANDACARU_DISCARD_MS);
    expect(tryAct(s, 'p1', { type: 'discard', cards: res({ wood: 3 }) }, sevenCtx())).toEqual({ ok: false, error: 'bad_discard' });
    s = act(s, 'p1', { type: 'discard', cards: res({ wood: 2, stone: 2 }) }, sevenCtx());
    expect(s.hands.p1!.res).toEqual(res({ wood: 3, stone: 2 }));
    expect(s.phase).toBe('carcara');
    expect(s.discardEndsAt).toBeNull();
  });

  it('ninguém com mais de 7: vai direto pro Carcará', () => {
    const s = act(table({ phase: 'roll' }), 'p0', { type: 'roll' }, sevenCtx());
    expect(s.phase).toBe('carcara');
  });

  it('Carcará tem que mudar de terreno; uma vítima só = rouba direto', () => {
    let s: MandacaruState = { ...table({ houses: { [corner(5, 0)]: 'p1' }, hands: { p1: { brick: 1 } } }), phase: 'carcara' };
    expect(tryAct(s, 'p0', { type: 'move_carcara', hex: s.carcara }, ctxOf(ids(3)))).toEqual({ ok: false, error: 'bad_spot' });
    s = act(s, 'p0', { type: 'move_carcara', hex: 5 }, ctxOf(ids(3)));
    expect(s.carcara).toBe(5);
    expect(s.hands.p0!.res.brick).toBe(1);
    expect(s.hands.p1!.res.brick).toBe(0);
    expect(s.lastSteal).toEqual({ thief: 'p0', victim: 'p1', resource: 'brick' });
    expect(s.log.at(-1)).toEqual({ t: 'steal', player: 'p0', from: 'p1' });
    expect(s.phase).toBe('main');
  });

  it('duas vítimas: escolhe de quem; quem não tem carta não é vítima', () => {
    const base = table({
      houses: { [corner(5, 0)]: 'p1', [corner(5, 3)]: 'p2' },
      hands: { p1: { wood: 1 }, p2: { stone: 1 } },
    });
    let s = act({ ...base, phase: 'carcara' }, 'p0', { type: 'move_carcara', hex: 5 }, ctxOf(ids(3)));
    expect(s.phase).toBe('steal');
    expect(tryAct(s, 'p0', { type: 'steal', from: 'p0' }, ctxOf(ids(3)))).toEqual({ ok: false, error: 'bad_target' });
    s = act(s, 'p0', { type: 'steal', from: 'p2' }, ctxOf(ids(3)));
    expect(s.hands.p0!.res.stone).toBe(1);
    const empty = table({ houses: { [corner(5, 0)]: 'p1' } });
    expect(act({ ...empty, phase: 'carcara' }, 'p0', { type: 'move_carcara', hex: 5 }, ctxOf(ids(3))).phase).toBe('main');
  });

  it('Vaqueiro antes dos dados: Carcará e volta pra rolar; conta pra comitiva; 1 cordel por turno', () => {
    const base = table({ phase: 'roll', cordeis: { p0: ['vaqueiro', 'vaqueiro'] } });
    let s = act(base, 'p0', { type: 'play_vaqueiro' }, ctxOf(ids(3)));
    expect(s.phase).toBe('carcara');
    expect(s.knights.p0).toBe(1);
    s = act(s, 'p0', { type: 'move_carcara', hex: 0 }, ctxOf(ids(3)));
    expect(s.phase).toBe('roll');
    expect(tryAct(s, 'p0', { type: 'play_vaqueiro' }, ctxOf(ids(3)))).toEqual({ ok: false, error: 'cordel_used' });
  });

  it('Vaqueiro comprado neste turno não pode', () => {
    const s = table({ cordeis: { p0: [{ kind: 'vaqueiro', fresh: true }] } });
    expect(tryAct(s, 'p0', { type: 'play_vaqueiro' }, ctxOf(ids(3)))).toEqual({ ok: false, error: 'cordel_fresh' });
    expect(tryAct(table(), 'p0', { type: 'play_vaqueiro' }, ctxOf(ids(3)))).toEqual({ ok: false, error: 'no_cordel' });
  });
});
