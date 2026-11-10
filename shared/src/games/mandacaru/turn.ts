import type { GameContext } from '../../game';
import { randomInt } from '../../rng';
import {
  canAfford,
  citySpots,
  fail,
  grant,
  houseSpots,
  logged,
  ok,
  pay,
  piecesLeft,
  points,
  roadSpots,
  type MandacaruResult,
} from './build';
import { updateAwards } from './longest';
import { produce, setupGain } from './production';
import { COSTS, MANDACARU_TURN_MS, MANDACARU_WIN_POINTS, type MandacaruState } from './types';

/** Ordem em cobra da preparação: [...players, ...reverse]. */
export function setupOrder(players: string[]): string[] {
  return [...players, ...[...players].reverse()];
}

/** Preparação: `player` põe a casa da vez (regra da distância, sem precisar de estrada). A segunda casa rende. */
export function placeHouse(state: MandacaruState, player: string, vertex: number): MandacaruResult {
  if (!houseSpots(state, player, true).includes(vertex)) return fail('bad_spot');
  const buildings = state.buildings.map((b, i) => (i === vertex ? { owner: player, kind: 'house' as const } : b));
  const setup = { ...state.setup!, house: vertex };
  let s = logged({ ...state, buildings, setup }, { t: 'place', player, piece: 'house', at: vertex });
  if (setup.index >= state.players.length) {
    const gain = setupGain(s, vertex);
    s = logged(grant(s, player, gain), { t: 'setup_gain', player, gain });
  }
  return ok(s);
}

/** Preparação: `player` põe a estrada encostada na casa recém-posta e a vez anda na cobra. */
export function placeRoad(state: MandacaruState, player: string, edge: number, ctx: GameContext): MandacaruResult {
  const setup = state.setup!;
  if (setup.house === null || !roadSpots(state, player, setup.house).includes(edge)) return fail('bad_spot');
  const roads = state.roads.map((o, i) => (i === edge ? player : o));
  const s = logged({ ...state, roads }, { t: 'place', player, piece: 'road', at: edge });
  const index = setup.index + 1;
  const order = setupOrder(state.players);
  const turnEndsAt = ctx.now + MANDACARU_TURN_MS;
  if (index >= order.length) {
    return ok({ ...s, phase: 'roll', setup: null, turn: state.players[0]!, rolled: false, turnEndsAt });
  }
  return ok({ ...s, setup: { index, house: null }, turn: order[index]!, turnEndsAt });
}

/**
 * Rola os dois dados (os dois primeiros sorteios do rng) e aplica a produção. O 7 é tratado por `onSeven`
 * (fluxo do descarte e do Carcará), que fica em outro arquivo.
 */
export function rollDice(
  state: MandacaruState,
  player: string,
  ctx: GameContext,
  onSeven: (state: MandacaruState, ctx: GameContext) => MandacaruState,
): MandacaruState {
  const d1 = randomInt(ctx.rng, 6) + 1;
  const d2 = randomInt(ctx.rng, 6) + 1;
  const sum = d1 + d2;
  const dice: [number, number] = [d1, d2];
  const diceCounts = state.diceCounts.map((n, i) => (i === sum ? n + 1 : n));
  const s: MandacaruState = { ...state, dice, diceCounts, rolled: true };
  if (sum === 7) return onSeven(logged(s, { t: 'roll', player, dice, gains: {}, short: [] }), ctx);
  const made = produce(s, sum);
  return { ...logged(made.state, { t: 'roll', player, dice, gains: made.gains, short: made.short }), phase: 'main' };
}

/** Estrada: paga na fase principal; no Mutirão sai de graça e conta as que faltam. */
export function buildRoad(state: MandacaruState, player: string, edge: number): MandacaruResult {
  if (piecesLeft(state, player).road <= 0) return fail('no_pieces');
  if (!roadSpots(state, player).includes(edge)) return fail('bad_spot');
  const free = state.phase === 'mutirao';
  if (!free && !canAfford(state.hands[player]!.res, COSTS.road)) return fail('cannot_afford');
  const paid = free ? state : pay(state, player, COSTS.road);
  const roads = paid.roads.map((o, i) => (i === edge ? player : o));
  let s = updateAwards(logged({ ...paid, roads }, { t: 'build', player, piece: 'road', at: edge }));
  if (free) {
    const left = s.mutiraoLeft - 1;
    const more = left > 0 && piecesLeft(s, player).road > 0 && roadSpots(s, player).length > 0;
    s = more ? { ...s, mutiraoLeft: left } : { ...s, mutiraoLeft: 0, phase: 'main' };
  }
  return ok(s);
}

export function buildHouse(state: MandacaruState, player: string, vertex: number): MandacaruResult {
  if (piecesLeft(state, player).house <= 0) return fail('no_pieces');
  if (!houseSpots(state, player, false).includes(vertex)) return fail('bad_spot');
  if (!canAfford(state.hands[player]!.res, COSTS.house)) return fail('cannot_afford');
  const paid = pay(state, player, COSTS.house);
  const buildings = paid.buildings.map((b, i) => (i === vertex ? { owner: player, kind: 'house' as const } : b));
  // A casa nova pode cortar a estrada de alguém.
  return ok(updateAwards(logged({ ...paid, buildings }, { t: 'build', player, piece: 'house', at: vertex })));
}

export function buildCity(state: MandacaruState, player: string, vertex: number): MandacaruResult {
  if (piecesLeft(state, player).city <= 0) return fail('no_pieces');
  if (!citySpots(state, player).includes(vertex)) return fail('bad_spot');
  if (!canAfford(state.hands[player]!.res, COSTS.city)) return fail('cannot_afford');
  const paid = pay(state, player, COSTS.city);
  const buildings = paid.buildings.map((b, i) => (i === vertex ? { owner: player, kind: 'city' as const } : b));
  return ok(logged({ ...paid, buildings }, { t: 'build', player, piece: 'city', at: vertex }));
}

/** Compra o cordel de cima do monte; entra na mão como "novo" (não pode ser jogado neste turno). */
export function buyCordel(state: MandacaruState, player: string): MandacaruResult {
  const kind = state.deck[0];
  if (kind === undefined) return fail('deck_empty');
  if (!canAfford(state.hands[player]!.res, COSTS.cordel)) return fail('cannot_afford');
  const paid = pay(state, player, COSTS.cordel);
  const hand = paid.hands[player]!;
  const hands = { ...paid.hands, [player]: { ...hand, cordeis: [...hand.cordeis, { kind, fresh: true }] } };
  return ok(logged({ ...paid, hands, deck: paid.deck.slice(1) }, { t: 'buy_cordel', player }));
}

/** Passa a vez: próximo da ordem, fase `roll`, limpa oferta/propostas, cordéis deixam de ser "novos", relógio novo. */
export function endTurn(state: MandacaruState, ctx: GameContext): MandacaruState {
  const i = state.players.indexOf(state.turn!);
  const turn = state.players[(i + 1) % state.players.length]!;
  const hands: MandacaruState['hands'] = {};
  for (const [p, hand] of Object.entries(state.hands)) {
    hands[p] = hand.cordeis.some((c) => c.fresh) ? { ...hand, cordeis: hand.cordeis.map((c) => ({ ...c, fresh: false })) } : hand;
  }
  return {
    ...state,
    phase: 'roll',
    turn,
    hands,
    rolled: false,
    cordelPlayed: false,
    discards: {},
    afterCarcara: 'main',
    mutiraoLeft: 0,
    offer: null,
    proposals: [],
    turnEndsAt: ctx.now + MANDACARU_TURN_MS,
    discardEndsAt: null,
  };
}

/** "Passar a vez" completo: diário, conta o turno, passa e confere se o novo jogador já começa vencendo. */
export function passTurn(state: MandacaruState, ctx: GameContext): MandacaruState {
  const s = logged({ ...state, turns: state.turns + 1 }, { t: 'end_turn', player: state.turn! });
  return checkWin(endTurn(s, ctx));
}

/** Se quem está na vez tem 10+ (com os escondidos), termina a partida. Devolve o mesmo objeto se não. */
export function checkWin(state: MandacaruState): MandacaruState {
  if (state.phase === 'lobby' || state.phase === 'over' || state.turn === null) return state;
  const winner = state.turn;
  const total = points(state, winner, true);
  if (total < MANDACARU_WIN_POINTS) return state;
  return logged(
    {
      ...state,
      phase: 'over',
      winner,
      wins: { ...state.wins, [winner]: (state.wins[winner] ?? 0) + 1 },
      offer: null,
      proposals: [],
      discards: {},
      turnEndsAt: null,
      discardEndsAt: null,
    },
    { t: 'win', player: winner, points: total },
  );
}
