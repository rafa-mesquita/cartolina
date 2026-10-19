import type { ActionResult, GameContext } from '../../game';
import { kittensKindOf } from './cards';
import { hideTatu } from './choices';
import { kittensDeal } from './deck';
import { eliminate, logged, spendTurn } from './turn';
import { KITTENS_CHOICE_MS, KITTENS_MIN_PLAYERS, type KittensAction, type KittensState } from './types';

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
  const s = state;
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
      if (!c || c.who !== playerId) return fail('not_your_choice');
      if (c.kind === 'cafune') {
        const { position } = action;
        if (position === undefined || (position !== 'random' && position > s.draw.length)) return fail('bad_choice');
        return ok(hideTatu(s, c, position, ctx.rng));
      }
      return fail('bad_choice');
    }
    default:
      return fail('bad_action');
  }
}
