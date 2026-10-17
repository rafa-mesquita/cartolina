import type { Rng } from './rng';

export interface GameContext {
  hostId: string | null;
  /** Jogadores conectados ou desconectados há menos de 30 s, na ordem dos assentos. */
  active: string[];
  rng: Rng;
  /** Hora do servidor (ms). Usada pelos prazos do jogo (ex.: os 30 s do Retratim). */
  now: number;
}

export type ActionResult<S> = { ok: true; state: S } | { ok: false; error: string };

export interface GameModule<S, A, V> {
  id: string;
  initialState(): S;
  applyAction(state: S, playerId: string, action: A, ctx: GameContext): ActionResult<S>;
  /** Esconde tudo que `viewerId` não pode ver. */
  viewFor(state: S, viewerId: string | null): V;
  /** Reavaliado quando alguém entra, sai, expira a tolerância de desconexão ou chega um prazo do jogo (alarme). */
  onPresenceChange(state: S, ctx: GameContext): S;
  /** Próximo prazo do jogo (ms), pro servidor acordar nele; `null` = sem prazo. Jogos sem prazo não implementam. */
  nextDeadline?(state: S): number | null;
}
