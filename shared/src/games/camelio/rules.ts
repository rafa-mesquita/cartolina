import type { ActionResult, GameContext } from '../../game';
import { randomInt, shuffle } from '../../rng';
import { camelioCard, camelioCardIds } from './deck';
import { camelioDeckEndWinners, camelioPoints, camelioSpheresInPlay, resolveCamelioPlay } from './scoring';
import { CAMELIO_MIN_PLAYERS, type CamelioAction, type CamelioFrom, type CamelioPlay, type CamelioState } from './types';

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

/** Próximo jogador da partida depois de `after` que está ativo (pode ser o próprio `after`, se só ele estiver). */
function nextActive(players: readonly string[], active: readonly string[], after: string): string | null {
  return rotateAfter(players, after).find((p) => active.includes(p)) ?? null;
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

/** Uma jogada (spec §2.3): pega a carta, põe na mesa de `to`, resolve, repõe a aberta, confere meta e monte, passa a vez. */
function play(state: CamelioState, playerId: string, from: CamelioFrom, to: string, ctx: GameContext): ActionResult<CamelioState> {
  if (state.phase !== 'playing' || state.paused) return fail('not_playing');
  if (state.turn !== playerId) return fail('not_your_turn');
  if (!state.players.includes(to) || !ctx.active.includes(to)) return fail('bad_target');

  const deck = [...state.deck];
  let open = state.open;
  let card: number;
  if (from === 'open') {
    if (open === null) return fail('not_playing'); // defensivo: não acontece, toda vez começa com aberta e monte (spec §2.3)
    card = open;
    open = deck.pop() ?? null;
  } else {
    const top = deck.pop();
    if (top === undefined) return fail('not_playing'); // idem: o monte nunca fica vazio entre vezes
    card = top;
  }

  const res = resolveCamelioPlay(state.table[to] ?? [], state.scored[to] ?? [], card);
  const entry: CamelioPlay = { by: playerId, from, to, card, outcome: res.outcome, color: camelioCard(card).color, sum: res.sum };
  let next: CamelioState = {
    ...state,
    deck,
    open,
    discard: [...state.discard, ...res.discarded],
    table: { ...state.table, [to]: res.table },
    scored: { ...state.scored, [to]: res.scored },
    log: [...state.log, entry],
  };

  if (camelioPoints(res.scored) >= state.target) {
    return ok({ ...next, phase: 'over', turn: null, winners: [to], endReason: 'target' });
  }
  if (next.deck.length === 0) {
    if (!next.reshuffled && next.discard.length > 0) {
      next = { ...next, deck: shuffle(ctx.rng, next.discard), discard: [], reshuffled: true };
    } else {
      return ok({
        ...next,
        phase: 'over',
        turn: null,
        winners: camelioDeckEndWinners(next.players, next.table, next.scored),
        endReason: 'deck',
      });
    }
  }
  return ok({ ...next, turn: nextActive(next.players, ctx.active, playerId) });
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
    case 'play':
      return play(state, playerId, action.from, action.to, ctx);
    default:
      return fail('bad_action');
  }
}

/**
 * Reavaliado quando alguém entra, sai ou expira a tolerância de desconexão (spec §2.5).
 * Devolve o MESMO objeto quando nada muda (o servidor compara referência).
 */
export function camelioOnPresenceChange(state: CamelioState, ctx: GameContext): CamelioState {
  if (state.phase !== 'playing') return state;
  const here = state.players.filter((p) => ctx.active.includes(p));
  const paused = here.length < CAMELIO_MIN_PLAYERS;
  const turn =
    !paused && state.turn !== null && !ctx.active.includes(state.turn)
      ? nextActive(state.players, ctx.active, state.turn)
      : state.turn;
  if (paused === state.paused && turn === state.turn) return state;
  return { ...state, paused, turn };
}
