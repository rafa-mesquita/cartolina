import { describe, expect, it } from 'vitest';
import { geometry } from '../src/games/mandacaru/board';
import { setupOrder } from '../src/games/mandacaru/rules';
import { MANDACARU_TURN_MS, type MandacaruState } from '../src/games/mandacaru/types';
import { T0, act, corner, ctxOf, edgeBetween, geo, ids, res, table, tryAct } from './mandacaru-helpers';
import { initialMandacaruState } from '../src/games/mandacaru/rules';
import { houseSpots, roadSpots } from '../src/games/mandacaru/build';

const ctx = ctxOf(ids(3));

function started(n = 3, seed = 1): MandacaruState {
  return act(initialMandacaruState(), 'p0', { type: 'start' }, ctxOf(ids(n), { seed }));
}

/** Faz a preparação inteira pondo cada casa no primeiro lugar válido e a estrada no primeiro lado. */
function afterSetup(seed = 1): MandacaruState {
  let s = started(3, seed);
  while (s.phase === 'setup') {
    const p = s.turn!;
    s = act(s, p, { type: 'place_house', vertex: houseSpots(s, p, true)[0]! }, ctx);
    s = act(s, p, { type: 'place_road', edge: roadSpots(s, p, s.setup!.house!)[0]! }, ctx);
  }
  return s;
}

describe('Mandacaru: começo', () => {
  it('só o host começa, com 3 ou 4', () => {
    const s = initialMandacaruState();
    expect(tryAct(s, 'p1', { type: 'start' }, ctxOf(ids(3)))).toEqual({ ok: false, error: 'not_host' });
    expect(tryAct(s, 'p0', { type: 'start' }, ctxOf(ids(2)))).toEqual({ ok: false, error: 'need_3_players' });
    expect(tryAct(s, 'p0', { type: 'start' }, ctxOf(ids(5)))).toEqual({ ok: false, error: 'room_full' });
  });

  it('começa na preparação, com tabuleiro, monte de 25, banco cheio e relógio de 5 min', () => {
    const s = started();
    expect(s.phase).toBe('setup');
    expect(s.match).toBe(1);
    expect([...s.players].sort()).toEqual(ids(3));
    expect(s.turn).toBe(s.players[0]);
    expect(s.deck).toHaveLength(25);
    expect(s.bank).toEqual(res({ wood: 19, brick: 19, leather: 19, beans: 19, stone: 19 }));
    expect(s.layout!.hexes[s.carcara]!.terrain).toBe('desert');
    expect(s.turnEndsAt).toBe(T0 + MANDACARU_TURN_MS);
    expect(s.log[0]).toEqual({ t: 'start', order: s.players });
  });

  it('ordem em cobra', () => {
    expect(setupOrder(['a', 'b', 'c'])).toEqual(['a', 'b', 'c', 'c', 'b', 'a']);
  });
});

describe('Mandacaru: preparação', () => {
  it('casa e depois estrada encostada; fora da vez ou fora do lugar não vale', () => {
    let s = started();
    const [a, b] = s.players;
    const v = houseSpots(s, a!, true)[0]!;
    expect(tryAct(s, b!, { type: 'place_house', vertex: v }, ctx)).toEqual({ ok: false, error: 'not_your_turn' });
    expect(tryAct(s, a!, { type: 'place_road', edge: 0 }, ctx)).toEqual({ ok: false, error: 'bad_phase' });
    s = act(s, a!, { type: 'place_house', vertex: v }, ctx);
    const far = geometry().edges.findIndex((e) => e.a !== v && e.b !== v);
    expect(tryAct(s, a!, { type: 'place_road', edge: far }, ctx)).toEqual({ ok: false, error: 'bad_spot' });
    s = act(s, a!, { type: 'place_road', edge: geo().vertices[v]!.edges[0]! }, ctx);
    expect(s.turn).toBe(b);
    expect(s.setup).toEqual({ index: 1, house: null });
  });

  it('casa colada em outra não vale', () => {
    let s = started();
    const a = s.players[0]!;
    const v = houseSpots(s, a, true)[0]!;
    s = act(s, a, { type: 'place_house', vertex: v }, ctx);
    s = act(s, a, { type: 'place_road', edge: geo().vertices[v]!.edges[0]! }, ctx);
    const n = geo().vertices[v]!.neighbors[0]!;
    expect(tryAct(s, s.turn!, { type: 'place_house', vertex: n }, ctx)).toEqual({ ok: false, error: 'bad_spot' });
  });

  it('a segunda casa rende; depois da cobra, começa o jogo na vez do primeiro', () => {
    const s = afterSetup();
    expect(s.phase).toBe('roll');
    expect(s.turn).toBe(s.players[0]);
    expect(s.buildings.filter(Boolean)).toHaveLength(6);
    expect(s.roads.filter(Boolean)).toHaveLength(6);
    const total = s.players.reduce((acc, p) => acc + Object.values(s.hands[p]!.res).reduce((a, b) => a + b, 0), 0);
    expect(total).toBeGreaterThan(0);
    expect(s.log.some((e) => e.t === 'setup_gain')).toBe(true);
  });
});

describe('Mandacaru: dados e construção', () => {
  it('rolar conta a soma, rende e vai pra fase principal', () => {
    let s = afterSetup(5);
    const p = s.turn!;
    s = act(s, p, { type: 'roll' }, ctx);
    expect(s.rolled).toBe(true);
    const sum = s.dice![0] + s.dice![1];
    expect(s.diceCounts[sum]).toBe(1);
    if (sum !== 7) expect(s.phase).toBe('main');
    expect(tryAct(s, p, { type: 'roll' }, ctx)).toEqual({ ok: false, error: 'bad_phase' });
  });

  it('constrói estrada, casa e vila pagando; sem dinheiro ou lugar não vale', () => {
    const a = corner(9, 0);
    const b = geo().vertices[a]!.neighbors[0]!;
    const c = geo().vertices[b]!.neighbors.find((x) => x !== a)!;
    let s = table({ houses: { [a]: 'p0' }, hands: { p0: { wood: 3, brick: 3, leather: 1, beans: 3, stone: 3 } } });
    s = act(s, 'p0', { type: 'build_road', edge: edgeBetween(a, b) }, ctx);
    s = act(s, 'p0', { type: 'build_road', edge: edgeBetween(b, c) }, ctx);
    s = act(s, 'p0', { type: 'build_house', vertex: c }, ctx);
    s = act(s, 'p0', { type: 'build_city', vertex: a }, ctx);
    expect(s.buildings[c]).toEqual({ owner: 'p0', kind: 'house' });
    expect(s.buildings[a]).toEqual({ owner: 'p0', kind: 'city' });
    expect(s.hands.p0!.res).toEqual(res({ wood: 0, brick: 0, leather: 0, beans: 0, stone: 0 }));
    expect(tryAct(s, 'p0', { type: 'build_road', edge: geo().vertices[c]!.edges.find((e) => s.roads[e] === null)! }, ctx)).toEqual({
      ok: false,
      error: 'cannot_afford',
    });
    expect(tryAct(table({ hands: { p0: { wood: 1, brick: 1 } } }), 'p0', { type: 'build_road', edge: 0 }, ctx)).toEqual({ ok: false, error: 'bad_spot' });
  });

  it('compra cordel novo (não dá pra jogar no mesmo turno); monte vazio não vende', () => {
    let s = table({ hands: { p0: { leather: 2, beans: 2, stone: 2 } }, deck: ['vaqueiro'] });
    s = act(s, 'p0', { type: 'buy_cordel' }, ctx);
    expect(s.hands.p0!.cordeis).toEqual([{ kind: 'vaqueiro', fresh: true }]);
    expect(s.deck).toEqual([]);
    expect(tryAct(s, 'p0', { type: 'buy_cordel' }, ctx)).toEqual({ ok: false, error: 'deck_empty' });
  });

  it('passar a vez: próximo jogador, fase roll, cordel deixa de ser novo, relógio novo', () => {
    const s0 = table({ cordeis: { p0: [{ kind: 'vaqueiro', fresh: true }] } });
    const s = act(s0, 'p0', { type: 'end_turn' }, ctxOf(ids(3), { now: T0 + 1000 }));
    expect(s.turn).toBe('p1');
    expect(s.phase).toBe('roll');
    expect(s.rolled).toBe(false);
    expect(s.hands.p0!.cordeis[0]!.fresh).toBe(false);
    expect(s.turnEndsAt).toBe(T0 + 1000 + MANDACARU_TURN_MS);
    expect(s.turns).toBe(1);
  });

  it('chega a 10 na própria vez: vence na hora', () => {
    const houses = { [corner(0, 0)]: 'p0', [corner(2, 3)]: 'p0', [corner(16, 0)]: 'p0' };
    const cities = { [corner(7, 0)]: 'p0', [corner(11, 3)]: 'p0', [corner(14, 1)]: 'p0' };
    // 3 casas + 3 vilas = 9; um cordel de Ponto comprado dá 10
    const s = act(table({ houses, cities, hands: { p0: { leather: 1, beans: 1, stone: 1 } }, deck: ['point'] }), 'p0', { type: 'buy_cordel' }, ctx);
    expect(s.phase).toBe('over');
    expect(s.winner).toBe('p0');
    expect(s.wins.p0).toBe(1);
    expect(s.log.at(-1)).toEqual({ t: 'win', player: 'p0', points: 10 });
  });
});
