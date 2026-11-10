import { shuffle, type Rng } from '../../rng';
import { geometry } from './board';
import { NUMBER_TOKENS, PORT_KINDS, TERRAIN_COUNTS, TERRAINS, type BoardLayout, type HexTile, type Terrain } from './types';

const hot = (n: number | null): boolean => n === 6 || n === 8;

/** Sorteia terrenos, fichas (6 e 8 nunca vizinhos; refaz até dar) e feiras. */
export function randomLayout(rng: Rng): BoardLayout {
  const g = geometry();
  const terrains = shuffle(
    rng,
    TERRAINS.flatMap((t) => Array<Terrain>(TERRAIN_COUNTS[t]).fill(t)),
  );
  let hexes: HexTile[];
  for (;;) {
    const tokens = shuffle(rng, NUMBER_TOKENS);
    let next = 0;
    hexes = terrains.map((terrain) => ({ terrain, number: terrain === 'desert' ? null : tokens[next++]! }));
    const ok = hexes.every((h, i) => !hot(h.number) || g.hexes[i]!.neighbors.every((n) => !hot(hexes[n]!.number)));
    if (ok) break;
  }
  return { hexes, ports: shuffle(rng, PORT_KINDS) };
}

/** Índice do rio seco no layout. */
export function desertOf(layout: BoardLayout): number {
  return layout.hexes.findIndex((h) => h.terrain === 'desert');
}
