import type { ActionResult, GameContext } from '../../game';
import { geometry } from './board';
import { MANDACARU_BANK_EACH, noResources, type MandacaruAction, type MandacaruState } from './types';

// Provisório: a Task 4 completa as regras.

export function initialMandacaruState(): MandacaruState {
  const g = geometry();
  const bank = noResources();
  for (const k of Object.keys(bank) as (keyof typeof bank)[]) bank[k] = MANDACARU_BANK_EACH;
  return {
    phase: 'lobby', match: 0, wins: {}, players: [], layout: null, carcara: 0,
    buildings: g.vertices.map(() => null), roads: g.edges.map(() => null), hands: {}, bank, deck: [],
    turn: null, setup: null, rolled: false, dice: null, diceCounts: Array(13).fill(0), cordelPlayed: false,
    discards: {}, afterCarcara: 'main', mutiraoLeft: 0, offer: null, proposals: [], tradeSeq: 0,
    longestRoad: null, largestArmy: null, knights: {}, turnEndsAt: null, discardEndsAt: null,
    startedAt: null, turns: 0, winner: null, lastSteal: null, log: [],
  };
}

export function applyMandacaruAction(state: MandacaruState, _p: string, _a: MandacaruAction, _ctx: GameContext): ActionResult<MandacaruState> {
  return { ok: false, error: 'bad_action' };
}
