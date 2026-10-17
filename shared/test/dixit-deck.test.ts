import { describe, expect, it } from 'vitest';
import { DIXIT_DECK_SIZE, dixitCardIds } from '../src/games/dixit/deck';

describe('baralho do Dixit', () => {
  it('tem 113 cartas, ids d001… com 3 dígitos', () => {
    const ids = dixitCardIds();
    expect(DIXIT_DECK_SIZE).toBe(113);
    expect(ids).toHaveLength(113);
    expect(ids[0]).toBe('d001');
    expect(ids[112]).toBe('d113');
    expect(new Set(ids).size).toBe(113);
  });

  it('aceita outro tamanho', () => {
    expect(dixitCardIds(3)).toEqual(['d001', 'd002', 'd003']);
  });
});
