import { describe, expect, it } from 'vitest';
import { geometry, pips } from '../src/games/mandacaru/board';

describe('Mandacaru: geometria do tabuleiro', () => {
  const g = geometry();

  it('tem 19 terrenos, 54 cantos, 72 lados, 30 lados de costa e 9 feiras', () => {
    expect(g.hexes).toHaveLength(19);
    expect(g.vertices).toHaveLength(54);
    expect(g.edges).toHaveLength(72);
    expect(g.coast).toHaveLength(30);
    expect(g.ports).toHaveLength(9);
  });

  it('o terreno 9 é o centro e tem 6 vizinhos', () => {
    expect(g.hexes[9]).toMatchObject({ q: 0, r: 0 });
    expect(g.hexes[9]!.neighbors).toHaveLength(6);
  });

  it('cada terreno tem 6 cantos e 6 lados distintos, e o lado i liga os cantos i e i+1', () => {
    for (const h of g.hexes) {
      expect(new Set(h.corners).size).toBe(6);
      expect(new Set(h.edges).size).toBe(6);
      h.edges.forEach((e, i) => {
        const pair = [h.corners[i]!, h.corners[(i + 1) % 6]!].sort((a, b) => a - b);
        expect([g.edges[e]!.a, g.edges[e]!.b]).toEqual(pair);
      });
    }
  });

  it('cantos têm 2 ou 3 vizinhos, 1 a 3 terrenos e vizinhança simétrica', () => {
    g.vertices.forEach((v, i) => {
      expect([2, 3]).toContain(v.neighbors.length);
      expect(v.hexes.length).toBeGreaterThanOrEqual(1);
      expect(v.hexes.length).toBeLessThanOrEqual(3);
      expect(v.edges).toHaveLength(v.neighbors.length);
      for (const n of v.neighbors) expect(g.vertices[n]!.neighbors).toContain(i);
    });
  });

  it('a costa é um anel: lados seguidos dividem um canto', () => {
    g.coast.forEach((e, i) => {
      const next = g.coast[(i + 1) % g.coast.length]!;
      const a = g.edges[e]!;
      const b = g.edges[next]!;
      expect([a.a, a.b].some((v) => v === b.a || v === b.b)).toBe(true);
      expect(a.hexes).toHaveLength(1);
    });
  });

  it('nenhuma feira divide canto com outra, e os cantos dela são da costa', () => {
    const used = g.ports.flatMap((p) => p.vertices);
    expect(new Set(used).size).toBe(18);
    for (const p of g.ports) expect(g.coast).toContain(p.edge);
  });

  it('a geometria é calculada uma vez só', () => {
    expect(geometry()).toBe(g);
  });

  it('chance dos números', () => {
    expect([2, 3, 4, 5, 6, 8, 9, 10, 11, 12].map(pips)).toEqual([1, 2, 3, 4, 5, 5, 4, 3, 2, 1]);
    expect(pips(7)).toBe(0);
    expect(pips(null)).toBe(0);
  });
});
