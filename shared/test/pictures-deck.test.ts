import { describe, expect, it } from 'vitest';
import { COORDS, PICTURES_COUNTDOWN_MS, PICTURES_MAX_PLAYERS, PICTURES_MIN_PLAYERS, PICTURES_ROUNDS } from '../src/games/pictures/types';

describe('Retratim: constantes e coordenadas', () => {
  it('3 a 6 pessoas, 6 rodadas, 30 s', () => {
    expect([PICTURES_MIN_PLAYERS, PICTURES_MAX_PLAYERS, PICTURES_ROUNDS, PICTURES_COUNTDOWN_MS]).toEqual([3, 6, 6, 30_000]);
  });

  it('16 coordenadas linha por linha: A1 é o índice 0, D1 o 3, A2 o 4, D4 o 15', () => {
    expect(COORDS).toHaveLength(16);
    expect(new Set(COORDS).size).toBe(16);
    expect([COORDS[0], COORDS[3], COORDS[4], COORDS[15]]).toEqual(['A1', 'D1', 'A2', 'D4']);
  });
});
