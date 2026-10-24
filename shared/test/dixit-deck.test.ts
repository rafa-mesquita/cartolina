import { describe, expect, it } from 'vitest';
import { DIXIT_DECK_SIZE, dixitCardIds } from '../src/games/dixit/deck';

describe('baralho do Dixit', () => {
  it('tem 270 cartas, ids d001… com 3 dígitos', () => {
    const ids = dixitCardIds();
    expect(DIXIT_DECK_SIZE).toBe(270);
    expect(ids).toHaveLength(270);
    expect(ids[0]).toBe('d001');
    expect(ids[269]).toBe('d270');
    expect(new Set(ids).size).toBe(270);
  });

  it('aceita outro tamanho', () => {
    expect(dixitCardIds(3)).toEqual(['d001', 'd002', 'd003']);
  });
});
