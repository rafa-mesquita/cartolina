import type { ActionResult, GameContext } from '../../game';
import { kittensDeal } from './deck';
import { KITTENS_MIN_PLAYERS, type KittensAction, type KittensState } from './types';

const fail = (error: string): ActionResult<KittensState> => ({ ok: false, error });
const ok = (state: KittensState): ActionResult<KittensState> => ({ ok: true, state });

export function initialKittensState(): KittensState {
  return {
    phase: 'lobby',
    players: [],
    alive: [],
    hands: {},
    draw: [],
    discard: [],
    out: [],
    current: null,
    owed: 0,
    pending: null,
    choice: null,
    peek: null,
    log: [],
    seq: 0,
    winner: null,
  };
}

/** Partida nova com os ativos (também usada em "jogar de novo"). A sala já limita a 8 pessoas. */
function startMatch(ctx: GameContext): ActionResult<KittensState> {
  if (ctx.active.length < KITTENS_MIN_PLAYERS) return fail('not_enough_players');
  const players = [...ctx.active];
  const { hands, draw } = kittensDeal(ctx.rng, players);
  return ok({ ...initialKittensState(), phase: 'playing', players, alive: [...players], hands, draw, current: players[0]!, owed: 1 });
}

export function applyKittensAction(
  state: KittensState,
  playerId: string,
  action: KittensAction,
  ctx: GameContext,
): ActionResult<KittensState> {
  const s = state;
  const isHost = ctx.hostId === playerId;
  switch (action.type) {
    case 'start':
      if (!isHost) return fail('not_host');
      if (s.phase !== 'lobby') return fail('bad_phase');
      return startMatch(ctx);
    case 'lobby':
      if (!isHost) return fail('not_host');
      if (s.phase === 'lobby') return fail('bad_phase');
      return ok(initialKittensState());
    case 'again':
      if (!isHost) return fail('not_host');
      if (s.phase !== 'gameover') return fail('bad_phase');
      return startMatch(ctx);
    default:
      return fail('bad_action');
  }
}
