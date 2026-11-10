import { geometry } from './board';
import {
  MANDACARU_LOG_MAX,
  MANDACARU_PIECES,
  RESOURCES,
  type MandacaruLogEntry,
  type MandacaruState,
  type Resource,
  type Resources,
} from './types';

/** Acrescenta uma linha ao diário, guardando só as últimas `MANDACARU_LOG_MAX`. */
export function logged(state: MandacaruState, entry: MandacaruLogEntry): MandacaruState {
  return { ...state, log: [...state.log, entry].slice(-MANDACARU_LOG_MAX) };
}

export function canAfford(have: Resources, cost: Resources): boolean {
  return RESOURCES.every((r) => have[r] >= cost[r]);
}

export function handSize(res: Resources): number {
  return RESOURCES.reduce((n, r) => n + res[r], 0);
}

/** Tira `cost` da mão de `player` e devolve ao banco (não confere se dá; chame canAfford antes). */
export function pay(state: MandacaruState, player: string, cost: Resources): MandacaruState {
  const hand = state.hands[player]!;
  const res = { ...hand.res };
  const bank = { ...state.bank };
  for (const r of RESOURCES) {
    res[r] -= cost[r];
    bank[r] += cost[r];
  }
  return { ...state, bank, hands: { ...state.hands, [player]: { ...hand, res } } };
}

/** Dá `gain` do banco pro jogador (não confere o banco). */
export function grant(state: MandacaruState, player: string, gain: Resources): MandacaruState {
  const hand = state.hands[player]!;
  const res = { ...hand.res };
  const bank = { ...state.bank };
  for (const r of RESOURCES) {
    res[r] += gain[r];
    bank[r] -= gain[r];
  }
  return { ...state, bank, hands: { ...state.hands, [player]: { ...hand, res } } };
}

export function piecesLeft(state: MandacaruState, player: string): { road: number; house: number; city: number } {
  let road = 0;
  let house = 0;
  let city = 0;
  for (const o of state.roads) if (o === player) road++;
  for (const b of state.buildings) {
    if (b?.owner !== player) continue;
    if (b.kind === 'house') house++;
    else city++;
  }
  return { road: MANDACARU_PIECES.road - road, house: MANDACARU_PIECES.house - house, city: MANDACARU_PIECES.city - city };
}

/** Cantos onde `player` pode pôr casa. `setup: true` dispensa a estrada ligada. Não olha peças nem custo. */
export function houseSpots(state: MandacaruState, player: string, setup: boolean): number[] {
  const g = geometry();
  const out: number[] = [];
  g.vertices.forEach((v, i) => {
    if (state.buildings[i]) return;
    if (v.neighbors.some((n) => state.buildings[n])) return;
    if (!setup && !v.edges.some((e) => state.roads[e] === player)) return;
    out.push(i);
  });
  return out;
}

/** Lados onde `player` pode pôr estrada. Com `from`, só os encostados nesse canto (preparação). Não olha peças nem custo. */
export function roadSpots(state: MandacaruState, player: string, from?: number): number[] {
  const g = geometry();
  const out: number[] = [];
  g.edges.forEach((e, i) => {
    if (state.roads[i] !== null) return;
    if (from !== undefined) {
      if (e.a === from || e.b === from) out.push(i);
      return;
    }
    const linked = [e.a, e.b].some((v) => {
      const b = state.buildings[v];
      if (b?.owner === player) return true;
      // Casa de outro no canto corta a ligação.
      if (b) return false;
      return g.vertices[v]!.edges.some((x) => x !== i && state.roads[x] === player);
    });
    if (linked) out.push(i);
  });
  return out;
}

/** Cantos com casa de `player` (onde dá pra subir vila). */
export function citySpots(state: MandacaruState, player: string): number[] {
  const out: number[] = [];
  state.buildings.forEach((b, i) => {
    if (b?.owner === player && b.kind === 'house') out.push(i);
  });
  return out;
}

/** Taxa da feira por recurso dado: 2 (feira do recurso), 3 (feira comum) ou 4. */
export function portRates(state: MandacaruState, player: string): Record<Resource, number> {
  const rates: Record<Resource, number> = { wood: 4, brick: 4, leather: 4, beans: 4, stone: 4 };
  const kinds = state.layout?.ports ?? [];
  geometry().ports.forEach((p, i) => {
    const kind = kinds[i];
    if (kind === undefined) return;
    if (!p.vertices.some((v) => state.buildings[v]?.owner === player)) return;
    if (kind === 'generic') {
      for (const r of RESOURCES) rates[r] = Math.min(rates[r], 3);
    } else {
      rates[kind] = 2;
    }
  });
  return rates;
}

/** Pontos de `player`: casas, vilas, maior estrada, maior comitiva e, com `hidden`, os cordéis de Ponto. */
export function points(state: MandacaruState, player: string, hidden: boolean): number {
  let n = 0;
  for (const b of state.buildings) if (b?.owner === player) n += b.kind === 'house' ? 1 : 2;
  if (state.longestRoad === player) n += 2;
  if (state.largestArmy === player) n += 2;
  if (hidden) n += state.hands[player]?.cordeis.filter((c) => c.kind === 'point').length ?? 0;
  return n;
}
