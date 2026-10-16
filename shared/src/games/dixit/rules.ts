import type { ActionResult, GameContext } from '../../game';
import { randomInt, shuffle, type Rng } from '../../rng';
import { DIXIT_DECK_SIZE, dixitCardIds } from './deck';
import {
  DIXIT_CLUE_MAX,
  DIXIT_DEFAULT_TARGET,
  DIXIT_MIN_PLAYERS,
  type DixitAction,
  type DixitState,
  type DixitTarget,
} from './types';

const fail = (error: string): ActionResult<DixitState> => ({ ok: false, error });
const ok = (state: DixitState): ActionResult<DixitState> => ({ ok: true, state });

/** Mão: 7 cartas com 3 jogadores, 6 com mais. */
export const dixitHandSize = (players: number): number => (players === 3 ? 7 : 6);
/** Cartas que cada não-narrador joga: 2 com 3 jogadores, 1 com mais. */
export const dixitPicksPerPlayer = (players: number): number => (players === 3 ? 2 : 1);
/** O baralho precisa cobrir as mãos e uma rodada inteira. */
export const dixitDeckTooSmall = (players: number, deckSize: number = DIXIT_DECK_SIZE): boolean => deckSize < players * 7;

export function cleanDixitClue(raw: string): string {
  return Array.from(raw.replace(/\s+/g, ' ').trim()).slice(0, DIXIT_CLUE_MAX).join('');
}

export function initialDixitState(target: DixitTarget = DIXIT_DEFAULT_TARGET): DixitState {
  return {
    phase: 'lobby',
    target,
    players: [],
    inRound: [],
    scores: {},
    storyteller: null,
    deck: [],
    discard: [],
    hands: {},
    clue: '',
    storyCard: null,
    picks: {},
    votes: {},
    confirmed: [],
    table: [],
    result: null,
    winners: [],
    paused: false,
  };
}

/** Compra até a mão cheia; baralho vazio → embaralha o descarte e continua. */
function refill(state: DixitState, playerIds: readonly string[], size: number, rng: Rng): DixitState {
  let deck = [...state.deck];
  let discard = [...state.discard];
  const hands = { ...state.hands };
  for (const id of playerIds) {
    const hand = [...(hands[id] ?? [])];
    while (hand.length < size) {
      if (deck.length === 0) {
        if (discard.length === 0) break;
        deck = shuffle(rng, discard);
        discard = [];
      }
      hand.push(deck.shift()!);
    }
    hands[id] = hand;
  }
  return { ...state, deck, discard, hands };
}

/** Próximo narrador depois de `after` na ordem da partida, entre quem está na rodada e ativo. */
function nextStoryteller(state: DixitState, active: readonly string[], after: string | null): string | null {
  const order = state.players;
  const start = after === null ? 0 : order.indexOf(after) + 1;
  const rotated = [...order.slice(start), ...order.slice(0, start)];
  return rotated.find((p) => state.inRound.includes(p) && active.includes(p)) ?? null;
}

/** Começa (ou recomeça) a narração: entra quem chegou, mãos cheias, narrador definido. */
function beginRound(state: DixitState, ctx: GameContext, storyteller: { keep: string } | { after: string | null }): DixitState {
  const joiners = ctx.active.filter((p) => !state.players.includes(p));
  const players = [...state.players, ...joiners];
  const inRound = players.filter((p) => ctx.active.includes(p));
  const scores = { ...state.scores };
  for (const p of joiners) scores[p] = 0;
  const reset: DixitState = {
    ...state,
    phase: 'storytelling',
    players,
    inRound,
    scores,
    clue: '',
    storyCard: null,
    picks: {},
    votes: {},
    confirmed: [],
    table: [],
    result: null,
    paused: inRound.length < DIXIT_MIN_PLAYERS,
  };
  const dealt = refill(reset, inRound, dixitHandSize(inRound.length), ctx.rng);
  const chosen = 'keep' in storyteller ? storyteller.keep : nextStoryteller(dealt, ctx.active, storyteller.after);
  return { ...dealt, storyteller: chosen };
}

/** Partida nova com os ativos (também usada em "jogar de novo"). */
function startMatch(state: DixitState, ctx: GameContext): ActionResult<DixitState> {
  if (ctx.active.length < DIXIT_MIN_PLAYERS) return fail('need_3_players');
  if (dixitDeckTooSmall(ctx.active.length)) return fail('deck_too_small');
  const players = [...ctx.active];
  const fresh: DixitState = {
    ...initialDixitState(state.target),
    players,
    scores: Object.fromEntries(players.map((p) => [p, 0])),
    deck: shuffle(ctx.rng, dixitCardIds()),
  };
  const first = players[randomInt(ctx.rng, players.length)]!;
  return ok(beginRound(fresh, ctx, { keep: first }));
}

export function applyDixitAction(
  state: DixitState,
  playerId: string,
  action: DixitAction,
  ctx: GameContext,
): ActionResult<DixitState> {
  const isHost = ctx.hostId === playerId;
  switch (action.type) {
    case 'setTarget':
      if (!isHost) return fail('not_host');
      if (state.phase !== 'lobby') return fail('bad_phase');
      return ok({ ...state, target: action.target });
    case 'start':
      if (!isHost) return fail('not_host');
      if (state.phase !== 'lobby') return fail('bad_phase');
      return startMatch(state, ctx);
    case 'lobby':
      if (!isHost) return fail('not_host');
      if (state.phase === 'lobby') return fail('bad_phase');
      return ok(initialDixitState(state.target));
    default:
      return fail('bad_action');
  }
}
