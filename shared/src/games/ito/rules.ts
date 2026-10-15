import type { ActionResult, GameContext } from '../../game';
import { MIN_PLAYERS } from '../../players';
import { shuffle } from '../../rng';
import { cleanTheme, pickTheme } from './themes';
import { CAMPAIGN_LIVES, type ItoAction, type ItoCard, type ItoPhase, type ItoState } from './types';

const fail = (error: string): ActionResult<ItoState> => ({ ok: false, error });
const ok = (state: ItoState): ActionResult<ItoState> => ({ ok: true, state });

function hostOnly(isHost: boolean, state: ItoState, phase: ItoPhase): string | null {
  if (!isHost) return 'not_host';
  if (state.phase !== phase) return 'bad_phase';
  return null;
}

export function initialItoState(): ItoState {
  return {
    phase: 'lobby',
    mode: 'livre',
    players: [],
    level: 1,
    lives: CAMPAIGN_LIVES,
    theme: null,
    usedThemes: [],
    cards: {},
    row: [],
    ready: [],
    reveal: null,
    outcome: null,
  };
}

function toThemePhase(state: ItoState, players: string[], level: number, lives: number, ctx: GameContext): ItoState {
  const { theme, used } = pickTheme(ctx.rng, state.usedThemes);
  return {
    ...state,
    phase: 'theme',
    players,
    level,
    lives,
    theme,
    usedThemes: used,
    cards: {},
    row: [],
    ready: [],
    reveal: null,
    outcome: null,
  };
}

function deal(state: ItoState, ctx: GameContext): ItoState {
  const perPlayer = state.mode === 'campanha' ? state.level : 1;
  const values = shuffle(
    ctx.rng,
    Array.from({ length: 100 }, (_, i) => i + 1),
  );
  const cards: Record<string, ItoCard> = {};
  let next = 0;
  for (const owner of state.players) {
    for (let n = 0; n < perPlayer; n++) {
      const id = `${owner}:${n}`;
      cards[id] = { id, owner, value: values[next++]!, clue: '' };
    }
  }
  return { ...state, phase: 'sorting', cards, row: [], ready: [] };
}

export function applyItoAction(
  state: ItoState,
  playerId: string,
  action: ItoAction,
  ctx: GameContext,
): ActionResult<ItoState> {
  const isHost = ctx.hostId === playerId;
  switch (action.type) {
    case 'setMode': {
      const e = hostOnly(isHost, state, 'lobby');
      if (e) return fail(e);
      return ok({ ...state, mode: action.mode });
    }
    case 'start': {
      const e = hostOnly(isHost, state, 'lobby');
      if (e) return fail(e);
      if (ctx.active.length < MIN_PLAYERS) return fail('not_enough_players');
      return ok(toThemePhase(state, [...ctx.active], 1, CAMPAIGN_LIVES, ctx));
    }
    case 'rerollTheme': {
      const e = hostOnly(isHost, state, 'theme');
      if (e) return fail(e);
      const { theme, used } = pickTheme(ctx.rng, state.usedThemes);
      return ok({ ...state, theme, usedThemes: used });
    }
    case 'customTheme': {
      const e = hostOnly(isHost, state, 'theme');
      if (e) return fail(e);
      const theme = cleanTheme(action.theme);
      if (!theme) return fail('bad_theme');
      return ok({ ...state, theme });
    }
    case 'beginRound': {
      const e = hostOnly(isHost, state, 'theme');
      if (e) return fail(e);
      return ok(deal(state, ctx));
    }
    default:
      return fail('bad_action');
  }
}
