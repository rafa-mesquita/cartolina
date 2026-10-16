import type { GameModule } from '../../game';
import { applyDixitAction, dixitOnPresenceChange, initialDixitState } from './rules';
import type { DixitAction, DixitState, DixitView } from './types';

/**
 * Única fronteira de segredo do Dixit: mãos alheias, carta do narrador, escolhas e votos
 * só aparecem para quem pode ver (todo mundo, a partir da revelação).
 */
export function dixitViewFor(state: DixitState, viewerId: string | null): DixitView {
  const revealed = state.phase === 'reveal' || state.phase === 'gameover';
  const me = viewerId ?? '';
  const myPicks = viewerId === null ? [] : (state.picks[me] ?? []);
  const isStoryteller = viewerId !== null && viewerId === state.storyteller;
  const tableCount =
    state.phase === 'submitting'
      ? 1 + state.confirmed.reduce((n, p) => n + (state.picks[p]?.length ?? 0), 0)
      : state.table.length;
  return {
    phase: state.phase,
    target: state.target,
    players: state.players,
    inRound: state.inRound,
    scores: state.scores,
    storyteller: state.storyteller,
    clue: state.clue,
    paused: state.paused,
    winners: state.winners,
    result: revealed ? state.result : null,
    hand: viewerId === null ? [] : (state.hands[me] ?? []),
    handCounts: Object.fromEntries(Object.entries(state.hands).map(([p, hand]) => [p, hand.length])),
    deckCount: state.deck.length,
    storyCard: revealed || isStoryteller ? state.storyCard : null,
    myPicks,
    myVote: viewerId === null ? null : (state.votes[me] ?? null),
    confirmed: state.confirmed,
    tableCount,
    table: state.table.map((cardId) => ({
      cardId,
      mine: myPicks.includes(cardId) || (isStoryteller && cardId === state.storyCard),
    })),
  };
}

export const dixit: GameModule<DixitState, DixitAction, DixitView> = {
  id: 'dixit',
  initialState: () => initialDixitState(),
  applyAction: applyDixitAction,
  viewFor: dixitViewFor,
  onPresenceChange: dixitOnPresenceChange,
};
