import type { ActionResult, GameContext } from '../../game';
import { randomInt, shuffle } from '../../rng';
import { KITTENS_WILD, kittensKindOf } from './cards';
import {
  conjure,
  defendLatido,
  delayTop,
  discardForMico,
  giveFavor,
  hideTatu,
  pickFromDiscard,
  drawTop,
  fishSecond,
  useCafune,
} from './choices';
import { kittensDeal, kittensDrawBichos } from './deck';
import { parsePlay, realCard } from './play';
import { settleKittens } from './settle';
import { counted, logged } from './turn';
import {
  KITTENS_CHOICE_MS,
  KITTENS_MIN_PLAYERS,
  KITTENS_NOPE_MS,
  KITTENS_UNSTOPPABLE_MS,
  kittensCaster,
  kittensNopable,
  kittensReflectable,
  kittensNopeCooldownUntil,
  type KittensAction,
  type KittensState,
} from './types';

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
    front: {},
    blind: [],
    blindClock: null,
    bichos: [],
    current: null,
    owed: 0,
    pending: null,
    choice: null,
    peeks: {},
    skips: {},
    log: [],
    seq: 0,
    winner: null,
    match: 0,
    exits: [],
    stats: {},
  };
}

/** Partida nova com os ativos (também usada em "jogar de novo"). A sala já limita a 8 pessoas. */
function startMatch(state: KittensState, ctx: GameContext): ActionResult<KittensState> {
  if (ctx.active.length < KITTENS_MIN_PLAYERS) return fail('not_enough_players');
  // Os bichos da partida são sorteados a cada início (pedido do Rafa, 2026-11-06); o Boto e o Latidor entram sempre.
  const bichos = kittensDrawBichos(ctx.rng);
  const { hands, draw } = kittensDeal(ctx.rng, [...ctx.active], bichos);
  // A ordem da mesa é sorteada a cada partida (pedido do Rafa, 2026-11-06: era a ordem de entrada na sala), e quem começa
  // também (2026-10-20: o host começava sempre). Os sorteios vêm depois da distribuição, pra mesma semente dar as mesmas mãos.
  const players = shuffle(ctx.rng, ctx.active);
  const first = players[randomInt(ctx.rng, players.length)]!;
  const stats = Object.fromEntries(players.map((p) => [p, { nopes: 0, defuses: 0 }]));
  const fresh = { ...initialKittensState(), match: state.match + 1, stats, bichos };
  return ok({ ...fresh, phase: 'playing', players, alive: [...players], hands, draw, current: first, owed: 1 });
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

/** `choose` com uma carta da própria mão (ficha, pra quem está cego). */
function ownCard(s: KittensState, p: string, card: string | undefined): string | null {
  const real = realCard(s, p, card);
  return typeof real === 'string' ? real : null;
}

/** O erro de `choose` com carta da mão que não vale: quem está cego e não mandou ficha ouve `blind_pick`. */
function badOwnCard(s: KittensState, p: string, card: string | undefined): string {
  const real = realCard(s, p, card);
  return typeof real !== 'string' && real.error === 'blind_pick' ? 'blind_pick' : 'bad_choice';
}

export function applyKittensAction(
  state: KittensState,
  playerId: string,
  action: KittensAction,
  ctx: GameContext,
): ActionResult<KittensState> {
  // Prazo vencido resolve antes: Nem vem! que chega depois do fim da janela não vale (spec §7). O settle também
  // completa estado salvo antes das cartas novas (`front`/`blind`, ver `compat.ts`).
  const s = settleKittens(state, ctx);
  const isHost = ctx.hostId === playerId;
  switch (action.type) {
    case 'start':
      if (!isHost) return fail('not_host');
      if (s.phase !== 'lobby') return fail('bad_phase');
      return startMatch(s, ctx);
    case 'lobby':
      if (!isHost) return fail('not_host');
      if (s.phase === 'lobby') return fail('bad_phase');
      return ok(initialKittensState());
    case 'again':
      if (!isHost) return fail('not_host');
      if (s.phase !== 'gameover') return fail('bad_phase');
      return startMatch(s, ctx);
    case 'draw': {
      const e = turnError(s, playerId);
      if (e) return fail(e);
      // Compra a de cima (cura o Mau-olhado). Tatubum: com Desarme, abre a escolha de jogá-lo; sem, explode.
      return ok(drawTop(s, playerId, ctx.now + KITTENS_CHOICE_MS));
    }
    case 'choose': {
      if (s.phase !== 'playing') return fail('bad_phase');
      const c = s.choice;
      if (!c) return fail('not_your_choice');
      // Par de Mico: não há um dono só; descarta quem ainda está na espera.
      if (c.kind === 'mico') {
        if (!c.waiting.includes(playerId)) return fail('not_your_choice');
        const card = ownCard(s, playerId, action.card);
        if (card === null) return fail(badOwnCard(s, playerId, action.card));
        return ok(discardForMico(s, c, playerId, card, ctx.now + KITTENS_CHOICE_MS));
      }
      if (c.who !== playerId) return fail('not_your_choice');
      switch (c.kind) {
        case 'tatu': {
          // Cego que ficou com o Tatubum do Feitiço não sabe qual ficha é o Desarme: como no Latidor, qualquer ficha vale.
          const card = ownCard(s, playerId, action.card);
          if (card === null) return fail(badOwnCard(s, playerId, action.card));
          const desarme = s.blind.includes(playerId) ? s.hands[playerId]!.find((x) => kittensKindOf(x) === 'cafune') : card;
          if (desarme === undefined || kittensKindOf(desarme) !== 'cafune') return fail('bad_choice');
          return ok(useCafune(s, c, desarme, ctx.now + KITTENS_CHOICE_MS));
        }
        case 'cafune': {
          const { position } = action;
          if (position === undefined) return fail('bad_choice');
          if (position !== 'random' && (!Number.isInteger(position) || position < 0 || position > s.draw.length)) {
            return fail('bad_choice');
          }
          return ok(hideTatu(s, c, position, ctx.rng));
        }
        case 'favor': {
          const card = ownCard(s, playerId, action.card);
          if (card === null) return fail(badOwnCard(s, playerId, action.card));
          return ok(giveFavor(s, c, card));
        }
        case 'cinco':
          // Par de Onça sem nada pra pegar: ele viu o topo e o fundo e fecha.
          if (action.card === undefined && c.from === 'onca' && c.options.length === 0) return ok({ ...s, choice: null });
          if (action.card === undefined || !c.options.includes(action.card) || !s.discard.includes(action.card)) {
            return fail('bad_choice');
          }
          return ok(pickFromDiscard(s, c, action.card));
        case 'quati':
          if (action.keep === undefined) return fail('bad_choice');
          return ok(delayTop(s, c, action.keep));
        case 'latido': {
          // Quem está cego não sabe qual ficha é o Desarme: qualquer ficha da mão vale, e o servidor joga o Desarme dele.
          const card = ownCard(s, playerId, action.card);
          if (card === null) return fail(badOwnCard(s, playerId, action.card));
          const desarme = s.blind.includes(playerId) ? s.hands[playerId]!.find((x) => kittensKindOf(x) === 'cafune') : card;
          if (desarme === undefined || kittensKindOf(desarme) !== 'cafune') return fail('bad_choice');
          return ok(defendLatido(s, c, desarme, ctx.now + KITTENS_CHOICE_MS));
        }
        case 'feitico':
          if (action.keep === undefined) return fail('bad_choice');
          return ok(conjure(s, c, action.keep, ctx.now + KITTENS_CHOICE_MS));
        case 'peixe':
          if (action.fate === undefined) return fail('bad_choice');
          return ok(fishSecond(s, c, action.fate, ctx.now + KITTENS_CHOICE_MS));
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
        pending: { by: playerId, play, nopes: [], resolvesAt: ctx.now + (kittensNopable(play) ? KITTENS_NOPE_MS : KITTENS_UNSTOPPABLE_MS) },
      };
      return ok(logged(next, { t: 'play', by: playerId, play: play.kind, target: play.target, ask: play.ask, as: play.as }));
    }
    case 'nope': {
      if (s.phase !== 'playing') return fail('bad_phase');
      if (!s.alive.includes(playerId)) return fail('not_alive');
      if (!s.pending) return fail('nothing_to_nope');
      if (!kittensNopable(s.pending.play)) return fail('unstoppable');
      // Nem vem! atrasado (pedido do Rafa, 2026-10-20): dois quase juntos não viram Nem vem! em cima de Nem vem!. Vale
      // o que chegou primeiro; o outro é recusado, a carta fica na mão e ele tem a janela nova (5 s) pra decidir de novo.
      // `on` pega outra carta no ar com o mesmo número de Nem vem! (a jogada de antes já resolveu).
      if (action.on !== undefined && action.on !== s.pending.play.cards[0]) return fail('nope_stale');
      if (action.at !== undefined && action.at !== s.pending.nopes.length) return fail('nope_late');
      // Espera de 2 s entre um Nem vem! e outro (pedido do Rafa, 2026-10-21): a carta fica na mão e nada muda.
      const cooldownUntil = kittensNopeCooldownUntil(s.pending);
      if (cooldownUntil !== null && ctx.now < cooldownUntil) return fail('nope_cooldown');
      const isNope = (c: string) => kittensKindOf(c) === 'nemvem';
      let card: string | undefined;
      if (action.card === undefined && !s.blind.includes(playerId)) {
        card = s.hands[playerId]!.find(isNope);
      } else {
        // Carta escolhida (ou às cegas, por ficha): tem que ser um Nem vem! da mão.
        const real = realCard(s, playerId, action.card);
        if (typeof real !== 'string') return fail(real.error);
        card = isNope(real) ? real : undefined;
      }
      if (card === undefined) return fail('no_nope');
      const pending = {
        ...s.pending,
        nopes: [...s.pending.nopes, { by: playerId, card }],
        resolvesAt: ctx.now + KITTENS_NOPE_MS,
      };
      const hands = { ...s.hands, [playerId]: s.hands[playerId]!.filter((c) => c !== card) };
      return ok(logged(counted({ ...s, pending, hands }, playerId, 'nopes'), { t: 'nope', by: playerId }));
    }
    case 'sapo': {
      // Par de Sapo (pedido do Rafa, 2026-11-06): o alvo devolve a magia pra quem mandou. A janela recomeça, os Nem vem! de
      // antes não contam mais, e o novo alvo pode refletir de volta.
      if (s.phase !== 'playing') return fail('bad_phase');
      if (!s.alive.includes(playerId)) return fail('not_alive');
      const air = s.pending;
      if (!air || air.play.target !== playerId || !kittensReflectable(air.play, s.alive.length) || !s.bichos.includes('sapo')) return fail('sapo_only');
      if (action.on !== undefined && action.on !== air.play.cards[0]) return fail('nope_stale');
      if (s.blind.includes(playerId)) return fail('sapo_blind');
      const { cards } = action;
      const isPair = cards.length === 2 && new Set(cards).size === 2 && cards.every((c) => kittensKindOf(c) === 'sapo' || kittensKindOf(c) === KITTENS_WILD);
      if (!isPair) return fail('bad_combo');
      const mine = s.hands[playerId]!;
      if (!cards.every((c) => mine.includes(c))) return fail('not_in_hand');
      const caster = kittensCaster(air);
      const hands = { ...s.hands, [playerId]: mine.filter((c) => !cards.includes(c)) };
      const discard = [...s.discard, ...air.nopes.map((n) => n.card), ...cards];
      const pending = { ...air, caster: playerId, play: { ...air.play, target: caster }, nopes: [], resolvesAt: ctx.now + KITTENS_NOPE_MS };
      return ok(logged({ ...s, hands, discard, pending }, { t: 'reflected', by: playerId, target: caster }));
    }
    default:
      return fail('bad_action');
  }
}
