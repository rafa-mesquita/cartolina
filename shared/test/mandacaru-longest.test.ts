import { describe, expect, it } from 'vitest';
import { roadLength, updateAwards } from '../src/games/mandacaru/longest';
import { corner, edgeBetween, geo, table } from './mandacaru-helpers';

/** Caminho de `n` lados seguindo a borda do terreno `hex` a partir do canto 0 (no máximo 6 = anel). */
function ring(hex: number, n: number): number[] {
  return geo().hexes[hex]!.edges.slice(0, n);
}
const roadsOf = (edges: number[], owner: string) => Object.fromEntries(edges.map((e) => [e, owner]));

describe('Mandacaru: maior estrada', () => {
  it('caminho reto conta os lados', () => {
    expect(roadLength(table({ roads: roadsOf(ring(9, 4), 'p0') }), 'p0')).toBe(4);
  });

  it('anel fechado de 6 conta 6 (não repete lado)', () => {
    expect(roadLength(table({ roads: roadsOf(ring(9, 6), 'p0') }), 'p0')).toBe(6);
  });

  it('bifurcação: conta o maior ramo, não a soma', () => {
    const edges = ring(9, 4);
    const v = corner(9, 1); // canto do meio do caminho
    const branch = geo().vertices[v]!.edges.find((e) => !edges.includes(e))!;
    expect(roadLength(table({ roads: roadsOf([...edges, branch], 'p0') }), 'p0')).toBe(4);
  });

  it('casa de outro no meio corta o caminho', () => {
    const s = table({ roads: roadsOf(ring(9, 5), 'p0'), houses: { [corner(9, 2)]: 'p1' } });
    expect(roadLength(s, 'p0')).toBe(3);
  });

  it('casa própria no meio não corta', () => {
    const s = table({ roads: roadsOf(ring(9, 5), 'p0'), houses: { [corner(9, 2)]: 'p0' } });
    expect(roadLength(s, 'p0')).toBe(5);
  });

  it('5 ou mais e sozinho no topo ganha; empate não tira de quem tem', () => {
    let s = updateAwards(table({ roads: { ...roadsOf(ring(9, 5), 'p0') } }));
    expect(s.longestRoad).toBe('p0');
    expect(s.log.at(-1)).toEqual({ t: 'award', award: 'longest', player: 'p0' });
    s = updateAwards({ ...s, roads: s.roads.map((o, e) => (ring(0, 5).includes(e) ? 'p1' : o)) });
    expect(s.longestRoad).toBe('p0');
  });

  it('cortado e empatado entre os outros: fica sem dono', () => {
    const base = table({
      roads: { ...roadsOf(ring(9, 6), 'p0'), ...roadsOf(ring(0, 5), 'p1'), ...roadsOf(ring(18, 5), 'p2') },
    });
    const owned = { ...updateAwards(base), longestRoad: 'p0' };
    // casa do p1 em dois cantos do anel do p0 derruba o p0 pra menos de 5
    const cut = { ...owned, buildings: owned.buildings.map((b, v) => (v === corner(9, 1) || v === corner(9, 4) ? { owner: 'p1', kind: 'house' as const } : b)) };
    expect(updateAwards(cut).longestRoad).toBeNull();
  });

  it('maior comitiva: 3 Vaqueiros e mais que todos', () => {
    const s = table();
    expect(updateAwards({ ...s, knights: { p0: 2, p1: 0, p2: 0 } }).largestArmy).toBeNull();
    const a = updateAwards({ ...s, knights: { p0: 3, p1: 0, p2: 0 } });
    expect(a.largestArmy).toBe('p0');
    expect(updateAwards({ ...a, knights: { p0: 3, p1: 3, p2: 0 } }).largestArmy).toBe('p0');
    expect(updateAwards({ ...a, knights: { p0: 3, p1: 4, p2: 0 } }).largestArmy).toBe('p1');
  });
});
