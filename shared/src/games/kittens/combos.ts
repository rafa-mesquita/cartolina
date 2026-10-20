import type { GameContext } from '../../game';
import { randomInt, type Rng } from '../../rng';
import { kittensKindOf, type KittensCardKind } from './cards';
import { cure, logged, moveCard, nextAlive } from './turn';
import { KITTENS_CHOICE_MS, type KittensPlay, type KittensState } from './types';

const isKind = (k: KittensCardKind) => (c: string) => kittensKindOf(c) === k;

/**
 * Par de Tamanduá: compra as 2 de cima; Tatubum vai pro fundo (sem gastar Desarme), o resto pra mão. A vez continua.
 * Comprou: o Mau-olhado de quem jogou passa.
 */
function tamandua(state: KittensState, by: string): KittensState {
  const s = cure(state, by);
  const n = Math.min(2, s.draw.length);
  const taken = s.draw.slice(-n).reverse(); // a de cima primeiro
  const tatus = taken.filter(isKind('tatubum'));
  const kept = taken.filter((c) => !isKind('tatubum')(c));
  let next: KittensState = {
    ...s,
    draw: [...tatus, ...s.draw.slice(0, s.draw.length - n)],
    peek: null,
    hands: { ...s.hands, [by]: [...s.hands[by]!, ...kept] },
  };
  for (const card of kept) next = logged(next, { t: 'draw', by, card }, [by]);
  return tatus.length > 0 ? logged(next, { t: 'buried', by, tatus: tatus.length }) : next;
}

/** Par de Preguiça: puxa um `ask` de um adversário sorteado entre os que têm; ninguém tem, procura no monte. */
function preguica(s: KittensState, by: string, ask: KittensCardKind, rng: Rng): KittensState {
  const holders = s.alive.filter((p) => p !== by && s.hands[p]!.some(isKind(ask)));
  if (holders.length > 0) {
    const from = holders[randomInt(rng, holders.length)]!;
    const card = s.hands[from]!.find(isKind(ask))!;
    return logged(moveCard(s, from, by, card), { t: 'called', by, ask, from, card });
  }
  const inDraw = s.draw.filter(isKind(ask));
  if (inDraw.length === 0) return logged(s, { t: 'called', by, ask, from: null, card: null });
  const card = inDraw[randomInt(rng, inDraw.length)]!;
  const next: KittensState = { ...s, draw: s.draw.filter((c) => c !== card), peek: null, hands: { ...s.hands, [by]: [...s.hands[by]!, card] } };
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
      return waiting.length === 0 ? s : { ...s, choice: { kind: 'mico', by, waiting, deadline } };
    }
    case 'quati':
      return { ...s, choice: { kind: 'quati', who: by, deadline } };
    case 'tamandua':
      return tamandua(s, by);
    case 'preguica':
      return preguica(s, by, play.ask!, ctx.rng);
    case 'capivara':
      return roda(s, by, ctx.rng);
    default:
      return s; // parsePlay só deixa passar par de bicho
  }
}

/**
 * Trio: rouba um Desarme de um adversário sorteado entre os que têm (todos veem). Exceção (pedido do Rafa, 2026-10-20):
 * 3 Favores abrem a escolha do Favor pro alvo, que dá 3 cartas (a mão toda, se tiver menos), uma de cada vez.
 */
export function applyTrio(s: KittensState, by: string, play: KittensPlay, ctx: GameContext): KittensState {
  if (play.as === 'favor') {
    const who = play.target!;
    const left = Math.min(3, s.hands[who]!.length);
    return { ...s, choice: { kind: 'favor', who, to: by, left, deadline: ctx.now + KITTENS_CHOICE_MS } };
  }
  const holders = s.alive.filter((p) => p !== by && s.hands[p]!.some(isKind('cafune')));
  if (holders.length === 0) return logged(s, { t: 'grabbed', by, from: null, card: null });
  const from = holders[randomInt(ctx.rng, holders.length)]!;
  const card = s.hands[from]!.find(isKind('cafune'))!;
  return logged(moveCard(s, from, by, card), { t: 'grabbed', by, from, card });
}
