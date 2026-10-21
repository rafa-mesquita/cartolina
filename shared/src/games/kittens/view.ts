import type { GameModule } from '../../game';
import { kittensToken } from './cards';
import { kittensWithNewFields } from './compat';
import { applyKittensAction, initialKittensState } from './rules';
import { settleKittens } from './settle';
import { tatusIn } from './turn';
import type { KittensAction, KittensChoiceView, KittensEvent, KittensState, KittensView } from './types';

/** Lê o registro só se a chave for própria (ids como '__proto__' não podem cair no protótipo). */
function own<T>(record: Record<string, T>, key: string | null): T | undefined {
  return key !== null && Object.hasOwn(record, key) ? record[key] : undefined;
}

/** Tira a carta de um evento (pra quem não está no `seenBy`). */
function hideCard(ev: KittensEvent): KittensEvent {
  return 'card' in ev ? ({ ...ev, card: null } as KittensEvent) : ev;
}

/**
 * A escolha como `viewerId` vê: sem o id do tatu que está sendo escondido (com ele, quem assiste poderia saber onde o
 * tatu foi parar); a carta de cima do Quati e a de baixo do Feitiço só pra quem escolhe.
 */
function choiceView(state: KittensState, viewerId: string | null): KittensChoiceView | null {
  const c = state.choice;
  if (c === null) return null;
  const mine = viewerId !== null && 'who' in c && viewerId === c.who;
  switch (c.kind) {
    case 'tatu':
    case 'cafune': {
      const { kind, who, deadline } = c;
      return { kind, who, deadline };
    }
    case 'quati':
      return { ...c, card: mine ? (state.draw.at(-1) ?? null) : null };
    case 'feitico':
      return { ...c, card: mine ? (state.draw[0] ?? null) : null };
    default:
      return c;
  }
}

/**
 * Única fronteira de segredo do Tatubum: mãos, monte, Espiar e cartas do diário só pra quem pode ver (spec §4.3). Cada
 * um vê só a própria espiada; dos outros, só quem tem uma (`peekers`).
 * Quem está cego pelo Mau-olhado vê fichas no lugar da mão, e nenhuma carta que esteja na mão dele aparece no diário.
 * A visão compartilha arrays/objetos com o estado (é serializada no socket); quem consome não deve mutar.
 */
export function kittensViewFor(saved: KittensState, viewerId: string | null): KittensView {
  const state = kittensWithNewFields(saved);
  const hand = own(state.hands, viewerId) ?? [];
  const blind = viewerId !== null && state.blind.includes(viewerId);
  const hidden = blind ? new Set(hand) : null;
  return {
    phase: state.phase,
    players: state.players,
    alive: state.alive,
    current: state.current,
    owed: state.owed,
    hand: blind ? hand.map((_, i) => kittensToken(i)) : hand,
    handCounts: Object.fromEntries(state.players.map((p) => [p, state.hands[p]?.length ?? 0])),
    drawCount: state.draw.length,
    tatusInDraw: tatusIn(state.draw),
    discard: state.discard,
    out: state.out,
    front: Object.fromEntries(state.players.map((p) => [p, own(state.front, p) ?? []])),
    blind: state.blind,
    pending: state.pending,
    choice: choiceView(state, viewerId),
    peek: own(state.peeks, viewerId) ?? null,
    peekers: state.players.filter((p) => (own(state.peeks, p)?.length ?? 0) > 0),
    skips: state.skips,
    log: state.log.map(({ n, ev, seenBy }) => {
      const sees = seenBy === null || (viewerId !== null && seenBy.includes(viewerId));
      const card = 'card' in ev ? ev.card : null;
      const scrub = !sees || (hidden !== null && card !== null && hidden.has(card));
      return { n, ev: scrub ? hideCard(ev) : ev };
    }),
    winner: state.winner,
  };
}

/** Prazo da carta no ar ou da escolha aberta (nunca os dois ao mesmo tempo). */
export function kittensNextDeadline(state: KittensState): number | null {
  if (state.phase !== 'playing') return null;
  return state.pending?.resolvesAt ?? state.choice?.deadline ?? null;
}

export const kittens: GameModule<KittensState, KittensAction, KittensView> = {
  id: 'kittens',
  initialState: () => initialKittensState(),
  applyAction: applyKittensAction,
  viewFor: kittensViewFor,
  onPresenceChange: settleKittens,
  nextDeadline: kittensNextDeadline,
};
