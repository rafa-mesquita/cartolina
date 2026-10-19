import type { ActionResult, GameContext } from '../../game';
import { randomInt, shuffle } from '../../rng';
import { shuffledDeck } from './deck';
import { actError, alive, blockersOf, canBlock, canChallenge, coinsOf, hiddenOf, isAlive, nextAlive, treasury, without } from './table';
import {
  COUP_BLOCKERS,
  COUP_CLAIM,
  COUP_COST,
  COUP_MIN_PLAYERS,
  COUP_START_COINS,
  COUP_WINDOW_MS,
  type CoupAction,
  type CoupActionKind,
  type CoupCharacter,
  type CoupLogEntry,
  type CoupLossReason,
  type CoupState,
  type CoupThen,
  type CoupWindowKind,
} from './types';

const fail = (error: string): ActionResult<CoupState> => ({ ok: false, error });
const ok = (state: CoupState): ActionResult<CoupState> => ({ ok: true, state });

/** Quanto renda, ajuda externa e taxar rendem. */
const GAIN = { income: 1, foreignAid: 2, tax: 3 } as const;

export function initialCoupState(): CoupState {
  return {
    phase: 'lobby',
    match: 0,
    players: [],
    hands: {},
    deck: [],
    turn: null,
    declared: null,
    block: null,
    window: null,
    loss: null,
    drawn: [],
    out: [],
    winner: null,
    wins: {},
    windows: 0,
    log: [],
  };
}

const logged = (state: CoupState, entry: CoupLogEntry): CoupState => ({ ...state, log: [...state.log, entry] });

function withCoins(state: CoupState, player: string, delta: number): CoupState {
  const hand = state.hands[player]!;
  return { ...state, hands: { ...state.hands, [player]: { ...hand, coins: hand.coins + delta } } };
}

/** Partida nova com os ativos (também no "jogar de novo"); começa quem venceu a anterior, se estiver jogando. */
function startMatch(state: CoupState, ctx: GameContext): ActionResult<CoupState> {
  if (ctx.active.length < COUP_MIN_PLAYERS) return fail('not_enough_players');
  const players = [...ctx.active];
  const deck = shuffledDeck(ctx.rng);
  const first =
    state.winner !== null && players.includes(state.winner) ? state.winner : players[randomInt(ctx.rng, players.length)]!;
  const hands: CoupState['hands'] = {};
  players.forEach((p, i) => {
    hands[p] = {
      // Regra oficial do jogo de 2: quem começa recebe 1 moeda.
      coins: players.length === 2 && p === first ? 1 : COUP_START_COINS,
      cards: [deck[2 * i]!, deck[2 * i + 1]!].map((character) => ({ character, revealed: false })),
    };
  });
  const wins = { ...state.wins };
  for (const p of players) wins[p] = wins[p] ?? 0;
  return ok({
    ...initialCoupState(),
    phase: 'turn',
    match: state.match + 1,
    players,
    hands,
    deck: deck.slice(2 * players.length),
    turn: first,
    wins,
    log: [{ t: 'start', first }],
  });
}

function openWindow(state: CoupState, kind: CoupWindowKind, eligible: string[], ctx: GameContext): CoupState {
  const id = state.windows + 1;
  return { ...state, phase: 'reaction', windows: id, window: { id, kind, eligible, passed: [], endsAt: ctx.now + COUP_WINDOW_MS } };
}

/** A vez passa pro próximo vivo, limpando a jogada. */
function endTurn(state: CoupState): CoupState {
  return {
    ...state,
    phase: 'turn',
    turn: nextAlive(state, state.turn!),
    declared: null,
    block: null,
    window: null,
    loss: null,
    drawn: [],
  };
}

function finish(state: CoupState, winner: string): CoupState {
  return logged(
    {
      ...state,
      phase: 'over',
      winner,
      turn: null,
      declared: null,
      block: null,
      window: null,
      loss: null,
      drawn: [],
      wins: { ...state.wins, [winner]: (state.wins[winner] ?? 0) + 1 },
    },
    { t: 'win', player: winner },
  );
}

/** Declara a ação: paga o custo e abre a janela de reação, ou resolve direto (renda, golpe). */
function declare(state: CoupState, actor: string, kind: CoupActionKind, target: string | null, ctx: GameContext): CoupState {
  const declared = { actor, kind, target };
  const paid = COUP_COST[kind] > 0 ? withCoins(state, actor, -COUP_COST[kind]) : state;
  const s = logged({ ...paid, declared, block: null }, { t: 'act', actor, kind, target });
  if (COUP_CLAIM[kind] !== null) return openWindow(s, 'action', alive(s).filter((p) => p !== actor), ctx);
  const blockers = blockersOf(s, declared);
  return blockers.length > 0 ? openWindow(s, 'action', blockers, ctx) : resolveAction(s, ctx);
}

/** A ação acontece (ninguém impediu). Alvo que já saiu: a ação termina sem efeito. */
function resolveAction(state: CoupState, ctx: GameContext): CoupState {
  const d = state.declared!;
  const s: CoupState = { ...state, window: null, block: null };
  const done = (next: CoupState, amount: number) =>
    logged(next, { t: 'resolved', actor: d.actor, kind: d.kind, target: d.target, amount });
  switch (d.kind) {
    case 'income':
    case 'foreignAid':
    case 'tax': {
      const amount = Math.min(GAIN[d.kind], treasury(s));
      return endTurn(done(withCoins(s, d.actor, amount), amount));
    }
    case 'steal': {
      if (!isAlive(s, d.target!)) return endTurn(s);
      const amount = Math.min(2, coinsOf(s, d.target!));
      return endTurn(done(withCoins(withCoins(s, d.target!, -amount), d.actor, amount), amount));
    }
    case 'coup':
    case 'assassinate':
      if (!isAlive(s, d.target!)) return endTurn(s);
      return startLoss(done(s, 0), d.target!, d.kind === 'coup' ? 'coup' : 'assassinated', 'next', ctx);
    case 'exchange':
      return done({ ...s, phase: 'exchange', drawn: s.deck.slice(0, 2), deck: s.deck.slice(2) }, 0);
  }
}

/** A ação foi bloqueada: a vez passa (as moedas do Assassino ficam perdidas). */
function blocked(state: CoupState): CoupState {
  const d = state.declared!;
  const b = state.block!;
  return endTurn(logged(state, { t: 'blocked', actor: d.actor, kind: d.kind, by: b.by, as: b.as }));
}

/** Ninguém reagiu a tempo: a ação acontece, ou o bloqueio vale. */
function closeWindow(state: CoupState, ctx: GameContext): CoupState {
  return state.window!.kind === 'block' ? blocked(state) : resolveAction(state, ctx);
}

/** `player` perde uma carta: escolhe, ou perde direto se só tiver uma virada pra baixo. */
function startLoss(state: CoupState, player: string, reason: CoupLossReason, then: CoupThen, ctx: GameContext): CoupState {
  const s: CoupState = { ...state, phase: 'losing', window: null, loss: { player, reason, then } };
  const hidden = hiddenOf(s, player);
  return hidden.length === 1 ? loseCard(s, hidden[0]!, ctx) : s;
}

/** Vira a carta pra cima; sem carta escondida, o jogador sai. Sobrando um, ele vence; senão segue o que a perda interrompeu. */
function loseCard(state: CoupState, card: CoupCharacter, ctx: GameContext): CoupState {
  const { player, then } = state.loss!;
  const hand = state.hands[player]!;
  const i = hand.cards.findIndex((c) => !c.revealed && c.character === card);
  const cards = hand.cards.map((c, j) => (j === i ? { ...c, revealed: true } : c));
  const gone = cards.every((c) => c.revealed);
  let s = logged(
    { ...state, loss: null, hands: { ...state.hands, [player]: { coins: gone ? 0 : hand.coins, cards } } },
    { t: 'lose', player, card },
  );
  if (gone) s = logged({ ...s, out: [...s.out, player] }, { t: 'out', player });
  const left = alive(s);
  if (left.length === 1) return finish(s, left[0]!);
  switch (then) {
    case 'next':
      return endTurn(s);
    case 'resolve':
      return resolveAction(s, ctx);
    case 'blocked':
      return blocked(s);
    case 'proceed': {
      // Dúvida errada da ação: se ela ainda pode ser bloqueada, o alvo tem a janela só de bloqueio.
      const blockers = blockersOf(s, s.declared!);
      return blockers.length > 0 ? openWindow(s, 'blockOnly', blockers, ctx) : resolveAction(s, ctx);
    }
  }
}

/** Fecha a troca: `keep` fica na mão (no lugar das cartas viradas pra baixo), o resto volta pro baralho embaralhado. */
function finishExchange(state: CoupState, player: string, keep: CoupCharacter[], ctx: GameContext): CoupState {
  const hand = state.hands[player]!;
  const back = without([...hiddenOf(state, player), ...state.drawn], keep)!;
  const rest = [...keep];
  const cards = hand.cards.map((c) => (c.revealed ? c : { character: rest.shift()!, revealed: false }));
  return endTurn({
    ...state,
    deck: shuffle(ctx.rng, [...state.deck, ...back]),
    drawn: [],
    hands: { ...state.hands, [player]: { ...hand, cards } },
  });
}

/** Uma carta `card` virada pra baixo de `player` volta pro baralho, que é embaralhado, e ele compra outra (dúvida que falhou). */
function swapCard(state: CoupState, player: string, card: CoupCharacter, ctx: GameContext): CoupState {
  const hand = state.hands[player]!;
  const deck = shuffle(ctx.rng, [...state.deck, card]);
  const i = hand.cards.findIndex((c) => !c.revealed && c.character === card);
  const cards = hand.cards.map((c, j) => (j === i ? { character: deck[0]!, revealed: false } : c));
  return { ...state, deck: deck.slice(1), hands: { ...state.hands, [player]: { ...hand, cards } } };
}

/** `by` duvida de quem declarou (a ação, ou o bloqueio na janela do bloqueio). */
function challenge(state: CoupState, by: string, ctx: GameContext): CoupState {
  const onBlock = state.window!.kind === 'block';
  const d = state.declared!;
  const of = onBlock ? state.block!.by : d.actor;
  const claim = onBlock ? state.block!.as : COUP_CLAIM[d.kind]!;
  const had = hiddenOf(state, of).includes(claim);
  const s = logged({ ...state, window: null }, { t: 'challenge', by, of, claim, had });
  if (had) return startLoss(swapCard(s, of, claim, ctx), by, 'challengeWrong', onBlock ? 'blocked' : 'proceed', ctx);
  // Pego blefando: as moedas do Assassino voltam (só ficam perdidas quando ele é bloqueado).
  const refunded = !onBlock && d.kind === 'assassinate' ? withCoins(s, d.actor, COUP_COST.assassinate) : s;
  return startLoss(refunded, of, 'caught', onBlock ? 'resolve' : 'next', ctx);
}

/**
 * Fecha a janela de reação quando todos que podiam reagir deixaram ou o prazo acabou. Roda depois de cada ação e a
 * cada `tick` da sala (presença e alarme no prazo). Devolve o MESMO objeto quando nada muda (o servidor compara referência).
 */
export function settleCoup(state: CoupState, ctx: GameContext): CoupState {
  if (state.phase !== 'reaction' || state.window === null) return state;
  const w = state.window;
  const allPassed = w.eligible.every((p) => w.passed.includes(p));
  return allPassed || ctx.now >= w.endsAt ? closeWindow(state, ctx) : state;
}

/** Por que `playerId` não pode reagir na janela aberta (ou null se pode). Prazo vencido = janela fechada. */
function reactError(state: CoupState, playerId: string, ctx: GameContext, window?: number): string | null {
  if (state.phase !== 'reaction' || state.window === null || ctx.now >= state.window.endsAt) return 'window_closed';
  if (window !== undefined && window !== state.window.id) return 'window_closed';
  if (!state.players.includes(playerId)) return 'not_player';
  if (!state.window.eligible.includes(playerId)) return 'cannot_react';
  if (state.window.passed.includes(playerId)) return 'already_passed';
  return null;
}

const settled = (res: ActionResult<CoupState>, ctx: GameContext): ActionResult<CoupState> =>
  res.ok ? ok(settleCoup(res.state, ctx)) : res;

export function applyCoupAction(
  state: CoupState,
  playerId: string,
  action: CoupAction,
  ctx: GameContext,
): ActionResult<CoupState> {
  const isHost = ctx.hostId === playerId;
  switch (action.type) {
    case 'start':
      if (!isHost) return fail('not_host');
      if (state.phase !== 'lobby') return fail('bad_phase');
      return settled(startMatch(state, ctx), ctx);
    case 'restart':
      if (!isHost) return fail('not_host');
      if (state.phase !== 'over') return fail('bad_phase');
      return settled(startMatch(state, ctx), ctx);
    case 'act': {
      if (state.phase !== 'turn') return fail('bad_phase');
      if (!state.players.includes(playerId)) return fail('not_player');
      if (state.turn !== playerId) return fail('not_your_turn');
      const target = action.target ?? null;
      const e = actError(state, playerId, action.kind, target);
      if (e) return fail(e);
      return ok(settleCoup(declare(state, playerId, action.kind, target, ctx), ctx));
    }
    case 'pass': {
      const e = reactError(state, playerId, ctx, action.window);
      if (e) return fail(e);
      const w = state.window!;
      return ok(settleCoup({ ...state, window: { ...w, passed: [...w.passed, playerId] } }, ctx));
    }
    case 'challenge': {
      const e = reactError(state, playerId, ctx, action.window);
      if (e) return fail(e);
      if (!canChallenge(state)) return fail('cannot_react');
      return ok(settleCoup(challenge(state, playerId, ctx), ctx));
    }
    case 'block': {
      const e = reactError(state, playerId, ctx, action.window);
      if (e) return fail(e);
      if (!canBlock(state, playerId)) return fail('cannot_react');
      if (!COUP_BLOCKERS[state.declared!.kind].includes(action.as)) return fail('bad_block');
      const s = logged({ ...state, block: { by: playerId, as: action.as } }, { t: 'block', by: playerId, as: action.as });
      return ok(settleCoup(openWindow(s, 'block', alive(s).filter((p) => p !== playerId), ctx), ctx));
    }
    case 'lose':
      if (state.phase !== 'losing' || state.loss?.player !== playerId) return fail('not_losing');
      if (!hiddenOf(state, playerId).includes(action.card)) return fail('not_owner');
      return ok(settleCoup(loseCard(state, action.card, ctx), ctx));
    case 'exchange': {
      if (state.phase !== 'exchange') return fail('bad_phase');
      if (state.turn !== playerId) return fail('not_your_turn');
      const mine = hiddenOf(state, playerId);
      if (action.keep.length !== mine.length || without([...mine, ...state.drawn], action.keep) === null) {
        return fail('bad_exchange');
      }
      return ok(settleCoup(finishExchange(state, playerId, action.keep, ctx), ctx));
    }
    default:
      return fail('bad_action');
  }
}
