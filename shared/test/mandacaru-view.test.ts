import { describe, expect, it } from 'vitest';
import { mandacaru, mandacaruNextDeadline, mandacaruViewFor } from '../src/games/mandacaru/view';
import { MANDACARU_DISCARD_MS, MANDACARU_TURN_MS } from '../src/games/mandacaru/types';
import { T0, corner, res, table } from './mandacaru-helpers';

describe('Mandacaru: visão', () => {
  const s = {
    ...table({ hands: { p0: { wood: 2 }, p1: { stone: 3 } }, cordeis: { p0: ['point'], p1: ['vaqueiro'] }, houses: { [corner(5, 0)]: 'p0' } }),
    lastSteal: { thief: 'p0', victim: 'p1', resource: 'stone' as const },
  };

  it('você vê suas cartas; dos outros, só quantas', () => {
    const v = mandacaruViewFor(s, 'p0');
    expect(v.myRes).toEqual(res({ wood: 2 }));
    expect(v.myCordeis).toEqual([{ kind: 'point', fresh: false }]);
    expect(v.myPoints).toBe(2);
    const p1 = v.seats.find((x) => x.id === 'p1')!;
    expect(p1).toMatchObject({ resCount: 3, cordelCount: 1 });
    expect(v.seats.find((x) => x.id === 'p0')!.points).toBe(1);
    expect(JSON.stringify(v)).not.toContain('vaqueiro');
    expect(v).not.toHaveProperty('deck');
    expect(v.deckSize).toBe(5);
  });

  it('quem assiste não vê mão nenhuma; o roubo só aparece pros dois', () => {
    const w = mandacaruViewFor(s, null);
    expect(w.myRes).toBeNull();
    expect(w.myCordeis).toEqual([]);
    expect(w.stolen).toBeNull();
    expect(mandacaruViewFor(s, 'p2').stolen).toBeNull();
    expect(mandacaruViewFor(s, 'p1').stolen).toEqual(s.lastSteal);
  });

  it('no fim, os Pontos aparecem', () => {
    const v = mandacaruViewFor({ ...s, phase: 'over', winner: 'p0' }, 'p2');
    expect(v.pointCards).toEqual({ p0: 1, p1: 0, p2: 0 });
    expect(v.seats.find((x) => x.id === 'p0')!.points).toBe(2);
  });

  it('can: só quem está na vez constrói; os outros respondem e propõem', () => {
    const me = mandacaruViewFor(s, 'p0').can;
    expect(me.endTurn).toBe(true);
    expect(me.offer).toBe(true);
    expect(me.feira).toEqual({ wood: 4, brick: 4, leather: 4, beans: 4, stone: 4 });
    const other = mandacaruViewFor(s, 'p1').can;
    expect(other.endTurn).toBe(false);
    expect(other.propose).toBe(true);
    expect(other.play).toEqual([]);
  });

  it('can.play: Chuva só se o banco cobre 2 recursos; Mutirão só com peça e lugar de estrada', () => {
    const a = corner(9, 0);
    const c = table({ houses: { [a]: 'p0' }, cordeis: { p0: ['chuva', 'mutirao'] } });
    expect(mandacaruViewFor(c, 'p0').can.play).toEqual(['chuva', 'mutirao']);
    expect(mandacaruViewFor({ ...c, bank: res({ wood: 1 }) }, 'p0').can.play).toEqual(['mutirao']);
    expect(mandacaruViewFor({ ...c, bank: res() }, 'p0').can.play).toEqual(['mutirao']);
    expect(mandacaruViewFor({ ...c, bank: res({ wood: 1, stone: 1 }) }, 'p0').can.play).toEqual(['chuva', 'mutirao']);
    expect(mandacaruViewFor({ ...c, bank: res({ stone: 2 }) }, 'p0').can.play).toEqual(['chuva', 'mutirao']);
    // Sem casa/estrada: nenhum lugar de estrada.
    expect(mandacaruViewFor(table({ cordeis: { p0: ['mutirao'] } }), 'p0').can.play).toEqual([]);
    // As 15 estradas já no tabuleiro: sem peça.
    const roads = Object.fromEntries(Array.from({ length: 15 }, (_, i) => [40 + i, 'p0']));
    expect(mandacaruViewFor(table({ houses: { [a]: 'p0' }, roads, cordeis: { p0: ['mutirao'] } }), 'p0').can.play).toEqual([]);
  });

  it('prazo: o menor entre turno e descarte', () => {
    expect(mandacaruNextDeadline(s)).toBe(T0 + MANDACARU_TURN_MS);
    expect(mandacaruNextDeadline({ ...s, phase: 'discard', discardEndsAt: T0 + MANDACARU_DISCARD_MS })).toBe(T0 + MANDACARU_DISCARD_MS);
    expect(mandacaruNextDeadline({ ...s, phase: 'over', turnEndsAt: null })).toBeNull();
    expect(mandacaru.id).toBe('mandacaru');
  });

  it('prazo: no descarte com o turno já estourado, vale só o do descarte (senão o alarme fica no passado)', () => {
    const d = { ...s, phase: 'discard' as const, discards: { p1: 4 }, turnEndsAt: T0 - 1, discardEndsAt: T0 + MANDACARU_DISCARD_MS };
    expect(mandacaruNextDeadline(d)).toBe(T0 + MANDACARU_DISCARD_MS);
    // Fora do descarte, um `discardEndsAt` que sobrou não conta.
    expect(mandacaruNextDeadline({ ...s, discardEndsAt: T0 - 1 })).toBe(T0 + MANDACARU_TURN_MS);
  });
});
