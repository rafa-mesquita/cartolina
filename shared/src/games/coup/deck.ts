import { shuffle, type Rng } from '../../rng';
import { COUP_CHARACTERS, COUP_COPIES, type CoupCharacter } from './types';

/** As 15 cartas, 3 de cada personagem, na ordem de COUP_CHARACTERS. */
export function fullDeck(): CoupCharacter[] {
  return COUP_CHARACTERS.flatMap((c) => Array<CoupCharacter>(COUP_COPIES).fill(c));
}

export function shuffledDeck(rng: Rng): CoupCharacter[] {
  return shuffle(rng, fullDeck());
}
