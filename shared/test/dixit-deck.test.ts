import { describe, expect, it } from 'vitest';
import { DIXIT_DECK_SIZE, dixitCardIds } from '../src/games/dixit/deck';

describe('baralho do Dixit', () => {
  it('tem 276 cartas, ids d001… com 3 dígitos', () => {
    const ids = dixitCardIds();
    expect(DIXIT_DECK_SIZE).toBe(276);
    expect(ids).toHaveLength(276);
    expect(ids[0]).toBe('d001');
    expect(ids[275]).toBe('d276');
    expect(new Set(ids).size).toBe(276);
  });

  it('aceita outro tamanho', () => {
    expect(dixitCardIds(3)).toEqual(['d001', 'd002', 'd003']);
  });
});
