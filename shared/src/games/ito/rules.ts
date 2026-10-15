import type { ActionResult, GameContext, GameModule } from '../../game';
import { MIN_PLAYERS, cleanClue } from '../../players';
import { shuffle } from '../../rng';
import { computeReveal, resolveOutcome } from './scoring';
import { cleanTheme, pickTheme } from './themes';
import {
  CAMPAIGN_LIVES,
  type ItoAction,
  type ItoCard,
  type ItoPhase,
  type ItoState,
  type ItoView,
} from './types';

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

function unready(state: ItoState, playerId: string): ItoState {
  return { ...state, ready: state.ready.filter((p) => p !== playerId) };
}

function ownCard(state: ItoState, playerId: string, cardId: string): ItoCard | string {
  if (state.phase !== 'sorting') return 'bad_phase';
  const card = state.cards[cardId];
  if (!card) return 'unknown_card';
  if (card.owner !== playerId) return 'not_owner';
  return card;
}

function allCardsInRow(state: ItoState): boolean {
  return state.row.length === Object.keys(state.cards).length;
}

function reveal(state: ItoState): ItoState {
  const entries = computeReveal(state.row, state.cards);
  const errors = entries.filter((e) => e.error).length;
  const { lives, outcome } = resolveOutcome(state.mode, state.level, state.lives, errors);
  return { ...state, phase: 'reveal', reveal: entries, lives, outcome };
}

/** Revela quando todos os participantes ativos estão prontos e todas as cartas estão na fila. */
export function maybeReveal(state: ItoState, ctx: GameContext): ItoState {
  if (state.phase !== 'sorting' || !allCardsInRow(state)) return state;
  const mustBeReady = state.players.filter((p) => ctx.active.includes(p));
  if (mustBeReady.length === 0) return state;
  if (!mustBeReady.every((p) => state.ready.includes(p))) return state;
  return reveal(state);
}

function next(state: ItoState, ctx: GameContext): ActionResult<ItoState> {
  if (state.phase !== 'sorting' && state.phase !== 'reveal') return fail('bad_phase');
  if (state.phase === 'reveal' && (state.outcome === 'won' || state.outcome === 'lost')) {
    return ok({ ...initialItoState(), mode: state.mode, usedThemes: state.usedThemes });
  }
  if (ctx.active.length < MIN_PLAYERS) return fail('not_enough_players');
  const players = [...ctx.active];
  if (state.phase === 'sorting') return ok(toThemePhase(state, players, state.level, state.lives, ctx));
  if (state.outcome === 'level_cleared') return ok(toThemePhase(state, players, state.level + 1, state.lives, ctx));
  return ok(toThemePhase(state, players, 1, CAMPAIGN_LIVES, ctx));
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
    case 'place': {
      const card = ownCard(state, playerId, action.cardId);
      if (typeof card === 'string') return fail(card);
      const row = state.row.filter((id) => id !== card.id);
      const index = Math.min(Math.max(0, Math.trunc(action.index)), row.length);
      row.splice(index, 0, card.id);
      return ok(unready({ ...state, row }, playerId));
    }
    case 'return': {
      const card = ownCard(state, playerId, action.cardId);
      if (typeof card === 'string') return fail(card);
      return ok(unready({ ...state, row: state.row.filter((id) => id !== card.id) }, playerId));
    }
    case 'clue': {
      const card = ownCard(state, playerId, action.cardId);
      if (typeof card === 'string') return fail(card);
      const cards = { ...state.cards, [card.id]: { ...card, clue: cleanClue(action.text) } };
      return ok(unready({ ...state, cards }, playerId));
    }
    case 'ready': {
      if (state.phase !== 'sorting') return fail('bad_phase');
      if (!state.players.includes(playerId)) return fail('not_player');
      if (!action.ready) return ok(unready(state, playerId));
      const mine = Object.values(state.cards).filter((c) => c.owner === playerId);
      if (!mine.every((c) => state.row.includes(c.id))) return fail('cards_missing');
      const readied = unready(state, playerId);
      return ok(maybeReveal({ ...readied, ready: [...readied.ready, playerId] }, ctx));
    }
    case 'forceReveal': {
      const e = hostOnly(isHost, state, 'sorting');
      if (e) return fail(e);
      if (!allCardsInRow(state)) return fail('cards_missing');
      return ok(reveal(state));
    }
    case 'next': {
      if (!isHost) return fail('not_host');
      return next(state, ctx);
    }
    default:
      return fail('bad_action');
  }
}

export function itoViewFor(state: ItoState, viewerId: string | null): ItoView {
  const showAll = state.phase === 'reveal';
  const cards: ItoView['cards'] = {};
  for (const card of Object.values(state.cards)) {
    cards[card.id] = {
      id: card.id,
      owner: card.owner,
      clue: card.clue,
      value: showAll || card.owner === viewerId ? card.value : null,
    };
  }
  const { usedThemes: _usedThemes, cards: _cards, ...rest } = state;
  return { ...rest, cards };
}

export const ito: GameModule<ItoState, ItoAction, ItoView> = {
  id: 'ito',
  initialState: initialItoState,
  applyAction: applyItoAction,
  viewFor: itoViewFor,
  onPresenceChange: maybeReveal,
};
