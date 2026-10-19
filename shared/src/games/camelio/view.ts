import type { GameModule } from '../../game';
import { camelioBack, camelioCard } from './deck';
import { applyCamelioAction, camelioOnPresenceChange, initialCamelioState } from './rules';
import { camelioPoints } from './scoring';
import type { CamelioAction, CamelioCard, CamelioState, CamelioView } from './types';

const cardsOf = (ids: readonly number[]): CamelioCard[] => ids.map(camelioCard);

const mapRecord = <T>(record: Record<string, number[]>, fn: (ids: number[]) => T): Record<string, T> =>
  Object.fromEntries(Object.entries(record).map(([p, ids]) => [p, fn(ids)]));

/**
 * Única fronteira de segredo do Cama-Leão: o topo do monte sai só como verso.
 * Ids e ordem do monte e do descarte nunca saem (o id do topo entregaria a frente, porque o baralho é público).
 * Todo o resto é aberto, igual pra todo mundo.
 */
export function camelioViewFor(state: CamelioState, _viewerId: string | null): CamelioView {
  const topId = state.deck[state.deck.length - 1];
  return {
    phase: state.phase,
    players: state.players,
    target: state.target,
    turn: state.turn,
    paused: state.paused,
    match: state.match,
    open: state.open === null ? null : camelioCard(state.open),
    top: topId === undefined ? null : camelioBack(camelioCard(topId)),
    deckCount: state.deck.length,
    discardCount: state.discard.length,
    reshuffled: state.reshuffled,
    table: mapRecord(state.table, cardsOf),
    scored: mapRecord(state.scored, cardsOf),
    points: mapRecord(state.scored, camelioPoints),
    last: state.log[state.log.length - 1] ?? null,
    playCount: state.log.length,
    winners: state.winners,
    endReason: state.endReason,
  };
}

export const camelio: GameModule<CamelioState, CamelioAction, CamelioView> = {
  id: 'camelio',
  initialState: () => initialCamelioState(),
  applyAction: applyCamelioAction,
  viewFor: camelioViewFor,
  onPresenceChange: camelioOnPresenceChange,
};
