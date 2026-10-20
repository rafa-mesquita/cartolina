import type { ActionResult, GameContext } from '../../game';
import { kittensKindOf } from './cards';
import { delayTop, discardForMico, giveFavor, hideTatu, pickFromDiscard } from './choices';
import { kittensDeal } from './deck';
import { parsePlay } from './play';
import { settleKittens } from './settle';
import { eliminate, logged, spendTurn } from './turn';
import { KITTENS_CHOICE_MS, KITTENS_MIN_PLAYERS, KITTENS_NOPE_MS, type KittensAction, type KittensState } from './types';

const fail = (error: string): ActionResult<KittensState> => ({ ok: false, error });
const ok = (state: KittensState): ActionResult<KittensState> => ({ ok: true, state });

export function initialKittensState(): KittensState {
  return {
    phase: 'lobby',
    players: [],
    alive: [],
    hands: {},
    draw: [],
    discard: [],
    out: [],
    current: null,
    owed: 0,
    pending: null,
    choice: null,
    peek: null,
    log: [],
    seq: 0,
    winner: null,
  };
}

/** Partida nova com os ativos (também usada em "jogar de novo"). A sala já limita a 8 pessoas. */
function startMatch(ctx: GameContext): ActionResult<KittensState> {
  if (ctx.active.length < KITTENS_MIN_PLAYERS) return fail('not_enough_players');
  const players = [...ctx.active];
  const { hands, draw } = kittensDeal(ctx.rng, players);
  return ok({ ...initialKittensState(), phase: 'playing', players, alive: [...players], hands, draw, current: players[0]!, owed: 1 });
}

/** Por que `p` não pode jogar nem comprar agora (ou null se pode). */
function turnError(s: KittensState, p: string): string | null {
  if (s.phase !== 'playing') return 'bad_phase';
  if (!s.alive.includes(p)) return 'not_alive';
  if (s.pending) return 'card_in_air';
  if (s.choice) return 'waiting_choice';
  if (s.current !== p) return 'not_your_turn';
  return null;
}

/** Compra a de cima. Tatubum: com Cafuné, abre a escolha de onde esconder; sem, explode. */
function drawCard(s: KittensState, p: string, ctx: GameContext): KittensState {
  const card = s.draw.at(-1)!;
  const draw = s.draw.slice(0, -1);
  const hand = s.hands[p]!;
  if (kittensKindOf(card) !== 'tatubum') {
    return spendTurn(logged({ ...s, draw, hands: { ...s.hands, [p]: [...hand, card] } }, { t: 'draw', by: p, card }, [p]));
  }
  const cafune = hand.find((c) => kittensKindOf(c) === 'cafune');
  if (cafune === undefined) return eliminate(logged({ ...s, draw }, { t: 'boom', by: p }), p, [card]);
  return logged(
    {
      ...s,
      draw,
      peek: null,
      hands: { ...s.hands, [p]: hand.filter((c) => c !== cafune) },
      discard: [...s.discard, cafune],
      choice: { kind: 'cafune', who: p, tatu: card, deadline: ctx.now + KITTENS_CHOICE_MS },
    },
    { t: 'cafune', by: p },
  );
}

export function applyKittensAction(
  state: KittensState,
  playerId: string,
  action: KittensAction,
  ctx: GameContext,
): ActionResult<KittensState> {
  // Prazo vencido resolve antes: Nem vem! que chega depois do fim da janela não vale (spec §7).
  const s = settleKittens(state, ctx);
  const isHost = ctx.hostId === playerId;
  switch (action.type) {
    case 'start':
      if (!isHost) return fail('not_host');
      if (s.phase !== 'lobby') return fail('bad_phase');
      return startMatch(ctx);
    case 'lobby':
      if (!isHost) return fail('not_host');
      if (s.phase === 'lobby') return fail('bad_phase');
      return ok(initialKittensState());
    case 'again':
      if (!isHost) return fail('not_host');
      if (s.phase !== 'gameover') return fail('bad_phase');
      return startMatch(ctx);
    case 'draw': {
      const e = turnError(s, playerId);
      if (e) return fail(e);
      return ok(drawCard(s, playerId, ctx));
    }
    case 'choose': {
      if (s.phase !== 'playing') return fail('bad_phase');
      const c = s.choice;
      if (!c) return fail('not_your_choice');
      // Par de Mico: não há um dono só; descarta quem ainda está na espera.
      if (c.kind === 'mico') {
        if (!c.waiting.includes(playerId)) return fail('not_your_choice');
        if (action.card === undefined || !s.hands[playerId]!.includes(action.card)) return fail('bad_choice');
        return ok(discardForMico(s, c, playerId, action.card));
      }
      if (c.who !== playerId) return fail('not_your_choice');
      switch (c.kind) {
        case 'cafune': {
          const { position } = action;
          if (position === undefined) return fail('bad_choice');
          if (position !== 'random' && (!Number.isInteger(position) || position < 0 || position > s.draw.length)) {
            return fail('bad_choice');
          }
          return ok(hideTatu(s, c, position, ctx.rng));
        }
        case 'favor':
          if (action.card === undefined || !s.hands[playerId]!.includes(action.card)) return fail('bad_choice');
          return ok(giveFavor(s, c, action.card));
        case 'cinco':
          if (action.card === undefined || !c.options.includes(action.card) || !s.discard.includes(action.card)) {
            return fail('bad_choice');
          }
          return ok(pickFromDiscard(s, c, action.card));
        case 'quati':
          if (action.keep === undefined) return fail('bad_choice');
          return ok(delayTop(s, c, action.keep));
        default: {
          const unhandled: never = c;
          void unhandled;
          return fail('bad_choice');
        }
      }
    }
    case 'play': {
      const e = turnError(s, playerId);
      if (e) return fail(e);
      const play = parsePlay(s, playerId, action);
      if (typeof play === 'string') return fail(play);
      const hand = s.hands[playerId]!.filter((c) => !play.cards.includes(c));
      const next: KittensState = {
        ...s,
        hands: { ...s.hands, [playerId]: hand },
        pending: { by: playerId, play, nopes: [], resolvesAt: ctx.now + KITTENS_NOPE_MS },
      };
      return ok(logged(next, { t: 'play', by: playerId, play: play.kind, target: play.target, ask: play.ask }));
    }
    case 'nope': {
      if (s.phase !== 'playing') return fail('bad_phase');
      if (!s.alive.includes(playerId)) return fail('not_alive');
      if (!s.pending) return fail('nothing_to_nope');
      const card = s.hands[playerId]!.find((c) => kittensKindOf(c) === 'nemvem');
      if (card === undefined) return fail('no_nope');
      const pending = {
        ...s.pending,
        nopes: [...s.pending.nopes, { by: playerId, card }],
        resolvesAt: ctx.now + KITTENS_NOPE_MS,
      };
      const hands = { ...s.hands, [playerId]: s.hands[playerId]!.filter((c) => c !== card) };
      return ok(logged({ ...s, pending, hands }, { t: 'nope', by: playerId }));
    }
    default:
      return fail('bad_action');
  }
}
