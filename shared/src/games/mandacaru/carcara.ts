import type { GameContext } from '../../game';
import { randomInt, type Rng } from '../../rng';
import { geometry } from './board';
import { fail, handSize, logged, ok, pay, type MandacaruResult } from './build';
import { takeCordel } from './cordel';
import { updateAwards } from './longest';
import {
  MANDACARU_DISCARD_MS,
  MANDACARU_HAND_LIMIT,
  RESOURCES,
  noResources,
  type MandacaruState,
  type Resource,
  type Resources,
} from './types';

/** Uma carta sorteada da mão (cada carta com o mesmo peso, na ordem de `RESOURCES`). */
export function pickCard(rng: Rng, hand: Resources): Resource {
  const cards = RESOURCES.flatMap((r) => Array<Resource>(hand[r]).fill(r));
  return cards[randomInt(rng, cards.length)]!;
}

/** `count` cartas sorteadas uma a uma da mão (o descarte automático). */
export function randomCards(rng: Rng, hand: Resources, count: number): Resources {
  const left = { ...hand };
  const out = noResources();
  for (let i = 0; i < count; i++) {
    const r = pickCard(rng, left);
    left[r]--;
    out[r]++;
  }
  return out;
}

/** Saiu 7: quem tem mais de 7 descarta metade (todos ao mesmo tempo, 60 s); ninguém = direto pro Carcará. */
export function startSeven(state: MandacaruState, ctx: GameContext): MandacaruState {
  const discards: Record<string, number> = {};
  for (const p of state.players) {
    const n = handSize(state.hands[p]!.res);
    if (n > MANDACARU_HAND_LIMIT) discards[p] = Math.floor(n / 2);
  }
  const s: MandacaruState = { ...state, afterCarcara: 'main', discards };
  if (Object.keys(discards).length === 0) return { ...s, phase: 'carcara', discardEndsAt: null };
  return { ...s, phase: 'discard', discardEndsAt: ctx.now + MANDACARU_DISCARD_MS };
}

/** `player` descarta exatamente o que deve (`cards`); quando ninguém mais deve, vai pro Carcará. */
export function discard(state: MandacaruState, player: string, cards: Resources): MandacaruResult {
  const owed = state.discards[player];
  if (owed === undefined) return fail('bad_phase');
  const hand = state.hands[player]!.res;
  const fits = RESOURCES.every((r) => Number.isInteger(cards[r]) && cards[r] >= 0 && cards[r] <= hand[r]);
  if (!fits || handSize(cards) !== owed) return fail('bad_discard');
  const discards = { ...state.discards };
  delete discards[player];
  const s = logged({ ...pay(state, player, cards), discards }, { t: 'discard', player, count: owed });
  return ok(Object.keys(discards).length === 0 ? { ...s, phase: 'carcara', discardEndsAt: null } : s);
}

/** Quem dá pra roubar com o Carcará em `hex`: donos de casa/vila nos cantos, menos `thief`, com carta na mão. */
export function victims(state: MandacaruState, hex: number, thief: string): string[] {
  const owners = new Set(geometry().hexes[hex]!.corners.map((v) => state.buildings[v]?.owner));
  return state.players.filter((p) => p !== thief && owners.has(p) && handSize(state.hands[p]!.res) > 0);
}

/** Rouba 1 carta sorteada de `from` e volta pra fase de onde veio o Carcará. */
function robbed(state: MandacaruState, thief: string, from: string, ctx: GameContext): MandacaruState {
  const resource = pickCard(ctx.rng, state.hands[from]!.res);
  const victim = state.hands[from]!;
  const mine = state.hands[thief]!;
  const hands = {
    ...state.hands,
    [from]: { ...victim, res: { ...victim.res, [resource]: victim.res[resource] - 1 } },
    [thief]: { ...mine, res: { ...mine.res, [resource]: mine.res[resource] + 1 } },
  };
  const s: MandacaruState = { ...state, hands, lastSteal: { thief, victim: from, resource }, phase: state.afterCarcara };
  return logged(s, { t: 'steal', player: thief, from });
}

/** Quem está na vez muda o Carcará pra outro terreno; rouba direto se só tem uma vítima. */
export function moveCarcara(state: MandacaruState, player: string, hex: number, ctx: GameContext): MandacaruResult {
  const count = state.layout?.hexes.length ?? 0;
  if (!Number.isInteger(hex) || hex < 0 || hex >= count || hex === state.carcara) return fail('bad_spot');
  const s = logged({ ...state, carcara: hex }, { t: 'carcara', player, hex });
  const who = victims(s, hex, player);
  if (who.length === 0) return ok({ ...s, phase: s.afterCarcara });
  if (who.length === 1) return ok(robbed(s, player, who[0]!, ctx));
  return ok({ ...s, phase: 'steal' });
}

/** Na fase `steal`: escolhe de quem roubar. */
export function steal(state: MandacaruState, player: string, from: string, ctx: GameContext): MandacaruResult {
  if (!victims(state, state.carcara, player).includes(from)) return fail('bad_target');
  return ok(robbed(state, player, from, ctx));
}

/** Vaqueiro: conta pra comitiva e chama o Carcará (sem descarte); depois volta pra fase de onde veio. */
export function playVaqueiro(state: MandacaruState, player: string): MandacaruResult {
  const played = takeCordel(state, player, 'vaqueiro');
  if (!played.ok) return played;
  const s = played.state;
  const knights = { ...s.knights, [player]: (s.knights[player] ?? 0) + 1 };
  const from = state.phase === 'roll' ? 'roll' : 'main';
  return ok(updateAwards({ ...s, knights, afterCarcara: from, phase: 'carcara' }));
}
