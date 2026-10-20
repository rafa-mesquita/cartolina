import type { ActionResult, GameContext } from '../src/game';
import { applyKittensAction, initialKittensState } from '../src/games/kittens/rules';
import type { KittensAction, KittensState } from '../src/games/kittens/types';
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

export function must(res: ActionResult<KittensState>): KittensState {
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

export const act = (state: KittensState, playerId: string, action: KittensAction, ctx: GameContext): KittensState =>
  must(applyKittensAction(deepFreeze(state), playerId, action, ctx));

/** O código de erro de uma ação que tem que ser recusada. */
export function refuse(state: KittensState, playerId: string, action: KittensAction, ctx: GameContext): string {
  const res = applyKittensAction(deepFreeze(state), playerId, action, ctx);
  if (res.ok) throw new Error('esperava recusa');
  return res.error;
}

/** Partida começada com `n` jogadores (p0…), vez de p0. */
export function started(n: number, seed = 1): { state: KittensState; ctx: GameContext } {
  const ctx = ctxOf(ids(n), { seed });
  return { state: act(initialKittensState(), 'p0', { type: 'start' }, ctx), ctx };
}

/**
 * Todas as cartas da partida, onde quer que estejam (mãos, monte, descarte, fora do jogo, cartas na frente dos
 * jogadores, cartas no ar e o tatu que está sendo escondido), em ordem alfabética. Serve pra conferir que nenhuma carta
 * some nem se duplica. (O cego do Mau-olhado só muda a visão: a mão dele continua em `hands`.)
 */
export function everyCard(state: KittensState): string[] {
  return [
    ...Object.values(state.hands).flat(),
    ...state.draw,
    ...state.discard,
    ...state.out,
    ...Object.values(state.front).flat(),
    ...(state.pending ? [...state.pending.play.cards, ...state.pending.nopes.map((n) => n.card)] : []),
    ...(state.choice?.kind === 'cafune' || state.choice?.kind === 'tatu' ? [state.choice.tatu] : []),
  ].sort();
}

/** Mesa montada à mão: jogadores = chaves de `hands` (na ordem), todos vivos, vez de `current`. Monte: topo = fim. */
export function table(opts: {
  hands: Record<string, string[]>;
  draw?: string[];
  discard?: string[];
  current?: string;
  owed?: number;
  front?: Record<string, string[]>;
  blind?: string[];
}): KittensState {
  const players = Object.keys(opts.hands);
  return {
    ...initialKittensState(),
    phase: 'playing',
    players,
    alive: [...players],
    hands: opts.hands,
    draw: opts.draw ?? [],
    discard: opts.discard ?? [],
    front: opts.front ?? {},
    blind: opts.blind ?? [],
    current: opts.current ?? players[0]!,
    owed: opts.owed ?? 1,
  };
}

/** Ficha (`?i`) da carta `card` na mão de quem está cego (a ordem das fichas é a da mão no estado). */
export function tokenOf(state: KittensState, p: string, card: string): string {
  const i = state.hands[p]!.indexOf(card);
  if (i < 0) throw new Error(`${card} não está na mão de ${p}`);
  return `?${i}`;
}
