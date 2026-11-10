import type { ActionResult, GameContext } from '../src/game';
import { geometry } from '../src/games/mandacaru/board';
import { applyMandacaruAction, initialMandacaruState } from '../src/games/mandacaru/rules';
import {
  MANDACARU_BANK_EACH,
  RESOURCES,
  noResources,
  type BoardLayout,
  type CordelCard,
  type CordelKind,
  type MandacaruAction,
  type MandacaruState,
  type Resources,
  type Terrain,
} from '../src/games/mandacaru/types';
import { mulberry32 } from '../src/rng';

export const T0 = 1_000_000;
export const ids = (n: number): string[] => Array.from({ length: n }, (_, i) => `p${i}`);

export function ctxOf(
  active: string[],
  { seed = 1, hostId = 'p0', now = T0 }: { seed?: number; hostId?: string | null; now?: number } = {},
): GameContext {
  return { hostId, active, rng: mulberry32(seed), now };
}

export function must<S>(res: ActionResult<S>): S {
  if (!res.ok) throw new Error(`ação recusada: ${res.error}`);
  return res.state;
}

export function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value)) deepFreeze(v);
  }
  return value;
}

export const tryAct = (s: MandacaruState, p: string, a: MandacaruAction, ctx: GameContext): ActionResult<MandacaruState> =>
  applyMandacaruAction(deepFreeze(s), p, a, ctx);
export const act = (s: MandacaruState, p: string, a: MandacaruAction, ctx: GameContext): MandacaruState => must(tryAct(s, p, a, ctx));

export const res = (partial: Partial<Resources> = {}): Resources => ({ ...noResources(), ...partial });

/**
 * Tabuleiro fixo dos testes (índice = terreno da geometria, ordem q crescente e depois r).
 * O 9 é o centro (0,0) e é o rio seco.
 */
const T: [Terrain, number | null][] = [
  ['forest', 11], ['pasture', 12], ['fields', 9], ['hills', 4], ['mountains', 3],
  ['forest', 6], ['pasture', 4], ['fields', 5], ['forest', 10], ['desert', null],
  ['hills', 8], ['mountains', 10], ['pasture', 2], ['fields', 9], ['forest', 3],
  ['pasture', 11], ['hills', 6], ['mountains', 5], ['fields', 8],
];
export const FIXED_LAYOUT: BoardLayout = {
  hexes: T.map(([terrain, number]) => ({ terrain, number })),
  ports: ['generic', 'wood', 'generic', 'brick', 'generic', 'leather', 'generic', 'beans', 'stone'],
};
export const DESERT = 9;

export interface MainOpts {
  players?: string[];
  turn?: string;
  phase?: MandacaruState['phase'];
  hands?: Record<string, Partial<Resources>>;
  cordeis?: Record<string, (CordelKind | CordelCard)[]>;
  /** canto → dono (casa) */
  houses?: Record<number, string>;
  /** canto → dono (vila) */
  cities?: Record<number, string>;
  /** lado → dono */
  roads?: Record<number, string>;
  deck?: CordelKind[];
  rolled?: boolean;
  carcara?: number;
  now?: number;
}

/**
 * Mesa montada à mão, já depois da preparação. O banco é 19 de cada menos o que está nas mãos.
 * Padrão: 3 jogadores p0..p2, vez do p0, fase `main` com dados rolados, Carcará no rio seco.
 */
export function table(opts: MainOpts = {}): MandacaruState {
  const g = geometry();
  const players = opts.players ?? ids(3);
  const hands: MandacaruState['hands'] = {};
  const bank = res(Object.fromEntries(RESOURCES.map((r) => [r, MANDACARU_BANK_EACH])));
  for (const p of players) {
    const h = res(opts.hands?.[p]);
    for (const r of RESOURCES) bank[r] -= h[r];
    const cordeis = (opts.cordeis?.[p] ?? []).map((c) => (typeof c === 'string' ? { kind: c, fresh: false } : c));
    hands[p] = { res: h, cordeis };
  }
  const buildings: MandacaruState['buildings'] = g.vertices.map(() => null);
  for (const [v, owner] of Object.entries(opts.houses ?? {})) buildings[Number(v)] = { owner, kind: 'house' };
  for (const [v, owner] of Object.entries(opts.cities ?? {})) buildings[Number(v)] = { owner, kind: 'city' };
  const roads: MandacaruState['roads'] = g.edges.map(() => null);
  for (const [e, owner] of Object.entries(opts.roads ?? {})) roads[Number(e)] = owner;
  const now = opts.now ?? T0;
  return {
    ...initialMandacaruState(),
    phase: opts.phase ?? 'main',
    match: 1,
    wins: Object.fromEntries(players.map((p) => [p, 0])),
    players,
    layout: FIXED_LAYOUT,
    carcara: opts.carcara ?? DESERT,
    buildings,
    roads,
    hands,
    bank,
    deck: opts.deck ?? ['vaqueiro', 'point', 'mutirao', 'chuva', 'atravessador'],
    turn: opts.turn ?? players[0]!,
    rolled: opts.rolled ?? (opts.phase ?? 'main') !== 'roll',
    knights: Object.fromEntries(players.map((p) => [p, 0])),
    turnEndsAt: now + 300_000,
    startedAt: now,
  };
}

/** Atalhos de geometria pros testes. */
export const geo = geometry;
export const corner = (hex: number, i: number): number => geometry().hexes[hex]!.corners[i]!;
export const side = (hex: number, i: number): number => geometry().hexes[hex]!.edges[i]!;
/** Lado entre dois cantos vizinhos. */
export function edgeBetween(a: number, b: number): number {
  const e = geometry().edges.findIndex((x) => (x.a === a && x.b === b) || (x.a === b && x.b === a));
  if (e < 0) throw new Error(`cantos ${a} e ${b} não são vizinhos`);
  return e;
}
