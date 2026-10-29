import type { GameContext } from '../../game';
import { randomInt, type Rng } from '../../rng';
import { kittensKindOf, type KittensCardKind } from './cards';
import { barkPair } from './choices';
import { addSkip, cure, logged, moveCard, nextAlive, spendTurn, unpeek } from './turn';
import { KITTENS_CHOICE_MS, type KittensPlay, type KittensState } from './types';

const isKind = (k: KittensCardKind) => (c: string) => kittensKindOf(c) === k;

/**
 * Par de Tamanduá: compra as 2 de cima; Tatubum vai pro fundo (sem gastar Desarme), o resto pra mão. A vez continua.
 * Comprou: o Mau-olhado de quem jogou passa. As 2 saem das espiadas (o resto do monte segue na mesma ordem; o tatu que vai
 * pro fundo fica embaixo de tudo).
 */
function tamandua(state: KittensState, by: string): KittensState {
  const s = cure(state, by);
  const n = Math.min(2, s.draw.length);
  const taken = s.draw.slice(-n).reverse(); // a de cima primeiro
  const tatus = taken.filter(isKind('tatubum'));
  const kept = taken.filter((c) => !isKind('tatubum')(c));
  let next: KittensState = unpeek(
    { ...s, draw: [...tatus, ...s.draw.slice(0, s.draw.length - n)], hands: { ...s.hands, [by]: [...s.hands[by]!, ...kept] } },
    taken,
  );
  for (const card of kept) next = logged(next, { t: 'draw', by, card }, [by]);
  return tatus.length > 0 ? logged(next, { t: 'buried', by, tatus: tatus.length }) : next;
}

/** Chance do par de Preguiça puxar dois (pedido do Rafa, 2026-10-21). */
export const KITTENS_PREGUICA_DOUBLE = 0.3;

/**
 * Par de Preguiça (`played` = as cartas do par, que já estão no descarte): puxa um `ask`; com 30% de chance, dois
 * (pedido do Rafa, 2026-10-21). Cada um vem, nessa ordem, da mão de um adversário sorteado entre os que têm, do monte
 * ou do descarte (sem as cartas do próprio par). Ninguém tem: só um `called` vazio; o segundo que não acha nada não
 * aparece.
 */
function preguica(s: KittensState, by: string, ask: KittensCardKind, rng: Rng, played: readonly string[]): KittensState {
  const times = rng() < KITTENS_PREGUICA_DOUBLE ? 2 : 1;
  let next = callOne(s, by, ask, rng, played);
  const found = (x: KittensState) => { const ev = x.log.at(-1)!.ev; return ev.t === 'called' && ev.card !== null; };
  if (times === 2 && found(next)) {
    const again = callOne(next, by, ask, rng, played);
    if (found(again)) next = again;
  }
  return next;
}

/** Um puxão da Preguiça: mão de um adversário, monte (a carta sai das espiadas) e, por último, o descarte. */
function callOne(s: KittensState, by: string, ask: KittensCardKind, rng: Rng, played: readonly string[]): KittensState {
  const holders = s.alive.filter((p) => p !== by && s.hands[p]!.some(isKind(ask)));
  if (holders.length > 0) {
    const from = holders[randomInt(rng, holders.length)]!;
    const card = s.hands[from]!.find(isKind(ask))!;
    return logged(moveCard(s, from, by, card), { t: 'called', by, ask, from, card });
  }
  const inDraw = s.draw.filter(isKind(ask));
  if (inDraw.length === 0) {
    const inPile = s.discard.filter((c) => isKind(ask)(c) && !played.includes(c));
    if (inPile.length === 0) return logged(s, { t: 'called', by, ask, from: null, card: null });
    const card = inPile[randomInt(rng, inPile.length)]!;
    const next = { ...s, discard: s.discard.filter((c) => c !== card), hands: { ...s.hands, [by]: [...s.hands[by]!, card] } };
    return logged(next, { t: 'called', by, ask, from: null, card, pile: true });
  }
  const card = inDraw[randomInt(rng, inDraw.length)]!;
  const next = unpeek({ ...s, draw: s.draw.filter((c) => c !== card), hands: { ...s.hands, [by]: [...s.hands[by]!, card] } }, [card]);
  return logged(next, { t: 'called', by, ask, from: null, card });
}

/** Roda de capivara: todos os vivos menos `by` passam, ao mesmo tempo, uma carta ao acaso pro próximo vivo. */
function roda(s: KittensState, by: string, rng: Rng): KittensState {
  const passes = s.alive
    .filter((p) => p !== by && s.hands[p]!.length > 0)
    .map((p) => {
      const hand = s.hands[p]!;
      return { from: p, to: nextAlive(s, p)!, card: hand[randomInt(rng, hand.length)]! };
    });
  const hands = { ...s.hands };
  for (const { from, card } of passes) hands[from] = hands[from]!.filter((c) => c !== card);
  for (const { to, card } of passes) hands[to] = [...hands[to]!, card];
  return passes.reduce((acc, x) => logged(acc, { t: 'passed', ...x }, [x.from, x.to]), { ...s, hands });
}

/** O efeito de um par de bicho que não foi cancelado (spec "Par de cada bicho"); com Boto, o do bicho em `play.as`. */
export function applyPair(s: KittensState, by: string, play: KittensPlay, ctx: GameContext): KittensState {
  const deadline = ctx.now + KITTENS_CHOICE_MS;
  switch (play.as) {
    case 'mico': {
      // Cada adversário vivo com carta descarta uma, ao mesmo tempo; ninguém com carta, nada acontece.
      const waiting = s.alive.filter((p) => p !== by && s.hands[p]!.length > 0);
      return waiting.length === 0 ? s : { ...s, choice: { kind: 'mico', by, waiting, discarded: [], deadline } };
    }
    case 'quati':
      return { ...s, choice: { kind: 'quati', who: by, deadline } };
    case 'tamandua':
      return tamandua(s, by);
    case 'preguica':
      return preguica(s, by, play.ask!, ctx.rng, play.cards);
    case 'capivara':
      return roda(s, by, ctx.rng);
    case 'tucano':
      // Pedido do Rafa (2026-10-21): quem jogou acaba a vez sem comprar, como o Pular (sob ataque, gasta só um dos
      // turnos), e a próxima vez do alvo é pulada. A pulada entra antes: se o alvo é o próximo, já perde a vez agora.
      return spendTurn(addSkip(logged(s, { t: 'tucano', by, target: play.target! }), play.target!));
    case 'latido':
      // Par de Latidores (pedido do Rafa, 2026-10-21): o alvo escolhido joga um Desarme ou explode. A vez continua.
      return barkPair(s, by, play.target!, deadline);
    default:
      return s; // parsePlay só deixa passar par de bicho ou de Latidor
  }
}

/**
 * Trio: rouba um Desarme de um adversário sorteado entre os que têm (todos veem). Exceção (pedido do Rafa, 2026-10-20):
 * 3 Favores tiram 3 cartas do alvo (a mão toda, se tiver menos). Buff (pedido do Rafa, 2026-10-28): a primeira sai ao
 * acaso da mão dele (só os dois veem qual) e as outras ele escolhe, uma de cada vez. Trio de Favor que estava no ar antes
 * da regra de 2026-10-20 (salvo sem alvo) vale como trio comum: rouba um Desarme.
 */
export function applyTrio(s: KittensState, by: string, play: KittensPlay, ctx: GameContext): KittensState {
  if (play.as === 'favor' && play.target !== null) {
    const who = play.target;
    const hand = s.hands[who]!;
    const card = hand[randomInt(ctx.rng, hand.length)]!;
    const pulled = logged(moveCard(s, who, by, card), { t: 'gave', from: who, to: by, card, random: true }, [who, by]);
    const left = Math.min(2, pulled.hands[who]!.length);
    if (left === 0) return pulled;
    return { ...pulled, choice: { kind: 'favor', who, to: by, left, deadline: ctx.now + KITTENS_CHOICE_MS } };
  }
  const holders = s.alive.filter((p) => p !== by && s.hands[p]!.some(isKind('cafune')));
  if (holders.length === 0) return logged(s, { t: 'grabbed', by, from: null, card: null });
  const from = holders[randomInt(ctx.rng, holders.length)]!;
  const card = s.hands[from]!.find(isKind('cafune'))!;
  return logged(moveCard(s, from, by, card), { t: 'grabbed', by, from, card });
}
