import type { GameContext } from '../../game';
import { shuffle } from '../../rng';
import { settleMandacaru } from './auto';
import { geometry } from './board';
import { fail, ok, type MandacaruResult } from './build';
import { discard, moveCarcara, playVaqueiro, startSeven, steal } from './carcara';
import { playAtravessador, playChuva, playMutirao, shuffledCordelDeck } from './cordel';
import { desertOf, randomLayout } from './setup';
import { cancelOffer, closeDeal, feira, makeOffer, propose, respond } from './trade';
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

/** Ação aceita: confere a vitória de quem está na vez e roda o automático. */
const done = (res: MandacaruResult, ctx: GameContext): MandacaruResult => (res.ok ? ok(settleMandacaru(checkWin(res.state), ctx)) : res);

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
      return done(ok(rollDice(state, playerId, ctx, startSeven)), ctx);
    }
    case 'discard': {
      if (state.phase !== 'discard') return fail('bad_phase');
      if (!state.players.includes(playerId)) return fail('not_player');
      return done(discard(state, playerId, action.cards), ctx);
    }
    case 'move_carcara': {
      const e = mine('carcara');
      if (e) return fail(e);
      return done(moveCarcara(state, playerId, action.hex, ctx), ctx);
    }
    case 'steal': {
      const e = mine('steal');
      if (e) return fail(e);
      return done(steal(state, playerId, action.from, ctx), ctx);
    }
    case 'play_vaqueiro': {
      const e = mine('roll', 'main');
      if (e) return fail(e);
      return done(playVaqueiro(state, playerId), ctx);
    }
    case 'build_road': {
      // No Mutirão a estrada sai de graça.
      const e = mine('main', 'mutirao');
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
    case 'play_mutirao': {
      const e = mine('main');
      if (e) return fail(e);
      return done(playMutirao(state, playerId), ctx);
    }
    case 'play_chuva': {
      const e = mine('main');
      if (e) return fail(e);
      return done(playChuva(state, playerId, action.resources), ctx);
    }
    case 'play_atravessador': {
      const e = mine('main');
      if (e) return fail(e);
      return done(playAtravessador(state, playerId, action.resource), ctx);
    }
    // Troca: as funções de trade.ts conferem fase e vez.
    case 'offer':
      return done(makeOffer(state, playerId, action.give, action.want), ctx);
    case 'cancel_offer':
      return done(cancelOffer(state, playerId), ctx);
    case 'respond':
      return done(respond(state, playerId, action.offerId, action.accept), ctx);
    case 'propose':
      return done(propose(state, playerId, action.give, action.want), ctx);
    case 'close_deal':
      return done(closeDeal(state, playerId, action.with, action.source, action.id), ctx);
    case 'feira':
      return done(feira(state, playerId, action.give, action.want, action.count ?? 1), ctx);
    case 'end_turn': {
      const e = mine('main');
      if (e) return fail(e);
      return done(ok(passTurn(state, ctx)), ctx);
    }
    default:
      return fail('bad_action');
  }
}
