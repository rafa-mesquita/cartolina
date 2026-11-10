import type { GameModule } from '../../game';
import { canAfford, citySpots, handSize, houseSpots, piecesLeft, points, portRates, roadSpots } from './build';
import { victims } from './carcara';
import { roadLength } from './longest';
import { applyMandacaruAction, initialMandacaruState } from './rules';
import { settleMandacaru } from './auto';
import {
  COSTS,
  type CordelKind,
  type MandacaruAction,
  type MandacaruCan,
  type MandacaruSeat,
  type MandacaruState,
  type MandacaruView,
} from './types';

const nothing = (): MandacaruCan => ({
  placeHouse: [],
  placeRoad: [],
  roll: false,
  discard: 0,
  carcara: [],
  steal: [],
  buildRoad: [],
  buildHouse: [],
  buildCity: [],
  buyCordel: false,
  play: [],
  feira: {},
  offer: false,
  respond: false,
  propose: false,
  endTurn: false,
});

/** Cordéis que `me` pode jogar agora: os velhos (sem o Ponto), um por turno; na fase `roll`, só o Vaqueiro. */
function playable(state: MandacaruState, me: string): Exclude<CordelKind, 'point'>[] {
  if (state.cordelPlayed || (state.phase !== 'main' && state.phase !== 'roll')) return [];
  const out: Exclude<CordelKind, 'point'>[] = [];
  for (const c of state.hands[me]!.cordeis) {
    if (c.fresh || c.kind === 'point' || out.includes(c.kind)) continue;
    if (state.phase === 'roll' && c.kind !== 'vaqueiro') continue;
    out.push(c.kind);
  }
  return out;
}

/** O que `me` pode fazer agora (a mesa mostra só esses botões; as regras conferem de novo). */
function canFor(state: MandacaruState, me: string | null): MandacaruCan {
  const can = nothing();
  if (me === null || state.phase === 'lobby' || state.phase === 'over') return can;
  can.discard = state.phase === 'discard' ? (state.discards[me] ?? 0) : 0;
  const mine = state.turn === me;
  if (!mine) {
    if (state.phase === 'main') {
      can.respond = state.offer !== null;
      can.propose = true;
    }
    return can;
  }
  const have = state.hands[me]!.res;
  const left = piecesLeft(state, me);
  switch (state.phase) {
    case 'setup': {
      const house = state.setup?.house ?? null;
      if (house === null) can.placeHouse = houseSpots(state, me, true);
      else can.placeRoad = roadSpots(state, me, house);
      break;
    }
    case 'roll':
      can.roll = true;
      can.play = playable(state, me);
      break;
    case 'carcara': {
      const count = state.layout?.hexes.length ?? 0;
      can.carcara = Array.from({ length: count }, (_, h) => h).filter((h) => h !== state.carcara);
      break;
    }
    case 'steal':
      can.steal = victims(state, state.carcara, me);
      break;
    case 'mutirao':
      if (left.road > 0) can.buildRoad = roadSpots(state, me);
      break;
    case 'main':
      if (left.road > 0 && canAfford(have, COSTS.road)) can.buildRoad = roadSpots(state, me);
      if (left.house > 0 && canAfford(have, COSTS.house)) can.buildHouse = houseSpots(state, me, false);
      if (left.city > 0 && canAfford(have, COSTS.city)) can.buildCity = citySpots(state, me);
      can.buyCordel = state.deck.length > 0 && canAfford(have, COSTS.cordel);
      can.play = playable(state, me);
      can.feira = portRates(state, me);
      can.offer = true;
      can.endTurn = true;
      break;
  }
  return can;
}

function seatOf(state: MandacaruState, id: string): MandacaruSeat {
  const hand = state.hands[id];
  return {
    id,
    points: points(state, id, state.phase === 'over'),
    resCount: hand ? handSize(hand.res) : 0,
    cordelCount: hand?.cordeis.length ?? 0,
    knights: state.knights[id] ?? 0,
    roadLength: roadLength(state, id),
    piecesLeft: piecesLeft(state, id),
  };
}

/**
 * Única fronteira de segredo do Mandacaru: o monte, as mãos e os cordéis dos outros e o recurso roubado
 * (pra quem não roubou nem foi roubado) nunca saem daqui. A visão compartilha arrays/objetos com o estado
 * (é serializada no socket); quem consome não deve mutar.
 */
export function mandacaruViewFor(state: MandacaruState, viewerId: string | null): MandacaruView {
  const me = viewerId !== null && state.players.includes(viewerId) && state.hands[viewerId] ? viewerId : null;
  const steal = state.lastSteal;
  return {
    phase: state.phase,
    match: state.match,
    wins: state.wins,
    players: state.players,
    layout: state.layout,
    carcara: state.carcara,
    buildings: state.buildings,
    roads: state.roads,
    bank: state.bank,
    deckSize: state.deck.length,
    turn: state.turn,
    setup: state.setup,
    rolled: state.rolled,
    dice: state.dice,
    diceCounts: state.diceCounts,
    discards: state.discards,
    mutiraoLeft: state.mutiraoLeft,
    offer: state.offer,
    proposals: state.proposals,
    longestRoad: state.longestRoad,
    largestArmy: state.largestArmy,
    seats: state.players.map((id) => seatOf(state, id)),
    turnEndsAt: state.turnEndsAt,
    discardEndsAt: state.discardEndsAt,
    winner: state.winner,
    log: state.log,
    myRes: me !== null ? state.hands[me]!.res : null,
    myCordeis: me !== null ? state.hands[me]!.cordeis : [],
    myPoints: me !== null ? points(state, me, true) : null,
    pointCards:
      state.phase === 'over'
        ? Object.fromEntries(state.players.map((p) => [p, state.hands[p]?.cordeis.filter((c) => c.kind === 'point').length ?? 0]))
        : null,
    stolen: steal !== null && me !== null && (steal.thief === me || steal.victim === me) ? steal : null,
    can: canFor(state, me),
  };
}

/**
 * O prazo que o automático resolve na fase atual: no descarte, só o fim do descarte (o turno pode já ter
 * estourado, e o `settle` só olha o turno depois do descarte: um prazo no passado deixaria o alarme em laço);
 * nas outras fases da partida, o fim do turno; null fora de partida.
 */
export function mandacaruNextDeadline(state: MandacaruState): number | null {
  if (state.phase === 'lobby' || state.phase === 'over') return null;
  return state.phase === 'discard' ? state.discardEndsAt : state.turnEndsAt;
}

export const mandacaru: GameModule<MandacaruState, MandacaruAction, MandacaruView> = {
  id: 'mandacaru',
  initialState: () => initialMandacaruState(),
  applyAction: applyMandacaruAction,
  viewFor: mandacaruViewFor,
  onPresenceChange: settleMandacaru,
  nextDeadline: mandacaruNextDeadline,
};
