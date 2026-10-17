import type { ActionResult, GameContext } from '../../game';
import { randomInt, shuffle, type Rng } from '../../rng';
import { DIXIT_DECK_SIZE, dixitCardIds } from './deck';
import { scoreRound } from './scoring';
import {
  DIXIT_CLUE_MAX,
  DIXIT_DEFAULT_TARGET,
  DIXIT_MIN_PLAYERS,
  type DixitAction,
  type DixitPhase,
  type DixitState,
  type DixitTarget,
} from './types';

const fail = (error: string): ActionResult<DixitState> => ({ ok: false, error });
const ok = (state: DixitState): ActionResult<DixitState> => ({ ok: true, state });

/** Mão: 7 cartas com 3 jogadores, 6 com mais. */
export const dixitHandSize = (players: number): number => (players === 3 ? 7 : 6);
/** Cartas que cada não-narrador joga: 2 com 3 jogadores, 1 com mais. */
export const dixitPicksPerPlayer = (players: number): number => (players === 3 ? 2 : 1);
/** O baralho precisa cobrir as mãos e uma rodada inteira. */
export const dixitDeckTooSmall = (players: number, deckSize: number = DIXIT_DECK_SIZE): boolean => deckSize < players * 7;

/**
 * Diferente de `cleanClue` (players.ts), que preserva o espaço final porque a dica do ITO é digitada
 * ao vivo: aqui a dica é enviada uma vez só, então aparamos tudo e limitamos a 80 caracteres.
 */
export function cleanDixitClue(raw: string): string {
  return Array.from(raw.replace(/\s+/g, ' ').trim()).slice(0, DIXIT_CLUE_MAX).join('');
}

export function initialDixitState(target: DixitTarget = DIXIT_DEFAULT_TARGET): DixitState {
  return {
    phase: 'lobby',
    target,
    players: [],
    inRound: [],
    scores: {},
    storyteller: null,
    deck: [],
    discard: [],
    hands: {},
    clue: '',
    storyCard: null,
    picks: {},
    votes: {},
    confirmed: [],
    table: [],
    result: null,
    winners: [],
    paused: false,
    match: 0,
    round: 0,
  };
}

/**
 * Estado gravado antes do histórico do Diquisti não tem `match` nem `round`: partida em andamento vira a partida 1
 * (rodada 0, a próxima narração já é a 1). Sem isso, todas as revelações dela teriam a mesma chave.
 */
export function withDixitCounters(state: DixitState): DixitState {
  const stored = state as Omit<DixitState, 'match' | 'round'> & Partial<Pick<DixitState, 'match' | 'round'>>;
  if (stored.match !== undefined && stored.round !== undefined) return state;
  return { ...state, match: stored.match ?? (state.phase === 'lobby' ? 0 : 1), round: stored.round ?? 0 };
}

/**
 * Compra até a mão cheia; baralho vazio → embaralha o descarte e continua.
 * Se nem o descarte tem carta e alguém ainda precisa, recolhe as mãos de quem não está em `playerIds`
 * (saiu e pode nunca voltar) pro descarte. Só nesse caso: quem volta normalmente mantém as cartas.
 */
function refill(state: DixitState, playerIds: readonly string[], size: number, rng: Rng): DixitState {
  let deck = [...state.deck];
  let discard = [...state.discard];
  const hands = { ...state.hands };
  let reclaimed = false;
  for (const id of playerIds) {
    const hand = [...(hands[id] ?? [])];
    while (hand.length < size) {
      if (deck.length === 0) {
        if (discard.length === 0 && !reclaimed) {
          reclaimed = true;
          for (const other of Object.keys(hands)) {
            if (playerIds.includes(other)) continue;
            discard = [...discard, ...(hands[other] ?? [])];
            hands[other] = [];
          }
        }
        if (discard.length === 0) break;
        deck = shuffle(rng, discard);
        discard = [];
      }
      hand.push(deck.shift()!);
    }
    hands[id] = hand;
  }
  return { ...state, deck, discard, hands };
}

/** Próximo narrador depois de `after` na ordem da partida, entre quem está na rodada e ativo. */
function nextStoryteller(state: DixitState, active: readonly string[], after: string | null): string | null {
  const order = state.players;
  const start = after === null ? 0 : order.indexOf(after) + 1;
  const rotated = [...order.slice(start), ...order.slice(0, start)];
  return rotated.find((p) => state.inRound.includes(p) && active.includes(p)) ?? null;
}

/**
 * Começa (ou recomeça) a narração: entra quem chegou, mãos cheias, narrador definido.
 * As mãos só são completadas, nunca reduzidas: passar de 3 para 4 jogadores deixa mãos de 7 por uma rodada (aceito).
 */
function beginRound(state: DixitState, ctx: GameContext, storyteller: { keep: string } | { after: string | null }): DixitState {
  const joiners = ctx.active.filter((p) => !state.players.includes(p));
  const players = [...state.players, ...joiners];
  const inRound = players.filter((p) => ctx.active.includes(p));
  const scores = { ...state.scores };
  for (const p of joiners) scores[p] = 0;
  const reset: DixitState = {
    ...state,
    phase: 'storytelling',
    players,
    inRound,
    scores,
    clue: '',
    storyCard: null,
    picks: {},
    votes: {},
    confirmed: [],
    table: [],
    result: null,
    paused: inRound.length < DIXIT_MIN_PLAYERS,
    round: state.round + 1,
  };
  const dealt = refill(reset, inRound, dixitHandSize(inRound.length), ctx.rng);
  const chosen = 'keep' in storyteller ? storyteller.keep : nextStoryteller(dealt, ctx.active, storyteller.after);
  return { ...dealt, storyteller: chosen };
}

function hostOnly(isHost: boolean, state: DixitState, phase: DixitPhase): string | null {
  if (!isHost) return 'not_host';
  if (state.phase !== phase) return 'bad_phase';
  return null;
}

/** Partida nova com os ativos (também usada em "jogar de novo"). */
function startMatch(state: DixitState, ctx: GameContext): ActionResult<DixitState> {
  if (ctx.active.length < DIXIT_MIN_PLAYERS) return fail('need_3_players');
  if (dixitDeckTooSmall(ctx.active.length)) return fail('deck_too_small');
  const players = [...ctx.active];
  const fresh: DixitState = {
    ...initialDixitState(state.target),
    match: state.match + 1,
    players,
    scores: Object.fromEntries(players.map((p) => [p, 0])),
    deck: shuffle(ctx.rng, dixitCardIds()),
  };
  const first = players[randomInt(ctx.rng, players.length)]!;
  return ok(beginRound(fresh, ctx, { keep: first }));
}

/** Não-narradores da rodada que estão ativos: são eles que precisam confirmar. */
function mustAct(state: DixitState, ctx: GameContext): string[] {
  return state.inRound.filter((p) => p !== state.storyteller && ctx.active.includes(p));
}

/** Por que `playerId` não pode agir nesta etapa (ou null se pode). */
function actorError(state: DixitState, playerId: string, phase: DixitPhase): string | null {
  if (state.phase !== phase) return 'bad_phase';
  if (state.paused) return 'paused';
  if (!state.inRound.includes(playerId)) return 'not_player';
  if (playerId === state.storyteller) return 'is_storyteller';
  if (state.confirmed.includes(playerId)) return 'already_confirmed';
  return null;
}

/** Só as escolhas confirmadas vão pra mesa, embaralhadas junto com a do narrador. */
function toVoting(state: DixitState, ctx: GameContext): DixitState {
  const picks: Record<string, string[]> = Object.fromEntries(state.confirmed.map((p) => [p, state.picks[p] ?? []]));
  const played = Object.values(picks).flat();
  const hands = { ...state.hands };
  for (const [p, cards] of Object.entries(picks)) hands[p] = (hands[p] ?? []).filter((c) => !cards.includes(c));
  const table = shuffle(ctx.rng, [state.storyCard!, ...played]);
  return { ...state, phase: 'voting', picks, hands, table, votes: {}, confirmed: [] };
}

/** Só votos confirmados contam. Cartas da mesa vão pro descarte. */
function toReveal(state: DixitState): DixitState {
  const storyteller = state.storyteller!;
  const storyCard = state.storyCard!;
  const votes: Record<string, string> = {};
  for (const p of state.confirmed) {
    const v = state.votes[p];
    if (v !== undefined) votes[p] = v;
  }
  const owners: Record<string, string> = { [storyCard]: storyteller };
  for (const [p, cards] of Object.entries(state.picks)) for (const c of cards) owners[c] = p;
  const { gained, found } = scoreRound({ storyteller, storyCard, inRound: state.inRound, owners, votes });
  const scores = { ...state.scores };
  for (const [p, n] of Object.entries(gained)) scores[p] = (scores[p] ?? 0) + n;
  return {
    ...state,
    phase: 'reveal',
    scores,
    votes,
    discard: [...state.discard, ...state.table],
    result: { storyteller, storyCard, clue: state.clue, table: state.table, owners, votes, gained, found },
  };
}

/** Avança a etapa quando todos os ativos que precisam confirmar confirmaram. */
function maybeAdvance(state: DixitState, ctx: GameContext): DixitState {
  if (state.paused) return state;
  const need = mustAct(state, ctx);
  if (need.length === 0 || !need.every((p) => state.confirmed.includes(p))) return state;
  if (state.phase === 'submitting') return toVoting(state, ctx);
  if (state.phase === 'voting') return toReveal(state);
  return state;
}

/** Depois da revelação: fim de jogo se alguém chegou na meta, senão a próxima narração. */
function afterReveal(state: DixitState, ctx: GameContext): DixitState {
  const top = Math.max(...state.players.map((p) => state.scores[p] ?? 0));
  if (top >= state.target) {
    return { ...state, phase: 'gameover', winners: state.players.filter((p) => (state.scores[p] ?? 0) === top) };
  }
  return beginRound(state, ctx, { after: state.storyteller });
}

/** Rodada parada sem volta: devolve as cartas jogadas às mãos e recomeça a narração com quem está aqui. */
function restartRound(state: DixitState, ctx: GameContext): DixitState {
  const hands = { ...state.hands };
  const giveBack = (player: string, cards: readonly string[]) => {
    const hand = hands[player] ?? [];
    hands[player] = [...hand, ...cards.filter((c) => !hand.includes(c))];
  };
  if (state.storyteller !== null && state.storyCard !== null) giveBack(state.storyteller, [state.storyCard]);
  // Na votação as escolhas já saíram das mãos; na escolha ainda estão nelas.
  if (state.phase === 'voting') for (const [p, cards] of Object.entries(state.picks)) giveBack(p, cards);
  return beginRound({ ...state, hands }, ctx, { after: state.storyteller });
}

export function applyDixitAction(
  state: DixitState,
  playerId: string,
  action: DixitAction,
  ctx: GameContext,
): ActionResult<DixitState> {
  const isHost = ctx.hostId === playerId;
  switch (action.type) {
    case 'setTarget': {
      const e = hostOnly(isHost, state, 'lobby');
      if (e) return fail(e);
      return ok({ ...state, target: action.target });
    }
    case 'start': {
      const e = hostOnly(isHost, state, 'lobby');
      if (e) return fail(e);
      return startMatch(state, ctx);
    }
    case 'lobby':
      if (!isHost) return fail('not_host');
      if (state.phase === 'lobby') return fail('bad_phase');
      return ok(initialDixitState(state.target));
    case 'tell': {
      if (state.phase !== 'storytelling') return fail('bad_phase');
      if (state.paused) return fail('paused');
      if (playerId !== state.storyteller) return fail('not_storyteller');
      const hand = state.hands[playerId] ?? [];
      if (!hand.includes(action.cardId)) return fail('unknown_card');
      return ok({
        ...state,
        phase: 'submitting',
        storyCard: action.cardId,
        clue: cleanDixitClue(action.clue),
        hands: { ...state.hands, [playerId]: hand.filter((c) => c !== action.cardId) },
        picks: {},
        confirmed: [],
      });
    }
    case 'submit': {
      const e = actorError(state, playerId, 'submitting');
      if (e) return fail(e);
      const hand = state.hands[playerId] ?? [];
      const cards = action.cardIds;
      if (cards.length !== dixitPicksPerPlayer(state.inRound.length)) return fail('wrong_count');
      if (new Set(cards).size !== cards.length || !cards.every((c) => hand.includes(c))) return fail('unknown_card');
      return ok({ ...state, picks: { ...state.picks, [playerId]: [...cards] } });
    }
    case 'vote': {
      const e = actorError(state, playerId, 'voting');
      if (e) return fail(e);
      if (!state.table.includes(action.cardId)) return fail('unknown_card');
      if ((state.picks[playerId] ?? []).includes(action.cardId)) return fail('own_card');
      return ok({ ...state, votes: { ...state.votes, [playerId]: action.cardId } });
    }
    case 'confirm': {
      if (state.phase !== 'submitting' && state.phase !== 'voting') return fail('bad_phase');
      const e = actorError(state, playerId, state.phase);
      if (e) return fail(e);
      const chosen =
        state.phase === 'submitting' ? (state.picks[playerId]?.length ?? 0) > 0 : Object.hasOwn(state.votes, playerId);
      if (!chosen) return fail('nothing_chosen');
      return ok(maybeAdvance({ ...state, confirmed: [...state.confirmed, playerId] }, ctx));
    }
    case 'forceNext': {
      if (!isHost) return fail('not_host');
      if (state.paused) {
        // `paused` só existe em storytelling, submitting e voting (o fim da rodada sempre reavalia).
        // Pausada: só destrava se já tem gente suficiente (ex.: alguém saiu de vez e outro entrou).
        if (ctx.active.length < DIXIT_MIN_PLAYERS) return fail('paused');
        return ok(restartRound(state, ctx));
      }
      if (state.phase === 'storytelling') return ok(beginRound(state, ctx, { after: state.storyteller }));
      if (state.phase === 'submitting') {
        if (state.confirmed.length === 0) return ok(restartRound(state, ctx));
        return ok(toVoting(state, ctx));
      }
      if (state.phase === 'voting') return ok(toReveal(state));
      return fail('bad_phase');
    }
    case 'next': {
      const e = hostOnly(isHost, state, 'reveal');
      if (e) return fail(e);
      return ok(afterReveal(state, ctx));
    }
    case 'again': {
      const e = hostOnly(isHost, state, 'gameover');
      if (e) return fail(e);
      return startMatch(state, ctx);
    }
    default:
      return fail('bad_action');
  }
}

function sameList(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((x, i) => x === b[i]);
}

/**
 * Reavaliado quando alguém entra, sai ou expira a tolerância de desconexão.
 * Devolve o MESMO objeto quando nada muda (o servidor compara referência).
 */
export function dixitOnPresenceChange(state: DixitState, ctx: GameContext): DixitState {
  if (state.phase === 'storytelling') {
    // Nada foi jogado ainda: dá pra refazer a rodada com quem está aqui agora.
    // Primeiro confere barato se algo mudou, pra não distribuir cartas nem gastar sorteio à toa.
    const st = state.storyteller;
    const keep = st !== null && ctx.active.includes(st);
    const players = [...state.players, ...ctx.active.filter((p) => !state.players.includes(p))];
    const inRound = players.filter((p) => ctx.active.includes(p));
    const storyteller = keep ? st : nextStoryteller({ ...state, players, inRound }, ctx.active, st);
    const paused = inRound.length < DIXIT_MIN_PLAYERS;
    if (
      storyteller === st &&
      paused === state.paused &&
      sameList(players, state.players) &&
      sameList(inRound, state.inRound)
    ) {
      return state;
    }
    return beginRound(state, ctx, keep ? { keep: st } : { after: st });
  }
  if (state.phase !== 'submitting' && state.phase !== 'voting') return state;
  const paused = state.inRound.filter((p) => ctx.active.includes(p)).length < DIXIT_MIN_PLAYERS;
  const next = paused === state.paused ? state : { ...state, paused };
  return paused ? next : maybeAdvance(next, ctx);
}
