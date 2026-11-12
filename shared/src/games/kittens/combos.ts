import type { GameContext } from '../../game';
import { randomInt, shuffle, type Rng } from '../../rng';
import { kittensKindOf, type KittensCardKind } from './cards';
import { barkPair } from './choices';
import { addSkip, clearPeeks, cure, logged, moveCard, nextAlive, passTo, spendTurn, unpeek } from './turn';
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

/**
 * Um puxão da Preguiça: mão de um adversário, monte (a carta sai das espiadas) e, por último, o descarte. Entre os
 * adversários que têm o bicho, vem de quem tem mais cartas na mão (pedido do Rafa, 2026-10-28); empate, sorteia.
 */
function callOne(s: KittensState, by: string, ask: KittensCardKind, rng: Rng, played: readonly string[]): KittensState {
  const withAsk = s.alive.filter((p) => p !== by && s.hands[p]!.some(isKind(ask)));
  const most = Math.max(0, ...withAsk.map((p) => s.hands[p]!.length));
  const holders = withAsk.filter((p) => s.hands[p]!.length === most);
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

/**
 * Par de Peixe-beta (pedido do Rafa, 2026-11-06): as 3 de cima entram na espiada de quem jogou, como no Espiar, e abre a
 * escolha do destino da segunda. Monte com menos de 2: só atualiza a espiada.
 */
function peixe(s: KittensState, by: string, deadline: number): KittensState {
  const cards = s.draw.slice(-3).reverse();
  if (cards.length === 0) return s;
  const seen = { ...s, peeks: { ...s.peeks, [by]: cards } };
  return cards.length < 2 ? seen : { ...seen, choice: { kind: 'peixe', who: by, deadline } };
}

/**
 * Par de Onça-pintada (pedido do Rafa, 2026-11-06): vê o topo e o fundo do monte e pega uma carta do descarte de antes da
 * jogada (`before`), menos Desarme. O topo fica na espiada dele. Sem opção, a escolha abre vazia só pra ele ver as cartas.
 */
function onca(s: KittensState, by: string, before: string[], deadline: number): KittensState {
  const top = s.draw.at(-1);
  const seen = top === undefined || Object.hasOwn(s.peeks, by) ? s : { ...s, peeks: { ...s.peeks, [by]: [top] } };
  const options = before.filter((c) => !isKind('cafune')(c));
  return { ...seen, choice: { kind: 'cinco', who: by, options, left: 1, deadline, from: 'onca' } };
}

/** Quantas cartas do descarte o par de Pombo-correio manda de volta pro monte. */
export const KITTENS_POMBO_CARDS = 5;

/**
 * Par de Pombo-correio (pedido do Rafa, 2026-11-08): até `KITTENS_POMBO_CARDS` cartas sorteadas do descarte de antes da
 * jogada (`before`) voltam pro monte, que é embaralhado inteiro com elas (pedido do Rafa, 2026-11-12; antes o resto do
 * monte mantinha a ordem). Depois uma delas, sorteada, vai pro topo. Ninguém sabe
 * qual foi pro topo, nem quem jogou. O monte mudou de ordem: as espiadas de todos somem, como no Embaralhar. A vez continua.
 */
function pombo(s: KittensState, by: string, before: string[], rng: Rng): KittensState {
  const sent = shuffle(rng, before).slice(0, KITTENS_POMBO_CARDS);
  if (sent.length === 0) return logged(s, { t: 'mailed', by, kinds: [] });
  const [top, ...rest] = sent;
  const draw = [...shuffle(rng, [...s.draw, ...rest]), top!];
  const gone = new Set(sent);
  const next = clearPeeks({ ...s, draw, discard: s.discard.filter((c) => !gone.has(c)) });
  return logged(next, { t: 'mailed', by, kinds: sent.map((c) => kittensKindOf(c)!).sort() });
}

/**
 * O efeito de um par de bicho que não foi cancelado (spec "Par de cada bicho"); com Boto, o do bicho em `play.as`. `by` =
 * quem está na vez; `caster` = quem manda a magia (outro, depois de um Sapo). `before` = descarte de antes da jogada.
 */
export function applyPair(s: KittensState, by: string, caster: string, play: KittensPlay, before: string[], ctx: GameContext): KittensState {
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
      // Pedido do Rafa (2026-10-21): quem jogou acaba a vez sem comprar, e a próxima vez do alvo é pulada. A pulada
      // entra antes: se o alvo é o próximo, já perde a vez agora. Desde 2026-11-03 a vez acaba inteira, mesmo sob
      // ataque (os turnos devidos se perdem), e no 1x1 só a sua vez acaba: pular o outro devolveria a vez pra você.
      // Refletido por um Sapo (2026-11-06): a vez de quem jogou acaba do mesmo jeito, e o alvo pode ser ele mesmo.
      if (s.alive.length === 2) return endTurn(logged(s, { t: 'tucano', by, target: play.target!, duel: true }));
      return endTurn(addSkip(logged(s, { t: 'tucano', by: caster, target: play.target! }), play.target!));
    case 'latido':
      // Par de Latidores (pedido do Rafa, 2026-10-21): o alvo escolhido joga um Desarme ou explode. A vez continua.
      return barkPair(s, caster, play.target!, deadline);
    case 'peixe':
      return peixe(s, by, deadline);
    case 'onca':
      return onca(s, by, before, deadline);
    case 'pombo':
      return pombo(s, by, before, ctx.rng);
    default:
      return s; // parsePlay só deixa passar par de bicho ou de Latidor
  }
}

/** Par de Tucano: acaba a vez de quem está nela, com todos os turnos devidos (Ataque), e passa pro próximo vivo. */
function endTurn(s: KittensState): KittensState {
  return passTo(s, nextAlive(s, s.current!), 1);
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
