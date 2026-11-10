import { describe, expect, it } from 'vitest';
import { canAfford, citySpots, grant, handSize, houseSpots, pay, piecesLeft, points, portRates, roadSpots } from '../src/games/mandacaru/build';
import { COSTS } from '../src/games/mandacaru/types';
import { corner, edgeBetween, geo, res, table } from './mandacaru-helpers';

describe('Mandacaru: construção', () => {
  it('custo: dá ou não dá, pagar devolve ao banco, ganhar tira do banco', () => {
    expect(canAfford(res({ wood: 1, brick: 1 }), COSTS.road)).toBe(true);
    expect(canAfford(res({ wood: 1 }), COSTS.road)).toBe(false);
    const s = table({ hands: { p0: { wood: 2, brick: 1 } } });
    const paid = pay(s, 'p0', COSTS.road);
    expect(paid.hands.p0!.res).toMatchObject({ wood: 1, brick: 0 });
    expect(paid.bank.wood).toBe(s.bank.wood + 1);
    const got = grant(s, 'p1', res({ stone: 2 }));
    expect(got.hands.p1!.res.stone).toBe(2);
    expect(got.bank.stone).toBe(s.bank.stone - 2);
    expect(handSize(res({ wood: 2, beans: 3 }))).toBe(5);
  });

  it('casa na preparação: qualquer canto vazio longe 2 lados de outra casa', () => {
    const v = corner(9, 0);
    const s = table({ houses: { [v]: 'p1' } });
    const spots = houseSpots(s, 'p0', true);
    expect(spots).not.toContain(v);
    for (const n of geo().vertices[v]!.neighbors) expect(spots).not.toContain(n);
    expect(spots).toHaveLength(54 - 1 - geo().vertices[v]!.neighbors.length);
  });

  it('casa no jogo: precisa de estrada sua encostada', () => {
    const a = corner(9, 0);
    const b = geo().vertices[a]!.neighbors[0]!;
    const c = geo().vertices[b]!.neighbors.find((x) => x !== a)!;
    const s = table({ houses: { [a]: 'p0' }, roads: { [edgeBetween(a, b)]: 'p0', [edgeBetween(b, c)]: 'p0' } });
    expect(houseSpots(s, 'p0', false)).toEqual([c]); // b é vizinho da casa; c está a 2 lados
    expect(houseSpots(s, 'p1', false)).toEqual([]);
  });

  it('estrada liga na sua casa ou estrada; casa de outro no meio corta', () => {
    const a = corner(9, 0);
    const b = geo().vertices[a]!.neighbors[0]!;
    const s = table({ houses: { [a]: 'p0' } });
    const spots = roadSpots(s, 'p0');
    expect(spots.sort((x, y) => x - y)).toEqual([...geo().vertices[a]!.edges].sort((x, y) => x - y));
    const withRoad = table({ houses: { [a]: 'p0', [b]: 'p1' }, roads: { [edgeBetween(a, b)]: 'p0' } });
    // a estrada chega em b, mas b tem casa do p1: não continua por b
    for (const e of geo().vertices[b]!.edges) if (e !== edgeBetween(a, b)) expect(roadSpots(withRoad, 'p0')).not.toContain(e);
  });

  it('estrada da preparação: só encostada no canto dado', () => {
    const a = corner(5, 2);
    const s = table({ houses: { [a]: 'p0' } });
    expect(roadSpots(s, 'p0', a).sort((x, y) => x - y)).toEqual([...geo().vertices[a]!.edges].sort((x, y) => x - y));
  });

  it('vila só no lugar de casa sua; peças restantes', () => {
    const a = corner(9, 0);
    const b = corner(9, 3);
    const s = table({ houses: { [a]: 'p0' }, cities: { [b]: 'p0' }, roads: { [geo().vertices[a]!.edges[0]!]: 'p0' } });
    expect(citySpots(s, 'p0')).toEqual([a]);
    expect(piecesLeft(s, 'p0')).toEqual({ road: 14, house: 4, city: 3 });
  });

  it('feira: 4 sem nada, 3 na comum, 2 na do recurso', () => {
    const g = geo();
    const generic = g.ports[0]!; // FIXED_LAYOUT.ports[0] = generic
    const wood = g.ports[1]!; // FIXED_LAYOUT.ports[1] = wood
    expect(portRates(table(), 'p0')).toEqual({ wood: 4, brick: 4, leather: 4, beans: 4, stone: 4 });
    expect(portRates(table({ houses: { [generic.vertices[0]]: 'p0' } }), 'p0')).toEqual({ wood: 3, brick: 3, leather: 3, beans: 3, stone: 3 });
    expect(portRates(table({ cities: { [wood.vertices[1]]: 'p0' } }), 'p0')).toEqual({ wood: 2, brick: 4, leather: 4, beans: 4, stone: 4 });
  });

  it('pontos: casa 1, vila 2, prêmios 2, cordel de Ponto só com hidden', () => {
    const s = {
      ...table({ houses: { [corner(0, 0)]: 'p0' }, cities: { [corner(18, 3)]: 'p0' }, cordeis: { p0: ['point', 'vaqueiro'] } }),
      longestRoad: 'p0',
      largestArmy: 'p1',
    };
    expect(points(s, 'p0', false)).toBe(5);
    expect(points(s, 'p0', true)).toBe(6);
    expect(points(s, 'p1', false)).toBe(2);
  });
});
