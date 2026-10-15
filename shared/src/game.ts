import type { Rng } from './rng';

export interface GameContext {
  hostId: string | null;
  /** Jogadores conectados ou desconectados há menos de 30 s, na ordem dos assentos. */
  active: string[];
  rng: Rng;
}

export type ActionResult<S> = { ok: true; state: S } | { ok: false; error: string };

export interface GameModule<S, A, V> {
  id: string;
  initialState(): S;
  applyAction(state: S, playerId: string, action: A, ctx: GameContext): ActionResult<S>;
  /** Esconde tudo que `viewerId` não pode ver. */
  viewFor(state: S, viewerId: string | null): V;
  /** Reavaliado quando alguém entra, sai ou expira a tolerância de desconexão. */
  onPresenceChange(state: S, ctx: GameContext): S;
}
