import { shuffle, type Rng } from '../../rng';
import { CORDEIS, CORDEL_COUNTS, type CordelKind } from './types';

/** Os 25 cordéis embaralhados. */
export function shuffledCordelDeck(rng: Rng): CordelKind[] {
  return shuffle(
    rng,
    CORDEIS.flatMap((k) => Array<CordelKind>(CORDEL_COUNTS[k]).fill(k)),
  );
}
