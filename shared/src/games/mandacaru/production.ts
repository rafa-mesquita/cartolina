import { geometry } from './board';
import { grant } from './build';
import { RESOURCES, TERRAIN_RESOURCE, noResources, type MandacaruState, type Resource, type Resources } from './types';

/** Aplica a produção da soma `roll` (≠ 7): casa 1, vila 2, nada no terreno do Carcará; banco curto (§2.3). */
export function produce(
  state: MandacaruState,
  roll: number,
): { state: MandacaruState; gains: Record<string, Resources>; short: Resource[] } {
  const g = geometry();
  // O que cada um ganharia se o banco desse pra todos.
  const owed: Record<string, Resources> = {};
  state.layout?.hexes.forEach((tile, h) => {
    if (tile.number !== roll || h === state.carcara) return;
    const r = TERRAIN_RESOURCE[tile.terrain];
    if (r === null) return;
    for (const v of g.hexes[h]!.corners) {
      const b = state.buildings[v];
      if (!b) continue;
      owed[b.owner] ??= noResources();
      owed[b.owner]![r] += b.kind === 'city' ? 2 : 1;
    }
  });

  const gains: Record<string, Resources> = {};
  const short: Resource[] = [];
  for (const r of RESOURCES) {
    const takers = Object.keys(owed).filter((p) => owed[p]![r] > 0);
    if (takers.length === 0) continue;
    const total = takers.reduce((n, p) => n + owed[p]![r], 0);
    if (state.bank[r] >= total) {
      for (const p of takers) (gains[p] ??= noResources())[r] = owed[p]![r];
    } else if (takers.length === 1) {
      // Banco curto com um só recebendo: leva o que tiver.
      if (state.bank[r] > 0) (gains[takers[0]!] ??= noResources())[r] = state.bank[r];
    } else {
      short.push(r);
    }
  }

  let next = state;
  for (const [p, gain] of Object.entries(gains)) next = grant(next, p, gain);
  return { state: next, gains, short };
}

/** Recursos da segunda casa da preparação: 1 de cada terreno em volta de `vertex` (rio seco não rende). */
export function setupGain(state: MandacaruState, vertex: number): Resources {
  const gain = noResources();
  for (const h of geometry().vertices[vertex]!.hexes) {
    const tile = state.layout?.hexes[h];
    const r = tile ? TERRAIN_RESOURCE[tile.terrain] : null;
    if (r !== null) gain[r] += 1;
  }
  return gain;
}
