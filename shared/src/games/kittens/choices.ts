import { randomInt, type Rng } from '../../rng';
import { logged, spendTurn } from './turn';
import type { KittensChoice, KittensState } from './types';

type Choice<K extends KittensChoice['kind']> = Extract<KittensChoice, { kind: K }>;

/** Cafuné: o tatu volta pro monte `position` cartas abaixo do topo (0 = topo, tamanho do monte = fundo). Gasta 1 turno. */
export function hideTatu(s: KittensState, c: Choice<'cafune'>, position: number | 'random', rng: Rng): KittensState {
  const pos = position === 'random' ? randomInt(rng, s.draw.length + 1) : position;
  const at = s.draw.length - pos;
  const draw = [...s.draw.slice(0, at), c.tatu, ...s.draw.slice(at)];
  return spendTurn(logged({ ...s, draw, choice: null }, { t: 'hid', by: c.who }));
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

/** 5 diferentes: `who` pega `card` do descarte (todos veem). */
export function pickFromDiscard(s: KittensState, c: Choice<'cinco'>, card: string): KittensState {
  const hands = { ...s.hands, [c.who]: [...s.hands[c.who]!, card] };
  return logged({ ...s, discard: s.discard.filter((x) => x !== card), hands, choice: null }, { t: 'picked', by: c.who, card });
}

/** Prazo vencido (ou quem escolhe caiu de vez): o servidor escolhe ao acaso. */
export function chooseAtRandom(s: KittensState, rng: Rng): KittensState {
  const c = s.choice!;
  switch (c.kind) {
    case 'cafune':
      return hideTatu(s, c, 'random', rng);
    case 'favor': {
      const hand = s.hands[c.who]!;
      return hand.length === 0 ? { ...s, choice: null } : giveFavor(s, c, hand[randomInt(rng, hand.length)]!);
    }
    case 'cinco': {
      const options = c.options.filter((x) => s.discard.includes(x));
      return options.length === 0 ? { ...s, choice: null } : pickFromDiscard(s, c, options[randomInt(rng, options.length)]!);
    }
    default:
      return { ...s, choice: null };
  }
}
