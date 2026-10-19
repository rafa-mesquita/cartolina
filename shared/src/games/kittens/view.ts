import type { GameModule } from '../../game';
import { applyKittensAction, initialKittensState } from './rules';
import { settleKittens } from './settle';
import { tatusIn } from './turn';
import type { KittensAction, KittensChoice, KittensChoiceView, KittensEvent, KittensState, KittensView } from './types';

/** Lê o registro só se a chave for própria (ids como '__proto__' não podem cair no protótipo). */
function own<T>(record: Record<string, T>, key: string | null): T | undefined {
  return key !== null && Object.hasOwn(record, key) ? record[key] : undefined;
}

/** Tira a carta de um evento (pra quem não está no `seenBy`). */
function hideCard(ev: KittensEvent): KittensEvent {
  return 'card' in ev ? ({ ...ev, card: null } as KittensEvent) : ev;
}

/**
 * A escolha sem o id do tatu que está sendo escondido: com ele, quem assiste poderia saber onde o tatu foi parar
 * (ex.: quando alguém sai, o tatu tirado do monte é o mais de baixo e aparece em `out`).
 */
function choiceView(choice: KittensChoice | null): KittensChoiceView | null {
  if (choice?.kind !== 'cafune') return choice;
  const { kind, who, deadline } = choice;
  return { kind, who, deadline };
}

/**
 * Única fronteira de segredo do Tatubum: mãos, monte, Espiar e cartas do diário só pra quem pode ver (spec §4.3).
 * A visão compartilha arrays/objetos com o estado (é serializada no socket); quem consome não deve mutar.
 */
export function kittensViewFor(state: KittensState, viewerId: string | null): KittensView {
  const peek = state.peek;
  return {
    phase: state.phase,
    players: state.players,
    alive: state.alive,
    current: state.current,
    owed: state.owed,
    hand: own(state.hands, viewerId) ?? [],
    handCounts: Object.fromEntries(state.players.map((p) => [p, state.hands[p]?.length ?? 0])),
    drawCount: state.draw.length,
    tatusInDraw: tatusIn(state.draw),
    discard: state.discard,
    out: state.out,
    pending: state.pending,
    choice: choiceView(state.choice),
    peek: peek !== null && peek.who === viewerId ? peek.cards : null,
    peekBy: peek?.who ?? null,
    log: state.log.map(({ n, ev, seenBy }) => ({
      n,
      ev: seenBy === null || (viewerId !== null && seenBy.includes(viewerId)) ? ev : hideCard(ev),
    })),
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
