import { describe, expect, it } from 'vitest';
import { settleMandacaru } from '../src/games/mandacaru/auto';
import { initialMandacaruState } from '../src/games/mandacaru/rules';
import { MANDACARU_DISCARD_MS, MANDACARU_TURN_MS } from '../src/games/mandacaru/types';
import { T0, act, ctxOf, deepFreeze, ids, res, table } from './mandacaru-helpers';

describe('Mandacaru: automático', () => {
  it('nada a fazer: devolve o mesmo objeto', () => {
    const s = deepFreeze(table());
    expect(settleMandacaru(s, ctxOf(ids(3)))).toBe(s);
    const lobby = deepFreeze(initialMandacaruState());
    expect(settleMandacaru(lobby, ctxOf(ids(3)))).toBe(lobby);
  });

  it('acabou o turno na fase principal: passa a vez e anota no diário', () => {
    const s = settleMandacaru(deepFreeze(table()), ctxOf(ids(3), { now: T0 + MANDACARU_TURN_MS }));
    expect(s.turn).toBe('p1');
    expect(s.log.some((e) => e.t === 'timeout' && e.player === 'p0')).toBe(true);
  });

  it('acabou o turno antes dos dados: rola e segue', () => {
    const s = settleMandacaru(deepFreeze(table({ phase: 'roll' })), ctxOf(ids(3), { now: T0 + MANDACARU_TURN_MS }));
    expect(s.diceCounts.reduce((a, b) => a + b, 0)).toBe(1);
    expect(s.turn).not.toBe('p0');
  });

  it('ausente na vez: rola e passa na hora', () => {
    const s = settleMandacaru(deepFreeze(table({ phase: 'roll' })), ctxOf(['p1', 'p2']));
    expect(s.turn).toBe('p1');
  });

  it('descarte: prazo vencido descarta sorteado', () => {
    const s0 = { ...table({ hands: { p1: { wood: 8 } } }), phase: 'discard' as const, discards: { p1: 4 }, discardEndsAt: T0 + MANDACARU_DISCARD_MS };
    expect(settleMandacaru(deepFreeze(s0), ctxOf(ids(3), { now: T0 + 10 }))).toBe(s0);
    const s = settleMandacaru(deepFreeze(s0), ctxOf(ids(3), { now: T0 + MANDACARU_DISCARD_MS }));
    expect(s.hands.p1!.res).toEqual(res({ wood: 4 }));
    expect(s.phase).toBe('carcara');
  });

  it('preparação de ausente: põe casa e estrada', () => {
    const s0 = act(initialMandacaruState(), 'p0', { type: 'start' }, ctxOf(ids(3)));
    const first = s0.turn!;
    const s = settleMandacaru(deepFreeze(s0), ctxOf(ids(3).filter((p) => p !== first)));
    expect(s.buildings.filter((b) => b?.owner === first)).toHaveLength(s.turn === first ? 2 : 1);
    expect(s.roads.filter((o) => o === first).length).toBeGreaterThanOrEqual(1);
  });

  it('todo mundo ausente: o jogo anda sem laço infinito', () => {
    const s0 = act(initialMandacaruState(), 'p0', { type: 'start' }, ctxOf(ids(3)));
    const s = settleMandacaru(deepFreeze(s0), ctxOf([]));
    expect(s.phase === 'over' || s.turns > 10).toBe(true);
  });
});
