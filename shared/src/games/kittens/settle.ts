import type { GameContext } from '../../game';
import { resolvePending } from './resolve';
import type { KittensState } from './types';

/**
 * Prazos (e, na Task 7, presença). Roda antes de cada ação, a cada `tick` da sala e no alarme.
 * Devolve o MESMO objeto quando nada muda (o servidor compara referência).
 */
export function settleKittens(state: KittensState, ctx: GameContext): KittensState {
  if (state.phase !== 'playing') return state;
  let s = state;
  if (s.pending && ctx.now >= s.pending.resolvesAt) s = resolvePending(s, ctx);
  return s;
}
