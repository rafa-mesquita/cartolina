import { mandacaruGeometry, noResources, type BoardLayout, type Building, type HexTile, type MandacaruLogEntry, type Resources } from '@cartolina/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { arcPoint, motionOk, rollFlights } from '../src/games/mandacaru/rollFlights';

const geo = mandacaruGeometry();
type Roll = Extract<MandacaruLogEntry, { t: 'roll' }>;

/** Tabuleiro de 19 terrenos rio seco sem número, com os terrenos dados por cima. */
function layout(tiles: Record<number, HexTile>): BoardLayout {
  return { hexes: geo.hexes.map((_, i) => tiles[i] ?? { terrain: 'desert', number: null }), ports: [] };
}
const gain = (g: Partial<Resources>): Resources => ({ ...noResources(), ...g });
const roll = (dice: [number, number], gains: Record<string, Resources>): Roll => ({ t: 'roll', player: 'p0', dice, gains, short: [] });
function build(list: [number, Building][]): (Building | null)[] {
  const b: (Building | null)[] = geo.vertices.map(() => null);
  for (const [v, x] of list) b[v] = x;
  return b;
}

/** Dois terrenos vizinhos (dividem dois cantos) e um canto só do primeiro. */
const A = 0;
const B = geo.hexes[0]!.neighbors[0]!;
const shared = geo.hexes[A]!.corners.find((v) => geo.hexes[B]!.corners.includes(v))!;
const onlyA = geo.hexes[A]!.corners.find((v) => !geo.hexes[B]!.corners.includes(v))!;

describe('rollFlights: de onde e pra quem voam as cartas', () => {
  it('sai do terreno com o número que dá o recurso e encosta na peça do jogador', () => {
    const lay = layout({ [A]: { terrain: 'forest', number: 6 }, [B]: { terrain: 'fields', number: 6 } });
    const blds = build([[shared, { owner: 'p1', kind: 'house' }]]);
    const f = rollFlights(roll([3, 3], { p1: gain({ wood: 1, beans: 1 }) }), lay, blds, -1, ['p0', 'p1']);
    expect(f).toEqual([
      { player: 'p1', resource: 'wood', hex: A, n: 1 },
      { player: 'p1', resource: 'beans', hex: B, n: 1 },
    ]);
  });

  it('vila conta 2; dois jogadores no mesmo terreno saem na ordem de jogo', () => {
    const lay = layout({ [A]: { terrain: 'hills', number: 8 } });
    const blds = build([
      [shared, { owner: 'p2', kind: 'city' }],
      [onlyA, { owner: 'p0', kind: 'house' }],
    ]);
    const f = rollFlights(roll([4, 4], { p2: gain({ brick: 2 }), p0: gain({ brick: 1 }) }), lay, blds, -1, ['p0', 'p1', 'p2']);
    expect(f).toEqual([
      { player: 'p0', resource: 'brick', hex: A, n: 1 },
      { player: 'p2', resource: 'brick', hex: A, n: 2 },
    ]);
  });

  it('o terreno do Carcará não manda carta; dois terrenos com o mesmo número mandam cada um a sua', () => {
    const lay = layout({ [A]: { terrain: 'pasture', number: 5 }, [B]: { terrain: 'pasture', number: 5 } });
    const blds = build([[shared, { owner: 'p0', kind: 'house' }]]);
    expect(rollFlights(roll([2, 3], { p0: gain({ leather: 2 }) }), lay, blds, -1)).toEqual([
      { player: 'p0', resource: 'leather', hex: A, n: 1 },
      { player: 'p0', resource: 'leather', hex: B, n: 1 },
    ]);
    expect(rollFlights(roll([2, 3], { p0: gain({ leather: 1 }) }), lay, blds, A)).toEqual([{ player: 'p0', resource: 'leather', hex: B, n: 1 }]);
  });

  it('banco curto (ganhou menos do que os terrenos dariam): corta as cartas', () => {
    const lay = layout({ [A]: { terrain: 'mountains', number: 9 }, [B]: { terrain: 'mountains', number: 9 } });
    const blds = build([[shared, { owner: 'p0', kind: 'city' }]]);
    expect(rollFlights(roll([4, 5], { p0: gain({ stone: 1 }) }), lay, blds, -1)).toEqual([{ player: 'p0', resource: 'stone', hex: A, n: 1 }]);
  });

  it('nada no 7, sem tabuleiro ou sem ganho; tabuleiro mudado = sai do terreno com o número', () => {
    const lay = layout({ [A]: { terrain: 'forest', number: 4 } });
    expect(rollFlights(roll([3, 4], {}), lay, build([]), -1)).toEqual([]);
    expect(rollFlights(roll([2, 2], { p0: gain({ wood: 1 }) }), null, build([]), -1)).toEqual([]);
    expect(rollFlights(roll([2, 2], { p0: gain({}) }), lay, build([]), -1)).toEqual([]);
    // ninguém encosta no terreno (a peça sumiu da visão): a carta sai mesmo assim do terreno do número
    expect(rollFlights(roll([2, 2], { p0: gain({ wood: 1 }) }), lay, build([]), -1)).toEqual([{ player: 'p0', resource: 'wood', hex: A, n: 1 }]);
  });
});

describe('arcPoint e motionOk', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('a curva começa e termina nos pontos e sobe no meio', () => {
    const a = { x: 0, y: 100 };
    const b = { x: 200, y: 100 };
    expect(arcPoint(a, b, 0)).toEqual(a);
    expect(arcPoint(a, b, 1)).toEqual(b);
    const mid = arcPoint(a, b, 0.5);
    expect(mid.x).toBeCloseTo(100);
    expect(mid.y).toBeLessThan(100);
  });

  it('sem matchMedia, anima; com movimento reduzido, não', () => {
    expect(motionOk()).toBe(true);
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q === '(prefers-reduced-motion: reduce)' }));
    expect(motionOk()).toBe(false);
  });
});
