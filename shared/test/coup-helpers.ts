import type { ActionResult, GameContext } from '../src/game';
import { fullDeck } from '../src/games/coup/deck';
import { applyCoupAction, initialCoupState } from '../src/games/coup/rules';
import { without } from '../src/games/coup/table';
import type { CoupAction, CoupCharacter, CoupState } from '../src/games/coup/types';
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

export function must(res: ActionResult<CoupState>): CoupState {
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

export const tryAct = (state: CoupState, playerId: string, action: CoupAction, ctx: GameContext): ActionResult<CoupState> =>
  applyCoupAction(deepFreeze(state), playerId, action, ctx);

export const act = (state: CoupState, playerId: string, action: CoupAction, ctx: GameContext): CoupState =>
  must(tryAct(state, playerId, action, ctx));

/**
 * Mesa montada à mão, na vez de `turn` (padrão: o primeiro), todos com 2 moedas (ou `coins`).
 * O baralho é o que sobra das 15, na ordem de `fullDeck` (duke, assassin, captain, ambassador, contessa), ou `deck`.
 */
export function table(
  hands: Record<string, CoupCharacter[]>,
  opts: { coins?: Record<string, number>; turn?: string; deck?: CoupCharacter[] } = {},
): CoupState {
  const players = Object.keys(hands);
  const used = players.flatMap((p) => hands[p]!);
  return {
    ...initialCoupState(),
    phase: 'turn',
    match: 1,
    players,
    hands: Object.fromEntries(
      players.map((p) => [p, { coins: opts.coins?.[p] ?? 2, cards: hands[p]!.map((character) => ({ character, revealed: false })) }]),
    ),
    deck: opts.deck ?? without(fullDeck(), used)!,
    turn: opts.turn ?? players[0]!,
    wins: Object.fromEntries(players.map((p) => [p, 0])),
  };
}

/** A carta `index` de `player` já perdida (virada pra cima); sem carta escondida, ele entra em `out`. */
export function withLost(state: CoupState, player: string, index: number): CoupState {
  const hand = state.hands[player]!;
  const cards = hand.cards.map((c, i) => (i === index ? { ...c, revealed: true } : c));
  const gone = cards.every((c) => c.revealed);
  return {
    ...state,
    hands: { ...state.hands, [player]: { coins: gone ? 0 : hand.coins, cards } },
    out: gone ? [...state.out, player] : state.out,
  };
}

/** Todos da janela aberta que ainda não deixaram clicam "deixa". */
export function allPass(state: CoupState, ctx: GameContext): CoupState {
  const w = state.window!;
  let s = state;
  for (const p of w.eligible) if (!w.passed.includes(p)) s = act(s, p, { type: 'pass' }, ctx);
  return s;
}

/** Todas as cartas da partida (mãos, baralho e compradas na troca), em ordem alfabética. */
export function cardsOf(state: CoupState): CoupCharacter[] {
  return [...state.players.flatMap((p) => state.hands[p]!.cards.map((c) => c.character)), ...state.deck, ...state.drawn].sort();
}

/** Mesa de 3 usada em vários testes. */
export const THREE: Record<string, CoupCharacter[]> = {
  p0: ['duke', 'captain'],
  p1: ['contessa', 'assassin'],
  p2: ['ambassador', 'duke'],
};
