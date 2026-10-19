import type { ActionResult, GameContext } from '../../game';
import { randomInt, shuffle } from '../../rng';
import { camelioCardIds } from './deck';
import { camelioPoints, camelioSpheresInPlay } from './scoring';
import { CAMELIO_MIN_PLAYERS, type CamelioAction, type CamelioState } from './types';

const fail = (error: string): ActionResult<CamelioState> => ({ ok: false, error });
const ok = (state: CamelioState): ActionResult<CamelioState> => ({ ok: true, state });

/** Meta: pontos em 4 cores com 2 jogadores, 3 com 3 a 6. */
export const camelioTarget = (players: number): number => (players === 2 ? 4 : 3);

export function initialCamelioState(): CamelioState {
  return {
    phase: 'lobby',
    players: [],
    deck: [],
    open: null,
    discard: [],
    reshuffled: false,
    table: {},
    scored: {},
    turn: null,
    target: 3,
    paused: false,
    log: [],
    winners: [],
    endReason: null,
    match: 0,
  };
}

/** `players` girado pra começar logo depois de `after` (ou do começo, se `after` não estiver lá). */
function rotateAfter(players: readonly string[], after: string | null): string[] {
  const start = after === null ? 0 : players.indexOf(after) + 1;
  return [...players.slice(start), ...players.slice(0, start)];
}

/**
 * "Jogar de novo": começa quem ficou em último na partida anterior (menos pontos, depois menos esferas em jogo),
 * procurando a partir de quem vem depois do (primeiro) vencedor. Quem chegou agora não jogou a anterior e conta como zero.
 */
function loserOf(prev: CamelioState, players: readonly string[]): string {
  const order = [
    ...rotateAfter(prev.players, prev.winners[0] ?? null).filter((p) => players.includes(p)),
    ...players.filter((p) => !prev.players.includes(p)),
  ];
  const keyOf = (p: string): [number, number] => {
    const scored = prev.scored[p] ?? [];
    return [camelioPoints(scored), camelioSpheresInPlay(prev.table[p] ?? [], scored)];
  };
  let pick = order[0]!;
  for (const p of order) {
    const [pts, sph] = keyOf(p);
    const [bestPts, bestSph] = keyOf(pick);
    if (pts < bestPts || (pts === bestPts && sph < bestSph)) pick = p;
  }
  return pick;
}

/** Partida nova com os ativos (também usada em "jogar de novo"). */
function startMatch(state: CamelioState, ctx: GameContext, again: boolean): ActionResult<CamelioState> {
  if (ctx.active.length < CAMELIO_MIN_PLAYERS) return fail('not_enough_players');
  const players = [...ctx.active];
  const deck = shuffle(ctx.rng, camelioCardIds());
  const open = deck.pop()!;
  const turn = again ? loserOf(state, players) : players[randomInt(ctx.rng, players.length)]!;
  return ok({
    ...initialCamelioState(),
    phase: 'playing',
    match: state.match + 1,
    players,
    deck,
    open,
    table: Object.fromEntries(players.map((p) => [p, []])),
    scored: Object.fromEntries(players.map((p) => [p, []])),
    turn,
    target: camelioTarget(players.length),
  });
}

export function applyCamelioAction(
  state: CamelioState,
  playerId: string,
  action: CamelioAction,
  ctx: GameContext,
): ActionResult<CamelioState> {
  const isHost = ctx.hostId === playerId;
  switch (action.type) {
    case 'start':
      if (!isHost) return fail('not_host');
      if (state.phase !== 'lobby') return fail('bad_phase');
      return startMatch(state, ctx, false);
    case 'again':
      if (!isHost) return fail('not_host');
      if (state.phase !== 'over') return fail('bad_phase');
      return startMatch(state, ctx, true);
    case 'lobby':
      if (!isHost) return fail('not_host');
      if (state.phase === 'lobby') return fail('bad_phase');
      return ok({ ...initialCamelioState(), match: state.match });
    default:
      return fail('bad_action');
  }
}
