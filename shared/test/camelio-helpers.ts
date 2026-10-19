import type { ActionResult, GameContext } from '../src/game';
import { applyCamelioAction, initialCamelioState } from '../src/games/camelio/rules';
import type { CamelioAction, CamelioState } from '../src/games/camelio/types';
import { mulberry32 } from '../src/rng';

/** Cartas usadas nos testes (ids fixos do baralho, ver a tabela no plano C1 e `deck.ts`). */
export const C = {
  verde1: 0,
  verde2: 2,
  verde3: 4,
  amarelo2: 8,
  amarelo3: 10,
  vermelho1: 18,
  vermelho2: 20,
  vermelho2b: 21,
  vermelho3: 22,
  vermelho4: 23,
  azul1: 30,
  azul2: 32,
  azul3: 34,
  /** Bicolor laranja/vermelho, de verdade vermelho 2. */
  bicVermelho2: 46,
} as const;

export const ids = (n: number): string[] => Array.from({ length: n }, (_, i) => `p${i}`);

/** Contexto com `p0` como host por padrão. */
export function ctxOf(active: string[], seed = 1, hostId: string | null = 'p0'): GameContext {
  return { hostId, active, rng: mulberry32(seed), now: 0 };
}

export function must(res: ActionResult<CamelioState>): CamelioState {
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

export const act = (state: CamelioState, playerId: string, action: CamelioAction, ctx: GameContext): CamelioState =>
  must(applyCamelioAction(deepFreeze(state), playerId, action, ctx));

export const tryAct = (state: CamelioState, playerId: string, action: CamelioAction, ctx: GameContext): ActionResult<CamelioState> =>
  applyCamelioAction(deepFreeze(state), playerId, action, ctx);

/**
 * Partida no meio, montada à mão: `n` jogadores (p0…), `p0` na vez, mesas vazias,
 * monte `[verde1, verde2]` (topo = último) e aberta `azul1`. `over` troca qualquer campo.
 */
export function playing(n: number, over: Partial<CamelioState> = {}): CamelioState {
  const players = ids(n);
  return {
    ...initialCamelioState(),
    phase: 'playing',
    match: 1,
    players,
    table: Object.fromEntries(players.map((p) => [p, []])),
    scored: Object.fromEntries(players.map((p) => [p, []])),
    turn: 'p0',
    target: n === 2 ? 4 : 3,
    deck: [C.verde1, C.verde2],
    open: C.azul1,
    ...over,
  };
}

/** Todas as cartas da partida, de todos os lugares (pra conferir que nenhuma some nem duplica). */
export function allCards(state: CamelioState): number[] {
  return [
    ...state.deck,
    ...(state.open === null ? [] : [state.open]),
    ...state.discard,
    ...Object.values(state.table).flat(),
    ...Object.values(state.scored).flat(),
  ];
}
