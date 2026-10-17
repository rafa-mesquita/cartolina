import type { ActionResult, GameContext } from '../src/game';
import { applyPicturesAction, initialPicturesState } from '../src/games/pictures/rules';
import type { PicturesAction, PicturesState } from '../src/games/pictures/types';
import type { KitId, Work } from '../src/games/pictures/works';
import { mulberry32 } from '../src/rng';

export const T0 = 1_000_000;

export const ids = (n: number): string[] => Array.from({ length: n }, (_, i) => `p${i}`);

/** Contexto com `p0` como host e relógio em T0, por padrão. */
export function ctxOf(
  active: string[],
  { seed = 1, hostId = 'p0', now = T0 }: { seed?: number; hostId?: string | null; now?: number } = {},
): GameContext {
  return { hostId, active, rng: mulberry32(seed), now };
}

export function must(res: ActionResult<PicturesState>): PicturesState {
  if (!res.ok) throw new Error(`ação recusada: ${res.error}`);
  return res.state;
}

/** Congela o objeto inteiro: qualquer mutação das regras estoura (ESM é strict). */
export function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value)) deepFreeze(v);
  }
  return value;
}

export const act = (state: PicturesState, playerId: string, action: PicturesAction, ctx: GameContext): PicturesState =>
  must(applyPicturesAction(deepFreeze(state), playerId, action, ctx));

/** Uma obra válida e completa de cada kit (pode ficar "pronta"). */
export function sampleWork(kit: KitId): Work {
  switch (kit) {
    case 'cubes':
      return { kit, cells: [0, 0, 0, 1, 1, 1, 2, 2, 2, 3, 3, 3, 4, 4, 4, 5] };
    case 'laces':
      return { kit, long: [[0.1, 0.5], [0.5, 0.4], [0.9, 0.5]], short: [[0.2, 0.2], [0.4, 0.2]] };
    case 'sticks':
      return {
        kit,
        sticks: [0, 1, 2, 3].map((i) => ({ x: 0.2 + i * 0.1, y: 0.5, rot: i * 45 })),
        stones: [0, 1, 2, 3].map((i) => ({ x: 0.2 + i * 0.1, y: 0.7, rot: 0 })),
      };
    case 'blocks':
      return {
        kit,
        pieces: [0, 1, 2, 3, 4, 5].map((i) => ({ x: i - 3, y: 0, z: 0, rot: 0, lay: false })),
        camera: { theta: 0.5, phi: 0.95 },
      };
    case 'icons':
      return { kit, ids: [0, 1, 2] };
    case 'dots':
      return { kit, points: [[0.1, 0.1], [0.5, 0.9], [0.9, 0.1]], lines: [[0, 1], [1, 2]] };
  }
}

/** Partida começada com `n` jogadores (p0…), na montagem da rodada 0. */
export function started(n: number, seed = 1): { state: PicturesState; ctx: GameContext } {
  const ctx = ctxOf(ids(n), { seed });
  return { state: act(initialPicturesState(), 'p0', { type: 'start' }, ctx), ctx };
}

/** `who` mandam a obra de exemplo do próprio kit. */
export function drafted(state: PicturesState, who: readonly string[], ctx: GameContext): PicturesState {
  let s = state;
  for (const p of who) s = act(s, p, { type: 'draft', work: sampleWork(s.kits[p]!) }, ctx);
  return s;
}

/** Todos da rodada mandaram a obra de exemplo e ficaram prontos: palpites abertos. */
export function toGuessingPhase(state: PicturesState, ctx: GameContext): PicturesState {
  let s = drafted(state, state.inRound, ctx);
  for (const p of state.inRound) s = act(s, p, { type: 'ready', on: true }, ctx);
  return s;
}

/** Cada um palpita `choose` em todas as obras dos outros e confirma: revelação. */
export function toRevealPhase(
  state: PicturesState,
  ctx: GameContext,
  choose: (s: PicturesState, guesser: string, artist: string) => PicturesState['secrets'][string],
): PicturesState {
  let s = state;
  for (const g of s.inRound) {
    for (const artist of Object.keys(s.works)) {
      if (artist !== g) s = act(s, g, { type: 'guess', artist, coord: choose(s, g, artist) }, ctx);
    }
  }
  for (const g of state.inRound) s = act(s, g, { type: 'confirm' }, ctx);
  return s;
}

/** Palpite certo: a coordenada secreta do artista. */
export const rightGuess = (s: PicturesState, _g: string, artist: string) => s.secrets[artist]!;
