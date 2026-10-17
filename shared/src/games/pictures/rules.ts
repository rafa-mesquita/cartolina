import type { ActionResult, GameContext } from '../../game';
import { drawSecrets, fullBag } from './bag';
import { drawGrid } from './grid';
import { kitsForRound } from './rotation';
import { scorePicturesRound } from './scoring';
import {
  PICTURES_COUNTDOWN_MS,
  PICTURES_MIN_PLAYERS,
  PICTURES_ROUNDS,
  type PicturesAction,
  type PicturesPhase,
  type PicturesState,
} from './types';
import { isBlankWork, readyError, workError } from './works';

const fail = (error: string): ActionResult<PicturesState> => ({ ok: false, error });
const ok = (state: PicturesState): ActionResult<PicturesState> => ({ ok: true, state });

export function initialPicturesState(): PicturesState {
  return {
    phase: 'lobby',
    players: [],
    inRound: [],
    scores: {},
    round: 0,
    grid: [],
    bag: [],
    secrets: {},
    kits: {},
    works: {},
    ready: [],
    guesses: {},
    confirmed: [],
    countdownEndsAt: null,
    result: null,
    winners: [],
    paused: false,
  };
}

/** Quem joga a rodada e está ativo agora: são eles que precisam ficar prontos / confirmar. */
function here(state: PicturesState, ctx: GameContext): string[] {
  return state.inRound.filter((p) => ctx.active.includes(p));
}

/** Montagem da rodada `round` com quem da partida está ativo. Cada um tira uma ficha e recebe o kit do assento. */
function beginRound(state: PicturesState, ctx: GameContext, round: number): PicturesState {
  const inRound = state.players.filter((p) => ctx.active.includes(p));
  const { secrets, bag } = drawSecrets(ctx.rng, state.bag, inRound);
  return {
    ...state,
    phase: 'building',
    round,
    inRound,
    secrets,
    bag,
    kits: kitsForRound(state.players, inRound, round),
    works: {},
    ready: [],
    guesses: {},
    confirmed: [],
    countdownEndsAt: null,
    result: null,
    paused: inRound.length < PICTURES_MIN_PLAYERS,
  };
}

/** Partida nova com os ativos (também usada em "jogar de novo"): grade e saquinho novos. */
function startMatch(ctx: GameContext): ActionResult<PicturesState> {
  if (ctx.active.length < PICTURES_MIN_PLAYERS) return fail('need_3_players');
  const players = [...ctx.active];
  const fresh: PicturesState = {
    ...initialPicturesState(),
    players,
    scores: Object.fromEntries(players.map((p) => [p, 0])),
    grid: drawGrid(ctx.rng),
    bag: fullBag(),
  };
  return ok(beginRound(fresh, ctx, 0));
}

/** Sem obra em branco: quem só tem rascunho vazio fica como quem nunca mandou. */
function withoutBlankWorks(state: PicturesState): PicturesState {
  const kept = Object.entries(state.works).filter(([, w]) => !isBlankWork(w));
  return kept.length === Object.keys(state.works).length ? state : { ...state, works: Object.fromEntries(kept) };
}

/** As obras congelam como estão (quem nunca mandou rascunho, ou só mandou obra em branco, fica de fora). */
function toGuessing(state: PicturesState): PicturesState {
  return { ...withoutBlankWorks(state), phase: 'guessing', guesses: {}, confirmed: [], countdownEndsAt: null };
}

/** Valem os palpites colados, confirmados ou não. A revelação segue a ordem dos assentos. */
function toReveal(state: PicturesState): PicturesState {
  const order = state.players.filter((p) => state.inRound.includes(p) && Object.hasOwn(state.works, p));
  const { gained, correct } = scorePicturesRound({
    artists: order,
    guessers: state.inRound,
    secrets: state.secrets,
    guesses: state.guesses,
  });
  const scores = { ...state.scores };
  for (const [p, n] of Object.entries(gained)) scores[p] = (scores[p] ?? 0) + n;
  return {
    ...state,
    phase: 'reveal',
    scores,
    countdownEndsAt: null,
    result: {
      round: state.round,
      order,
      secrets: state.secrets,
      kits: state.kits,
      works: state.works,
      guesses: state.guesses,
      correct,
      gained,
    },
  };
}

/**
 * Pausa, contagem e fechamento da montagem/palpite. Roda depois de "pronto"/"confirmar" e a cada `tick` da sala
 * (presença e alarme no fim da contagem). Devolve o MESMO objeto quando nada muda (o servidor compara referência).
 */
export function settlePictures(input: PicturesState, ctx: GameContext): PicturesState {
  if (input.phase !== 'building' && input.phase !== 'guessing') return input;
  const state = input.phase === 'building' ? admitReturners(input, ctx) : input;
  const people = here(state, ctx);
  if (people.length < PICTURES_MIN_PLAYERS) {
    return state.paused && state.countdownEndsAt === null ? state : { ...state, paused: true, countdownEndsAt: null };
  }
  const resumed = state.paused ? { ...state, paused: false } : state;
  const done = resumed.phase === 'building' ? resumed.ready : resumed.confirmed;
  const doneHere = people.filter((p) => done.includes(p)).length;
  const timeUp = resumed.countdownEndsAt !== null && ctx.now >= resumed.countdownEndsAt;
  if (doneHere === people.length || timeUp) {
    if (resumed.phase === 'guessing') return toReveal(resumed);
    // Ninguém montou nada (obra em branco não conta): não há o que palpitar, vai direto pra revelação (vazia).
    const closed = withoutBlankWorks(resumed);
    return Object.keys(closed.works).length === 0 ? toReveal(closed) : toGuessing(closed);
  }
  if (resumed.countdownEndsAt === null && doneHere >= Math.ceil(people.length / 2)) {
    return { ...resumed, countdownEndsAt: ctx.now + PICTURES_COUNTDOWN_MS };
  }
  return resumed;
}

/**
 * Na montagem, quem é da partida, está ativo e ficou de fora da rodada entra nela: ganha ficha e o kit do seu assento
 * (os kits de quem já estava não mudam). Sem ninguém assim, devolve o mesmo objeto.
 */
function admitReturners(state: PicturesState, ctx: GameContext): PicturesState {
  const returners = state.players.filter((p) => ctx.active.includes(p) && !state.inRound.includes(p));
  if (returners.length === 0) return state;
  const inRound = state.players.filter((p) => state.inRound.includes(p) || returners.includes(p));
  const drawn = drawSecrets(ctx.rng, state.bag, returners);
  return {
    ...state,
    inRound,
    secrets: { ...state.secrets, ...drawn.secrets },
    bag: drawn.bag,
    kits: kitsForRound(state.players, inRound, state.round),
  };
}

/** Depois da revelação: fim de jogo na 6ª rodada, senão a próxima montagem. */
function afterReveal(state: PicturesState, ctx: GameContext): PicturesState {
  if (state.round + 1 >= PICTURES_ROUNDS) {
    const top = Math.max(...state.players.map((p) => state.scores[p] ?? 0));
    return { ...state, phase: 'gameover', winners: state.players.filter((p) => (state.scores[p] ?? 0) === top) };
  }
  return beginRound(state, ctx, state.round + 1);
}

/** Por que `playerId` não pode agir nesta fase (ou null se pode). */
function playerError(state: PicturesState, playerId: string, phase: PicturesPhase): string | null {
  if (state.phase !== phase) return 'bad_phase';
  if (!state.inRound.includes(playerId)) return 'not_player';
  return null;
}

export function applyPicturesAction(
  state: PicturesState,
  playerId: string,
  action: PicturesAction,
  ctx: GameContext,
): ActionResult<PicturesState> {
  const isHost = ctx.hostId === playerId;
  switch (action.type) {
    case 'start':
      if (!isHost) return fail('not_host');
      if (state.phase !== 'lobby') return fail('bad_phase');
      return startMatch(ctx);
    case 'lobby':
      if (!isHost) return fail('not_host');
      if (state.phase === 'lobby') return fail('bad_phase');
      return ok(initialPicturesState());
    case 'draft': {
      const e = playerError(state, playerId, 'building');
      if (e) return fail(e);
      if (state.ready.includes(playerId)) return fail('already_ready');
      if (action.work.kit !== state.kits[playerId]) return fail('wrong_kit');
      const bad = workError(action.work);
      if (bad) return fail(bad);
      return ok({ ...state, works: { ...state.works, [playerId]: action.work } });
    }
    case 'ready': {
      const e = playerError(state, playerId, 'building');
      if (e) return fail(e);
      if (!action.on) return ok({ ...state, ready: state.ready.filter((p) => p !== playerId) });
      if (state.ready.includes(playerId)) return fail('already_ready');
      const notYet = readyError(state.works[playerId]);
      if (notYet) return fail(notYet);
      return ok(settlePictures({ ...state, ready: [...state.ready, playerId] }, ctx));
    }
    case 'guess': {
      const e = playerError(state, playerId, 'guessing');
      if (e) return fail(e);
      if (state.confirmed.includes(playerId)) return fail('already_confirmed');
      if (action.artist === playerId) return fail('own_work');
      if (!state.inRound.includes(action.artist) || !Object.hasOwn(state.works, action.artist)) return fail('no_work');
      const rest = Object.fromEntries(Object.entries(state.guesses[playerId] ?? {}).filter(([a]) => a !== action.artist));
      const mine = action.coord === null ? rest : { ...rest, [action.artist]: action.coord };
      return ok({ ...state, guesses: { ...state.guesses, [playerId]: mine } });
    }
    case 'confirm': {
      const e = playerError(state, playerId, 'guessing');
      if (e) return fail(e);
      if (state.confirmed.includes(playerId)) return fail('already_confirmed');
      return ok(settlePictures({ ...state, confirmed: [...state.confirmed, playerId] }, ctx));
    }
    case 'hurry':
      if (!isHost) return fail('not_host');
      if (state.phase !== 'building' && state.phase !== 'guessing') return fail('bad_phase');
      if (state.paused) return fail('paused');
      if (state.countdownEndsAt !== null) return ok(state);
      return ok({ ...state, countdownEndsAt: ctx.now + PICTURES_COUNTDOWN_MS });
    case 'next':
      if (!isHost) return fail('not_host');
      if (state.phase !== 'reveal') return fail('bad_phase');
      if (state.players.filter((p) => ctx.active.includes(p)).length < PICTURES_MIN_PLAYERS) return fail('need_3_players');
      return ok(afterReveal(state, ctx));
    case 'again':
      if (!isHost) return fail('not_host');
      if (state.phase !== 'gameover') return fail('bad_phase');
      return startMatch(ctx);
    default:
      return fail('bad_action');
  }
}
