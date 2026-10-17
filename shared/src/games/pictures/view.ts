import type { GameModule } from '../../game';
import { applyPicturesAction, initialPicturesState, settlePictures } from './rules';
import { PICTURES_ROUNDS, type PicturesAction, type PicturesState, type PicturesView } from './types';

/** Lê o registro só se a chave for própria (ids como '__proto__' não podem cair no protótipo). */
function own<T>(record: Record<string, T>, key: string | null): T | undefined {
  return key !== null && Object.hasOwn(record, key) ? record[key] : undefined;
}

/**
 * Única fronteira de segredo do Retratim: coordenadas e obras alheias só aparecem pra quem pode ver.
 * A visão compartilha arrays/objetos com o estado (é serializada no socket); quem consome não deve mutar.
 */
export function picturesViewFor(state: PicturesState, viewerId: string | null): PicturesView {
  const revealed = state.phase === 'reveal' || state.phase === 'gameover';
  const allWorks = state.phase === 'guessing' || revealed;
  const myWork = own(state.works, viewerId);
  return {
    phase: state.phase,
    players: state.players,
    inRound: state.inRound,
    scores: state.scores,
    round: state.round,
    rounds: PICTURES_ROUNDS,
    grid: state.grid,
    kits: state.kits,
    ready: state.ready,
    confirmed: state.confirmed,
    countdownEndsAt: state.countdownEndsAt,
    paused: state.paused,
    winners: state.winners,
    mySecret: own(state.secrets, viewerId) ?? null,
    works: allWorks ? state.works : myWork !== undefined && viewerId !== null ? { [viewerId]: myWork } : {},
    myGuesses: own(state.guesses, viewerId) ?? {},
    result: revealed ? state.result : null,
  };
}

/** O Retratim só tem prazo enquanto a contagem dos 30 s corre (e a mesa não está pausada). */
export function picturesNextDeadline(state: PicturesState): number | null {
  if (state.phase !== 'building' && state.phase !== 'guessing') return null;
  return state.paused ? null : state.countdownEndsAt;
}

export const pictures: GameModule<PicturesState, PicturesAction, PicturesView> = {
  id: 'pictures',
  initialState: () => initialPicturesState(),
  applyAction: applyPicturesAction,
  viewFor: picturesViewFor,
  onPresenceChange: settlePictures,
  nextDeadline: picturesNextDeadline,
};
