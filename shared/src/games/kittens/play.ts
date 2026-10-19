import { KITTENS_ACTION_KINDS, kittensKindOf, type KittensActionKind, type KittensCardKind } from './cards';
import type { KittensPlay, KittensPlayKind, KittensState } from './types';

/** O que as cartas formam: carta de ação sozinha, par, trio ou 5 diferentes (spec §2). */
function playKindOf(kinds: KittensCardKind[]): KittensPlayKind | null {
  const same = kinds.every((k) => k === kinds[0]);
  if (kinds.length === 1) {
    return (KITTENS_ACTION_KINDS as readonly string[]).includes(kinds[0]!) ? (kinds[0] as KittensActionKind) : null;
  }
  if (kinds.length === 2 && same) return 'par';
  if (kinds.length === 3 && same) return 'trio';
  if (kinds.length === 5 && new Set(kinds).size === 5) return 'cinco';
  return null;
}

/** Lê a jogada de `p`. Devolve o código de erro se não vale. Alvo e pedido que a jogada não usa são ignorados. */
export function parsePlay(
  s: KittensState,
  p: string,
  action: { cards: string[]; target?: string; ask?: KittensCardKind },
): KittensPlay | string {
  const { cards } = action;
  const hand = s.hands[p] ?? [];
  if (cards.length === 0 || new Set(cards).size !== cards.length) return 'bad_combo';
  if (!cards.every((c) => hand.includes(c))) return 'not_in_hand';
  const kind = playKindOf(cards.map((c) => kittensKindOf(c)!));
  if (kind === null) return 'bad_combo';
  let target: string | null = null;
  if (kind === 'favor' || kind === 'par' || kind === 'trio') {
    const t = action.target;
    if (t === undefined || t === p || !s.alive.includes(t) || (s.hands[t]?.length ?? 0) === 0) return 'bad_target';
    target = t;
  }
  let ask: KittensCardKind | null = null;
  if (kind === 'trio') {
    if (action.ask === undefined || action.ask === 'tatubum') return 'bad_ask';
    ask = action.ask;
  }
  return { kind, cards: [...cards], target, ask };
}
