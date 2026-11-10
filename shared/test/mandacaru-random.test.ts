import { describe, expect, it } from 'vitest';
import { mulberry32, randomInt } from '../src/rng';
import { initialMandacaruState } from '../src/games/mandacaru/rules';
import { mandacaruViewFor } from '../src/games/mandacaru/view';
import { MANDACARU_BANK_EACH, MANDACARU_PIECES, RESOURCES, type MandacaruAction, type MandacaruState, type Resources } from '../src/games/mandacaru/types';
import { act, ctxOf, ids } from './mandacaru-helpers';

/** Uma ação válida sorteada pra `p`, a partir do `can` da visão dele (null = nada a fazer). */
function pick(s: MandacaruState, p: string, rand: () => number): MandacaruAction | null {
  const v = mandacaruViewFor(s, p);
  const c = v.can;
  const one = <T>(xs: T[]) => xs[Math.floor(rand() * xs.length)]!;
  if (c.placeHouse.length) return { type: 'place_house', vertex: one(c.placeHouse) };
  if (c.placeRoad.length) return { type: 'place_road', edge: one(c.placeRoad) };
  if (c.discard > 0) {
    const cards: Resources = { wood: 0, brick: 0, leather: 0, beans: 0, stone: 0 };
    const hand = RESOURCES.flatMap((r) => Array<typeof r>(v.myRes![r]).fill(r));
    for (let i = 0; i < c.discard; i++) cards[hand.splice(Math.floor(rand() * hand.length), 1)[0]!]++;
    return { type: 'discard', cards };
  }
  if (c.carcara.length) return { type: 'move_carcara', hex: one(c.carcara) };
  if (c.steal.length) return { type: 'steal', from: one(c.steal) };
  if (c.roll) return c.play.includes('vaqueiro') && rand() < 0.3 ? { type: 'play_vaqueiro' } : { type: 'roll' };
  if (s.phase === 'mutirao' && c.buildRoad.length) return { type: 'build_road', edge: one(c.buildRoad) };
  const options: MandacaruAction[] = [];
  if (c.buildCity.length) options.push({ type: 'build_city', vertex: one(c.buildCity) });
  if (c.buildHouse.length) options.push({ type: 'build_house', vertex: one(c.buildHouse) });
  if (c.buildRoad.length && rand() < 0.5) options.push({ type: 'build_road', edge: one(c.buildRoad) });
  if (c.buyCordel) options.push({ type: 'buy_cordel' });
  for (const k of c.play) {
    if (k === 'vaqueiro') options.push({ type: 'play_vaqueiro' });
    if (k === 'mutirao') options.push({ type: 'play_mutirao' });
    if (k === 'chuva') {
      // o banco precisa ter as duas (podem ser iguais)
      const first = RESOURCES.filter((r) => v.bank[r] > 0);
      if (first.length) {
        const a = one(first);
        const second = RESOURCES.filter((r) => v.bank[r] > (r === a ? 1 : 0));
        if (second.length) options.push({ type: 'play_chuva', resources: [a, one(second)] });
      }
    }
    if (k === 'atravessador') options.push({ type: 'play_atravessador', resource: one([...RESOURCES]) });
  }
  for (const [give, rate] of Object.entries(c.feira)) {
    const wanted = RESOURCES.filter((r) => r !== give && v.bank[r] > 0);
    if (wanted.length && v.myRes![give as keyof Resources] >= rate!) options.push({ type: 'feira', give: give as keyof Resources, want: one(wanted) });
  }
  if (options.length && rand() < 0.85) return one(options);
  return c.endTurn ? { type: 'end_turn' } : null;
}

function invariants(s: MandacaruState) {
  for (const r of RESOURCES) {
    const total = s.bank[r] + s.players.reduce((a, p) => a + s.hands[p]!.res[r], 0);
    expect(total).toBe(MANDACARU_BANK_EACH);
  }
  for (const p of s.players) {
    expect(s.roads.filter((o) => o === p).length).toBeLessThanOrEqual(MANDACARU_PIECES.road);
    expect(s.buildings.filter((b) => b?.owner === p && b.kind === 'house').length).toBeLessThanOrEqual(MANDACARU_PIECES.house);
    expect(s.buildings.filter((b) => b?.owner === p && b.kind === 'city').length).toBeLessThanOrEqual(MANDACARU_PIECES.city);
  }
}

describe('Mandacaru: partidas sorteadas', () => {
  for (const n of [3, 4]) {
    for (let seed = 1; seed <= 6; seed++) {
      it(`${n} jogadores, semente ${seed}: termina sem erro e sem sumir carta`, () => {
        const rand = mulberry32(seed * 101);
        let s = act(initialMandacaruState(), 'p0', { type: 'start' }, ctxOf(ids(n), { seed }));
        for (let step = 0; step < 6000 && s.phase !== 'over'; step++) {
          // descarte: qualquer um que deve; senão quem está na vez
          const who = Object.keys(s.discards)[0] ?? s.turn!;
          const a = pick(s, who, rand);
          if (a === null) throw new Error(`travou na fase ${s.phase}`);
          s = act(s, who, a, ctxOf(ids(n), { seed: randomInt(rand, 1e9) }));
          invariants(s);
        }
        expect(s.phase).toBe('over');
      });
    }
  }
});
