import { describe, expect, it } from 'vitest';
import { geometry } from '../src/games/mandacaru/board';
import { desertOf, randomLayout } from '../src/games/mandacaru/setup';
import { NUMBER_TOKENS, PORT_KINDS, TERRAIN_COUNTS, TERRAINS } from '../src/games/mandacaru/types';
import { mulberry32 } from '../src/rng';

const sorted = <T>(a: readonly T[]) => [...a].sort();

describe('Mandacaru: sorteio do tabuleiro', () => {
  it('usa todos os terrenos, fichas e feiras, com o rio seco sem número', () => {
    const l = randomLayout(mulberry32(7));
    for (const t of TERRAINS) expect(l.hexes.filter((h) => h.terrain === t)).toHaveLength(TERRAIN_COUNTS[t]);
    expect(sorted(l.hexes.filter((h) => h.number !== null).map((h) => h.number))).toEqual(sorted(NUMBER_TOKENS));
    expect(l.hexes[desertOf(l)]!).toEqual({ terrain: 'desert', number: null });
    expect(sorted(l.ports)).toEqual(sorted(PORT_KINDS));
  });

  it('6 e 8 nunca ficam vizinhos (200 sementes)', () => {
    const g = geometry();
    for (let seed = 1; seed <= 200; seed++) {
      const l = randomLayout(mulberry32(seed));
      const hot = (i: number) => l.hexes[i]!.number === 6 || l.hexes[i]!.number === 8;
      g.hexes.forEach((h, i) => {
        if (hot(i)) for (const n of h.neighbors) expect(hot(n), `semente ${seed}`).toBe(false);
      });
    }
  });

  it('a mesma semente dá o mesmo tabuleiro; outra semente, outro', () => {
    expect(randomLayout(mulberry32(3))).toEqual(randomLayout(mulberry32(3)));
    expect(randomLayout(mulberry32(3))).not.toEqual(randomLayout(mulberry32(4)));
  });
});
