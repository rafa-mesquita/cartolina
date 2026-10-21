import { describe, expect, it } from 'vitest';
import { DIXIT_DECK_SIZE, dixitCardIds } from '../src/games/dixit/deck';

describe('baralho do Dixit', () => {
  it('tem 224 cartas, ids d001… com 3 dígitos', () => {
    const ids = dixitCardIds();
    expect(DIXIT_DECK_SIZE).toBe(224);
    expect(ids).toHaveLength(224);
    expect(ids[0]).toBe('d001');
    expect(ids[223]).toBe('d224');
    expect(new Set(ids).size).toBe(224);
  });

  it('aceita outro tamanho', () => {
    expect(dixitCardIds(3)).toEqual(['d001', 'd002', 'd003']);
  });
});
