import { randomInt, type Rng } from '../../rng';
import { kittensKindOf } from './cards';
import { cure, eliminate, logged, spendTurn } from './turn';
import type { KittensChoice, KittensState } from './types';

type Choice<K extends KittensChoice['kind']> = Extract<KittensChoice, { kind: K }>;

const isKind = (k: string) => (c: string) => kittensKindOf(c) === k;

/**
 * `p` pega `card`, que acabou de sair do monte (`draw` = o monte sem ela): é "comprar" (cura o Mau-olhado). Tatubum: com
 * Desarme, abre a escolha de jogá-lo (prazo `deadline`; a carta fica na mão até lá); sem, explode. Outra carta: vai pra
 * mão (só `p` vê qual) e gasta 1 turno. Usado pela compra normal e pelo Feitiço.
 */
export function takeCard(s: KittensState, p: string, card: string, draw: string[], deadline: number): KittensState {
  const base = cure({ ...s, draw }, p);
  const hand = base.hands[p]!;
  if (kittensKindOf(card) !== 'tatubum') {
    return spendTurn(logged({ ...base, hands: { ...base.hands, [p]: [...hand, card] } }, { t: 'draw', by: p, card }, [p]));
  }
  if (!hand.some(isKind('cafune'))) return eliminate(logged(base, { t: 'boom', by: p }), p, [card]);
  return logged({ ...base, peek: null, choice: { kind: 'tatu', who: p, tatu: card, deadline } }, { t: 'tatu', by: p });
}

/** Cafuné: o tatu volta pro monte `position` cartas abaixo do topo (0 = topo, tamanho do monte = fundo). Gasta 1 turno. */
export function hideTatu(s: KittensState, c: Choice<'cafune'>, position: number | 'random', rng: Rng): KittensState {
  const pos = position === 'random' ? randomInt(rng, s.draw.length + 1) : position;
  const at = s.draw.length - pos;
  const draw = [...s.draw.slice(0, at), c.tatu, ...s.draw.slice(at)];
  return spendTurn(logged({ ...s, draw, choice: null }, { t: 'hid', by: c.who }));
}

/**
 * Tatu comprado: `who` joga o Desarme `card` (vai pro descarte, todos veem). Abre a escolha de onde esconder o tatu,
 * com prazo `deadline`.
 */
export function useCafune(s: KittensState, c: Choice<'tatu'>, card: string, deadline: number): KittensState {
  const hands = { ...s.hands, [c.who]: s.hands[c.who]!.filter((x) => x !== card) };
  const choice: Choice<'cafune'> = { kind: 'cafune', who: c.who, tatu: c.tatu, deadline };
  return logged({ ...s, hands, discard: [...s.discard, card], choice }, { t: 'cafune', by: c.who });
}

/** Favor: `who` dá `card` pra `to`. Só os dois veem qual carta foi. */
export function giveFavor(s: KittensState, c: Choice<'favor'>, card: string): KittensState {
  const hands = {
    ...s.hands,
    [c.who]: s.hands[c.who]!.filter((x) => x !== card),
    [c.to]: [...s.hands[c.to]!, card],
  };
  return logged({ ...s, hands, choice: null }, { t: 'gave', from: c.who, to: c.to, card }, [c.who, c.to]);
}

/**
 * 5 diferentes: `who` pega `card` do descarte (todos veem). São duas cartas, uma por vez: a escolha continua aberta
 * (mesmo prazo, `left` menor) até pegar todas ou não sobrar opção no descarte.
 */
export function pickFromDiscard(s: KittensState, c: Choice<'cinco'>, card: string): KittensState {
  const hands = { ...s.hands, [c.who]: [...s.hands[c.who]!, card] };
  const discard = s.discard.filter((x) => x !== card);
  const options = c.options.filter((x) => x !== card && discard.includes(x));
  const left = c.left - 1;
  const choice = left > 0 && options.length > 0 ? { ...c, options, left } : null;
  return logged({ ...s, discard, hands, choice }, { t: 'picked', by: c.who, card });
}

/** Par de Mico: `p` (que está na espera) descarta `card` da própria mão, à vista de todos; o efeito da carta não vale. */
export function discardForMico(s: KittensState, c: Choice<'mico'>, p: string, card: string): KittensState {
  const hands = { ...s.hands, [p]: s.hands[p]!.filter((x) => x !== card) };
  const waiting = c.waiting.filter((x) => x !== p);
  const choice = waiting.length > 0 ? { ...c, waiting } : null;
  return logged({ ...s, hands, discard: [...s.discard, card], choice }, { t: 'discarded', by: p, card });
}

/** Par de Quati: a carta de cima fica (`keep`) ou vai pro fundo. Todos sabem se foi, ninguém sabe qual. */
export function delayTop(s: KittensState, c: Choice<'quati'>, keep: boolean): KittensState {
  const draw = keep ? s.draw : [s.draw.at(-1)!, ...s.draw.slice(0, -1)];
  return logged({ ...s, draw, choice: null, peek: keep ? s.peek : null }, { t: 'delayed', by: c.who, moved: !keep });
}

/** O Tatu Latidor que `p` tem (na frente primeiro, depois na mão), ou undefined. */
export function latidoOf(s: KittensState, p: string): string | undefined {
  return (s.front[p] ?? []).find(isKind('latido')) ?? s.hands[p]?.find(isKind('latido'));
}

/**
 * Tatu Latidor: `who` joga o Desarme `card` pra não explodir. O Desarme e o Latidor dele (da frente ou da mão) vão pro
 * descarte (o que foi jogado já está lá). A vez continua com quem jogou o Latidor.
 */
export function defendLatido(s: KittensState, c: Choice<'latido'>, card: string): KittensState {
  const latido = latidoOf(s, c.who);
  const mine = s.front[c.who] ?? [];
  const front = latido !== undefined && mine.includes(latido) ? { ...s.front, [c.who]: mine.filter((x) => x !== latido) } : s.front;
  const hand = s.hands[c.who]!.filter((x) => x !== card && x !== latido);
  const discard = [...s.discard, card, ...(latido !== undefined ? [latido] : [])];
  return logged({ ...s, front, hands: { ...s.hands, [c.who]: hand }, discard, choice: null }, { t: 'cafune', by: c.who });
}

/**
 * Feitiço: `who` fica com a carta de baixo do monte (`keep`: é comprar; Tatubum segue o fluxo do Desarme) ou ela vai pro
 * topo. Nos dois casos gasta 1 turno (o Tatubum guardado gasta quando o tatu volta pro monte, ou some com a explosão).
 * `deadline` = prazo da escolha do Desarme, se o guardado for Tatubum.
 */
export function conjure(s: KittensState, c: Choice<'feitico'>, keep: boolean, deadline: number): KittensState {
  const bottom = s.draw[0]!;
  const done = logged({ ...s, choice: null }, { t: 'conjured', by: c.who, kept: keep });
  if (keep) return takeCard(done, c.who, bottom, s.draw.slice(1), deadline);
  return spendTurn({ ...done, draw: [...s.draw.slice(1), bottom], peek: null });
}

/**
 * Prazo vencido (ou quem escolhe caiu de vez): o servidor escolhe ao acaso (no Quati, a carta fica; no Mico, cada um
 * que falta descarta uma; nos 5 diferentes, pega o que faltar; no Latidor, o Desarme vai sozinho; no Feitiço, fica
 * com a carta, a não ser que seja um Tatubum: aí ela vai pro topo).
 */
export function chooseAtRandom(s: KittensState, rng: Rng): KittensState {
  const c = s.choice!;
  switch (c.kind) {
    case 'tatu': {
      // Usa o Desarme e esconde o tatu de uma vez só. (A mão não muda durante a escolha, então sempre há um Desarme.)
      const card = s.hands[c.who]!.find(isKind('cafune'));
      if (card === undefined) return eliminate(logged({ ...s, choice: null }, { t: 'boom', by: c.who }), c.who, [c.tatu]);
      const used = useCafune(s, c, card, c.deadline);
      return hideTatu(used, used.choice as Choice<'cafune'>, 'random', rng);
    }
    case 'cafune':
      return hideTatu(s, c, 'random', rng);
    case 'favor': {
      const hand = s.hands[c.who]!;
      return hand.length === 0 ? { ...s, choice: null } : giveFavor(s, c, hand[randomInt(rng, hand.length)]!);
    }
    case 'cinco': {
      // Pega as que faltam, ao acaso (cada pegada atualiza `options`/`left` ou fecha a escolha).
      let next = s;
      while (next.choice?.kind === 'cinco') {
        const cur: Choice<'cinco'> = next.choice;
        const options = cur.options.filter((x) => next.discard.includes(x));
        next =
          options.length === 0 ? { ...next, choice: null } : pickFromDiscard(next, cur, options[randomInt(rng, options.length)]!);
      }
      return next;
    }
    case 'mico': {
      // Cada um que falta descarta uma carta ao acaso, na ordem da espera.
      let next = s;
      for (const p of c.waiting) {
        const hand = next.hands[p]!;
        if (hand.length > 0) next = discardForMico(next, next.choice as Choice<'mico'>, p, hand[randomInt(rng, hand.length)]!);
      }
      return { ...next, choice: null };
    }
    case 'quati':
      // Sem resposta, a carta fica onde está (nada muda pra ninguém).
      return delayTop(s, c, true);
    case 'latido': {
      // A mão não muda durante a escolha (ela só abre pra quem tem Desarme); sem Desarme, explode.
      const card = s.hands[c.who]!.find(isKind('cafune'));
      if (card === undefined) return eliminate(logged({ ...s, choice: null }, { t: 'boom', by: c.who }), c.who);
      return defendLatido(s, c, card);
    }
    case 'feitico':
      // Fica com a carta, a não ser que seja Tatubum. (Nunca abre a escolha do Desarme: ninguém fica preso nela.)
      return conjure(s, c, kittensKindOf(s.draw[0]!) !== 'tatubum', c.deadline);
  }
}
