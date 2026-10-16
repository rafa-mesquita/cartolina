import type { ActionResult, GameContext } from '../src/game';
import { applyDixitAction, initialDixitState } from '../src/games/dixit/rules';
import type { DixitAction, DixitState } from '../src/games/dixit/types';
import { mulberry32 } from '../src/rng';

export const ids = (n: number): string[] => Array.from({ length: n }, (_, i) => `p${i}`);

/** Contexto com `p0` como host por padrão. */
export function ctxOf(active: string[], seed = 1, hostId: string | null = 'p0'): GameContext {
  return { hostId, active, rng: mulberry32(seed) };
}

export function must(res: ActionResult<DixitState>): DixitState {
  if (!res.ok) throw new Error(`ação recusada: ${res.error}`);
  return res.state;
}

export const act = (state: DixitState, playerId: string, action: DixitAction, ctx: GameContext): DixitState =>
  must(applyDixitAction(state, playerId, action, ctx));

/** Partida começada com `n` jogadores (p0…), na narração. */
export function started(n: number, seed = 1): { state: DixitState; ctx: GameContext } {
  const ctx = ctxOf(ids(n), seed);
  return { state: act(initialDixitState(), 'p0', { type: 'start' }, ctx), ctx };
}

/** Não-narradores da rodada. */
export const others = (state: DixitState): string[] => state.inRound.filter((p) => p !== state.storyteller);
