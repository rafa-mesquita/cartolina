import { shuffle, type Rng } from '../../rng';
import { COORDS, type Coord } from './types';

/** Como no original: 48 fichas, cada coordenada 3 vezes. */
export const COPIES_PER_COORD = 3;

export function fullBag(): Coord[] {
  return COORDS.flatMap((c) => Array.from({ length: COPIES_PER_COORD }, () => c));
}

/** Uma ficha por jogador. As tiradas saem do saquinho pela partida inteira (6 × 6 = 36 ≤ 48). */
export function drawSecrets(
  rng: Rng,
  bag: readonly Coord[],
  players: readonly string[],
): { secrets: Record<string, Coord>; bag: Coord[] } {
  let rest = shuffle(rng, bag);
  const secrets: Record<string, Coord> = {};
  for (const p of players) {
    // Nunca acontece com 6 rodadas de até 6 pessoas; é só pra não quebrar se as regras mudarem.
    if (rest.length === 0) rest = shuffle(rng, fullBag());
    secrets[p] = rest.pop()!;
  }
  return { secrets, bag: rest };
}
