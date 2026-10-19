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
