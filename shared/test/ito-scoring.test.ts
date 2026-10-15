import { describe, expect, it } from 'vitest';
import { computeReveal, resolveOutcome } from '../src/games/ito/scoring';
import type { ItoCard } from '../src/games/ito/types';

function cardsFrom(values: number[]): { row: string[]; cards: Record<string, ItoCard> } {
  const cards: Record<string, ItoCard> = {};
  const row = values.map((value, i) => {
    const id = `p${i}:0`;
    cards[id] = { id, owner: `p${i}`, value, clue: '' };
    return id;
  });
  return { row, cards };
}

describe('computeReveal', () => {
  it('não marca erro quando está em ordem crescente', () => {
    const { row, cards } = cardsFrom([10, 20, 30]);
    expect(computeReveal(row, cards).map((e) => e.error)).toEqual([false, false, false]);
  });

  it('marca a carta menor que a maior já revelada', () => {
    const { row, cards } = cardsFrom([10, 30, 20]);
    expect(computeReveal(row, cards).map((e) => e.error)).toEqual([false, false, true]);
  });

  it('compara com o maior valor anterior, não só com o vizinho', () => {
    const { row, cards } = cardsFrom([50, 10, 20, 60]);
    expect(computeReveal(row, cards).map((e) => e.error)).toEqual([false, true, true, false]);
  });

  it('fila vazia devolve lista vazia', () => {
    expect(computeReveal([], {})).toEqual([]);
  });

  it('inclui dono e valor na ordem da fila', () => {
    const { row, cards } = cardsFrom([5, 7]);
    expect(computeReveal(row, cards)).toEqual([
      { cardId: 'p0:0', owner: 'p0', value: 5, error: false },
      { cardId: 'p1:0', owner: 'p1', value: 7, error: false },
    ]);
  });
});

describe('resolveOutcome', () => {
  it('modo livre: vitória sem erros, derrota com erro, vidas intactas', () => {
    expect(resolveOutcome('livre', 1, 3, 0)).toEqual({ lives: 3, outcome: 'round_won' });
    expect(resolveOutcome('livre', 1, 3, 2)).toEqual({ lives: 3, outcome: 'round_lost' });
  });

  it('campanha: cada erro custa uma vida e o nível se repete', () => {
    expect(resolveOutcome('campanha', 1, 3, 1)).toEqual({ lives: 2, outcome: 'level_failed' });
    expect(resolveOutcome('campanha', 2, 3, 2)).toEqual({ lives: 1, outcome: 'level_failed' });
  });

  it('campanha: vidas zeradas é derrota, nunca negativas', () => {
    expect(resolveOutcome('campanha', 2, 2, 5)).toEqual({ lives: 0, outcome: 'lost' });
  });

  it('campanha: passar do nível 3 com vida é vitória', () => {
    expect(resolveOutcome('campanha', 3, 1, 0)).toEqual({ lives: 1, outcome: 'won' });
  });

  it('campanha: bordas', () => {
    expect(resolveOutcome('campanha', 1, 2, 2)).toEqual({ lives: 0, outcome: 'lost' });
    expect(resolveOutcome('campanha', 3, 3, 2)).toEqual({ lives: 1, outcome: 'level_failed' });
    expect(resolveOutcome('campanha', 3, 2, 0)).toEqual({ lives: 2, outcome: 'won' });
    expect(resolveOutcome('campanha', 2, 3, 0)).toEqual({ lives: 3, outcome: 'level_cleared' });
  });
});
