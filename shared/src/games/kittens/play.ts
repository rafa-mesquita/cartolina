import {
  KITTENS_ACTION_KINDS,
  KITTENS_WILD,
  kittensIsBicho,
  kittensKindOf,
  kittensTokenIndex,
  type KittensActionKind,
  type KittensCardKind,
} from './cards';
import type { KittensPlay, KittensPlayKind, KittensState } from './types';

/**
 * A carta de verdade que `p` está apontando: quem está cego pelo Mau-olhado só aponta por ficha (`?i` = i-ésima carta
 * da mão no estado); quem vê, pelo id. Devolve o código de erro quando não vale: `blind_pick` (cego mandou id de
 * verdade, ou nada) ou `not_in_hand`. Cada carta tem uma ficha só (`kittensTokenIndex` recusa `?00`, `?01`…).
 */
export function realCard(s: KittensState, p: string, card: string | undefined): string | { error: string } {
  const hand = s.hands[p] ?? [];
  if (!s.blind.includes(p)) return card !== undefined && hand.includes(card) ? card : { error: 'not_in_hand' };
  const i = card === undefined ? null : kittensTokenIndex(card);
  if (i === null) return { error: 'blind_pick' };
  return i < hand.length ? hand[i]! : { error: 'not_in_hand' };
}

/** O que as cartas formam e o bicho que valem (par/trio), ou o erro (`bad_combo`, `bad_as`). Spec §2 "Combos" e "Boto". */
function playKindOf(kinds: KittensCardKind[], as: KittensCardKind | undefined): { kind: KittensPlayKind; as: KittensCardKind | null } | string {
  const plain = kinds.filter((k) => k !== KITTENS_WILD);
  const wild = kinds.length - plain.length;
  const same = plain.every((k) => k === plain[0]);
  if (kinds.length === 1) {
    return (KITTENS_ACTION_KINDS as readonly string[]).includes(kinds[0]!) ? { kind: kinds[0] as KittensActionKind, as: null } : 'bad_combo';
  }
  if (kinds.length === 2) {
    // Par só de bichos; o Boto faz as vezes de qualquer um. Dois Botos: o par vale o bicho declarado em `as`.
    if (wild === 2) return kittensIsBicho(as ?? null) ? { kind: 'par', as: as! } : 'bad_as';
    return same && kittensIsBicho(plain[0]!) ? { kind: 'par', as: plain[0]! } : 'bad_combo';
  }
  if (kinds.length === 3) {
    // 3 iguais de qualquer tipo; com Boto, só se as outras forem do mesmo bicho (ou se forem 3 Botos).
    if (wild === 0) return same ? { kind: 'trio', as: kinds[0]! } : 'bad_combo';
    if (wild === 3) return { kind: 'trio', as: KITTENS_WILD };
    return same && kittensIsBicho(plain[0]!) ? { kind: 'trio', as: plain[0]! } : 'bad_combo';
  }
  // 5 diferentes: o Boto conta como o próprio nome.
  if (kinds.length === 5 && new Set(kinds).size === 5) return { kind: 'cinco', as: null };
  return 'bad_combo';
}

/**
 * Favor sozinho ou trio de 3 Favores (pedido do Rafa, 2026-10-20): os dois pedem um alvo com carta na mão, e o alvo
 * escolhe o que dar (1 carta; no trio, 3).
 */
export function kittensIsFavorPlay(play: { kind: KittensPlayKind; as: KittensCardKind | null }): boolean {
  return play.kind === 'favor' || (play.kind === 'trio' && play.as === 'favor');
}

type PlayAction = { cards: string[]; target?: string; ask?: KittensCardKind; as?: KittensCardKind };

/**
 * Lê a jogada de `p`. Devolve o código de erro se não vale. Alvo, pedido e `as` que a jogada não usa são ignorados.
 * Quem está cego manda fichas; a jogada guardada leva os ids de verdade.
 *
 * Quem está cego só ouve erros que não dependem do que as fichas escondem (`blind_pick`, `not_in_hand`, ficha
 * repetida): depois que as fichas viram cartas, qualquer recusa (`bad_target`, `bad_ask`, `bad_as`) chega como
 * `bad_combo`. Assim uma tentativa recusada só ensina "assim não forma jogada", e não "é um Favor sem alvo" ou "são
 * dois Botos".
 */
export function parsePlay(s: KittensState, p: string, action: PlayAction): KittensPlay | string {
  if (action.cards.length === 0 || new Set(action.cards).size !== action.cards.length) return 'bad_combo';
  const cards: string[] = [];
  for (const c of action.cards) {
    const real = realCard(s, p, c);
    if (typeof real !== 'string') return real.error;
    cards.push(real);
  }
  // A mesma carta por dois nomes (a checagem de cima olha os nomes mandados): nunca passa duas vezes.
  if (new Set(cards).size !== cards.length) return 'bad_combo';
  const play = readPlay(s, p, cards, action);
  return typeof play === 'string' && s.blind.includes(p) ? 'bad_combo' : play;
}

/** O que as cartas de verdade `cards` formam, com alvo, pedido e `as` conferidos; ou o código de erro. */
function readPlay(s: KittensState, p: string, cards: string[], action: PlayAction): KittensPlay | string {
  const kinds = cards.map((c) => kittensKindOf(c)!);
  const parsed = playKindOf(kinds, action.as);
  if (typeof parsed === 'string') return parsed;
  const { kind } = parsed;
  let target: string | null = null;
  const favor = kittensIsFavorPlay(parsed);
  if (favor || kind === 'olhado') {
    // Favor (e trio de Favor): o alvo precisa ter carta pra dar. Mau-olhado: qualquer adversário vivo (até sem carta).
    const t = action.target;
    if (t === undefined || t === p || !s.alive.includes(t)) return 'bad_target';
    if (favor && (s.hands[t]?.length ?? 0) === 0) return 'bad_target';
    target = t;
  }
  let ask: KittensCardKind | null = null;
  if (kind === 'par' && parsed.as === 'preguica') {
    if (action.ask === undefined || !kittensIsBicho(action.ask)) return 'bad_ask';
    ask = action.ask;
  }
  return { kind, cards, target, ask, as: parsed.as };
}
