import { randomInt, type Rng } from '../../rng';
import { kittensKindOf } from './cards';
import { eliminate, logged, spendTurn } from './turn';
import type { KittensChoice, KittensState } from './types';

type Choice<K extends KittensChoice['kind']> = Extract<KittensChoice, { kind: K }>;

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

/**
 * Prazo vencido (ou quem escolhe caiu de vez): o servidor escolhe ao acaso (no Quati, a carta fica; no Mico, cada um
 * que falta descarta uma; nos 5 diferentes, pega o que faltar).
 */
export function chooseAtRandom(s: KittensState, rng: Rng): KittensState {
  const c = s.choice!;
  switch (c.kind) {
    case 'tatu': {
      // Usa o Desarme e esconde o tatu de uma vez só. (A mão não muda durante a escolha, então sempre há um Desarme.)
      const card = s.hands[c.who]!.find((x) => kittensKindOf(x) === 'cafune');
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
  }
}
