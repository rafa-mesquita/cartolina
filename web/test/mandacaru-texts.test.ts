import { describe, expect, it } from 'vitest';
import { logLine, nameFrom, resList } from '../src/games/mandacaru/texts';
import { afterSetup, mandacaruRoom, viewOf } from './mandacaru-fixtures';

const nameOf = (id: string) => ({ p0: 'você', p1: 'Bia', p2: 'Léo' })[id] ?? id;
const res = (p: Partial<Record<'wood' | 'brick' | 'leather' | 'beans' | 'stone', number>>) => ({ wood: 0, brick: 0, leather: 0, beans: 0, stone: 0, ...p });

describe('Mandacaru: textos', () => {
  it('lista de recursos', () => {
    expect(resList(res({ wood: 2, stone: 1 }))).toBe('2 madeira e 1 pedra');
    expect(resList(res({ wood: 1, brick: 1, beans: 3 }))).toBe('1 madeira, 1 barro e 3 feijão');
    expect(resList(res({}))).toBe('nada');
  });

  it('roubo não diz o recurso', () => {
    expect(logLine({ t: 'steal', player: 'p1', from: 'p2' }, nameOf).text).not.toMatch(/madeira|barro|couro|feijão|pedra/);
  });

  it('roubo com você de um dos lados não fica "de você"', () => {
    expect(logLine({ t: 'steal', player: 'p0', from: 'p1' }, nameOf).text).not.toMatch(/de você/);
    expect(logLine({ t: 'steal', player: 'p1', from: 'p0' }, nameOf).text).toMatch(/sua/);
  });

  it('dados com ganhos e banco curto', () => {
    const l = logLine({ t: 'roll', player: 'p1', dice: [3, 5], gains: { p0: res({ beans: 2 }) }, short: ['brick'] }, nameOf).text;
    expect(l).toContain('8');
    expect(l).toContain('feijão');
    expect(l).toContain('barro');
  });

  it('7 chama o Carcará; frase começa com maiúscula e destaca quem fez', () => {
    const l = logLine({ t: 'roll', player: 'p0', dice: [3, 4], gains: {}, short: [] }, nameOf);
    expect(l.text).toMatch(/^Você tirou 7/);
    expect(l.text).toContain('Carcará');
    expect(l.strong).toBe('você');
  });

  it('o Carcará diz o terreno quando tem o tabuleiro', () => {
    const layout = { hexes: [{ terrain: 'fields' as const, number: 9 }], ports: [] };
    expect(logLine({ t: 'carcara', player: 'p1', hex: 0 }, nameOf, layout).text).toContain('roçado 9');
  });

  it('toda entrada do diário tem frase', () => {
    const entries = [
      { t: 'start', order: ['p0', 'p1'] },
      { t: 'place', player: 'p0', piece: 'house', at: 1 },
      { t: 'setup_gain', player: 'p0', gain: res({ wood: 1 }) },
      { t: 'discard', player: 'p1', count: 4 },
      { t: 'carcara', player: 'p1', hex: 3 },
      { t: 'build', player: 'p0', piece: 'city', at: 2 },
      { t: 'buy_cordel', player: 'p0' },
      { t: 'play', player: 'p0', kind: 'atravessador', resources: ['beans'], total: 3 },
      { t: 'trade', a: 'p0', b: 'p1', aGives: res({ wood: 2 }), bGives: res({ stone: 1 }) },
      { t: 'feira', player: 'p0', give: 'wood', gave: 4, want: 'stone', got: 1 },
      { t: 'award', award: 'longest', player: 'p2' },
      { t: 'timeout', player: 'p2' },
      { t: 'end_turn', player: 'p2' },
      { t: 'win', player: 'p1', points: 10 },
    ] as const;
    for (const e of entries) expect(logLine(e as never, nameOf).text.length).toBeGreaterThan(3);
  });

  it('nameFrom: "você" pra quem vê, nome da sala pros outros', () => {
    const v = viewOf(afterSetup(mandacaruRoom(3, 1)), 'p1');
    const n = nameFrom(v);
    expect(n('p1')).toBe('você');
    expect(n('p0')).toBe('Ana');
    expect(n('p2')).toBe('Caio');
    expect(n('zz')).toBe('alguém');
    expect(nameFrom(viewOf(mandacaruRoom(3, 1), null))('p1')).toBe('Beto');
  });
});
