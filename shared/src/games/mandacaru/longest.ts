import { geometry } from './board';
import { logged } from './build';
import { LARGEST_ARMY_MIN, LONGEST_ROAD_MIN, type MandacaruState } from './types';

/** Maior caminho de estradas de `player` sem repetir lado, sem atravessar canto com prédio de outro. */
export function roadLength(state: MandacaruState, player: string): number {
  const g = geometry();
  const used = new Set<number>();
  const blocked = (v: number): boolean => {
    const b = state.buildings[v];
    return b !== null && b !== undefined && b.owner !== player;
  };

  const walk = (v: number, len: number): number => {
    // Chegou num canto com prédio de outro: conta o lado, mas não continua.
    if (len > 0 && blocked(v)) return len;
    let best = len;
    for (const e of g.vertices[v]!.edges) {
      if (used.has(e) || state.roads[e] !== player) continue;
      const edge = g.edges[e]!;
      used.add(e);
      best = Math.max(best, walk(edge.a === v ? edge.b : edge.a, len + 1));
      used.delete(e);
    }
    return best;
  };

  let best = 0;
  g.vertices.forEach((v, i) => {
    if (v.edges.some((e) => state.roads[e] === player)) best = Math.max(best, walk(i, 0));
  });
  return best;
}

/**
 * Quem fica com o prêmio: o dono continua se não foi passado (empate fica com ele);
 * senão o único maior com pelo menos `min`; senão ninguém.
 */
function holder(owner: string | null, score: Record<string, number>, players: string[], min: number, ownerMin: number): string | null {
  const of = (p: string) => score[p] ?? 0;
  if (owner !== null && of(owner) >= ownerMin && players.every((p) => p === owner || of(p) <= of(owner))) return owner;
  const top = Math.max(0, ...players.map(of));
  if (top < min) return null;
  const leaders = players.filter((p) => of(p) === top);
  return leaders.length === 1 ? leaders[0]! : null;
}

/** Recalcula maior estrada e maior comitiva (§2.7) e registra no diário quando o dono muda. */
export function updateAwards(state: MandacaruState): MandacaruState {
  const lengths = Object.fromEntries(state.players.map((p) => [p, roadLength(state, p)]));
  const longestRoad = holder(state.longestRoad, lengths, state.players, LONGEST_ROAD_MIN, LONGEST_ROAD_MIN);
  // Vaqueiro jogado não volta: quem tem a comitiva só perde se alguém passar.
  const largestArmy = holder(state.largestArmy, state.knights, state.players, LARGEST_ARMY_MIN, 0);

  let next = state;
  if (longestRoad !== state.longestRoad) {
    next = logged({ ...next, longestRoad }, { t: 'award', award: 'longest', player: longestRoad });
  }
  if (largestArmy !== state.largestArmy) {
    next = logged({ ...next, largestArmy }, { t: 'award', award: 'army', player: largestArmy });
  }
  return next;
}
