import type { GameContext } from '../../game';
import { shuffle } from '../../rng';
import { geometry } from './board';
import { fail, ok, type MandacaruResult } from './build';
import { shuffledCordelDeck } from './cordel';
import { desertOf, randomLayout } from './setup';
import { buildCity, buildHouse, buildRoad, buyCordel, checkWin, passTurn, placeHouse, placeRoad, rollDice } from './turn';
import {
  MANDACARU_BANK_EACH,
  MANDACARU_MAX_PLAYERS,
  MANDACARU_MIN_PLAYERS,
  MANDACARU_TURN_MS,
  RESOURCES,
  noResources,
  type MandacaruAction,
  type MandacaruPhase,
  type MandacaruState,
  type Resources,
} from './types';

export { checkWin, endTurn, setupOrder } from './turn';

const fullBank = (): Resources => {
  const bank = noResources();
  for (const r of RESOURCES) bank[r] = MANDACARU_BANK_EACH;
  return bank;
};

export function initialMandacaruState(): MandacaruState {
  const g = geometry();
  return {
    phase: 'lobby',
    match: 0,
    wins: {},
    players: [],
    layout: null,
    carcara: 0,
    buildings: g.vertices.map(() => null),
    roads: g.edges.map(() => null),
    hands: {},
    bank: fullBank(),
    deck: [],
    turn: null,
    setup: null,
    rolled: false,
    dice: null,
    diceCounts: Array<number>(13).fill(0),
    cordelPlayed: false,
    discards: {},
    afterCarcara: 'main',
    mutiraoLeft: 0,
    offer: null,
    proposals: [],
    tradeSeq: 0,
    longestRoad: null,
    largestArmy: null,
    knights: {},
    turnEndsAt: null,
    discardEndsAt: null,
    startedAt: null,
    turns: 0,
    winner: null,
    lastSteal: null,
    log: [],
  };
}

/** Partida nova com os ativos (também no "jogar de novo"): tabuleiro e ordem sorteados; o placar da noite segue. */
function startMatch(state: MandacaruState, ctx: GameContext): MandacaruResult {
  if (ctx.active.length < MANDACARU_MIN_PLAYERS) return fail('need_3_players');
  if (ctx.active.length > MANDACARU_MAX_PLAYERS) return fail('room_full');
  const players = shuffle(ctx.rng, ctx.active);
  const layout = randomLayout(ctx.rng);
  const deck = shuffledCordelDeck(ctx.rng);
  const wins = { ...state.wins };
  for (const p of players) wins[p] = wins[p] ?? 0;
  return ok({
    ...initialMandacaruState(),
    phase: 'setup',
    match: state.match + 1,
    wins,
    players,
    layout,
    carcara: desertOf(layout),
    hands: Object.fromEntries(players.map((p) => [p, { res: noResources(), cordeis: [] }])),
    deck,
    turn: players[0]!,
    setup: { index: 0, house: null },
    knights: Object.fromEntries(players.map((p) => [p, 0])),
    tradeSeq: state.tradeSeq,
    turnEndsAt: ctx.now + MANDACARU_TURN_MS,
    startedAt: ctx.now,
    log: [{ t: 'start', order: players }],
  });
}

// A Task 8 troca por `settleMandacaru`.
const settle = (state: MandacaruState, _ctx: GameContext): MandacaruState => state;

/** Ação aceita: confere a vitória de quem está na vez e roda o automático. */
const done = (res: MandacaruResult, ctx: GameContext): MandacaruResult => (res.ok ? ok(settle(checkWin(res.state), ctx)) : res);

/** Por que `player` não pode agir agora como quem está na vez, numa das `phases` (ou null se pode). */
function turnError(state: MandacaruState, player: string, phases: MandacaruPhase[]): string | null {
  if (!phases.includes(state.phase)) return 'bad_phase';
  if (!state.players.includes(player)) return 'not_player';
  if (state.turn !== player) return 'not_your_turn';
  return null;
}

export function applyMandacaruAction(
  state: MandacaruState,
  playerId: string,
  action: MandacaruAction,
  ctx: GameContext,
): MandacaruResult {
  const isHost = ctx.hostId === playerId;
  const mine = (...phases: MandacaruPhase[]): string | null => turnError(state, playerId, phases);
  switch (action.type) {
    case 'start':
      if (!isHost) return fail('not_host');
      if (state.phase !== 'lobby') return fail('bad_phase');
      return done(startMatch(state, ctx), ctx);
    case 'restart':
      if (!isHost) return fail('not_host');
      if (state.phase !== 'over') return fail('bad_phase');
      return done(startMatch(state, ctx), ctx);
    case 'place_house': {
      const e = mine('setup') ?? (state.setup!.house !== null ? 'bad_phase' : null);
      if (e) return fail(e);
      return done(placeHouse(state, playerId, action.vertex), ctx);
    }
    case 'place_road': {
      const e = mine('setup') ?? (state.setup!.house === null ? 'bad_phase' : null);
      if (e) return fail(e);
      return done(placeRoad(state, playerId, action.edge, ctx), ctx);
    }
    case 'roll': {
      const e = mine('roll');
      if (e) return fail(e);
      // Task 5: o 7 abre o descarte e o Carcará.
      return done(ok(rollDice(state, playerId, ctx, (s) => ({ ...s, phase: 'main' }))), ctx);
    }
    case 'build_road': {
      const e = mine('main');
      if (e) return fail(e);
      return done(buildRoad(state, playerId, action.edge), ctx);
    }
    case 'build_house': {
      const e = mine('main');
      if (e) return fail(e);
      return done(buildHouse(state, playerId, action.vertex), ctx);
    }
    case 'build_city': {
      const e = mine('main');
      if (e) return fail(e);
      return done(buildCity(state, playerId, action.vertex), ctx);
    }
    case 'buy_cordel': {
      const e = mine('main');
      if (e) return fail(e);
      return done(buyCordel(state, playerId), ctx);
    }
    case 'end_turn': {
      const e = mine('main');
      if (e) return fail(e);
      return done(ok(passTurn(state, ctx)), ctx);
    }
    default:
      return fail('bad_action');
  }
}
