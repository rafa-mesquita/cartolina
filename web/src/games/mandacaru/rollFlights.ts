/**
 * Cartas voando dos terrenos pra quem ganhou, quando saem os dados (só a conta; o desenho mora em `Flights.tsx`).
 */
import { RESOURCES, TERRAIN_RESOURCE, mandacaruGeometry, type BoardLayout, type Building, type MandacaruLogEntry, type Resource } from '@cartolina/shared';

/** Um voo: `n` cartas de `resource` saindo do terreno `hex` pra `player`. */
export interface Flight {
  player: string;
  resource: Resource;
  hex: number;
  n: number;
}

type RollEntry = Extract<MandacaruLogEntry, { t: 'roll' }>;

/**
 * De onde sai cada carta ganha na rolagem: os terrenos com o número que saiu (menos o do Carcará) que dão aquele recurso
 * e encostam numa casa (1) ou vila (2) do jogador. O ganho (`gains`) manda na quantidade: com banco curto ele é menor que
 * o devido, e as cartas são cortadas a partir do último terreno. Se nenhum terreno bater (o tabuleiro mudou desde a
 * rolagem), as cartas saem do primeiro terreno com o número que dá aquele recurso. Ordem: jogadores na ordem de `players`
 * (quem não está lá vai pro fim), recursos na ordem de `RESOURCES`, terrenos pelo índice.
 */
export function rollFlights(
  entry: RollEntry,
  layout: BoardLayout | null,
  buildings: (Building | null)[],
  carcara: number,
  players: string[] = [],
): Flight[] {
  if (!layout) return [];
  const sum = entry.dice[0] + entry.dice[1];
  if (sum === 7) return [];
  const geo = mandacaruGeometry();
  const order = Object.keys(entry.gains).sort((a, b) => rank(players, a) - rank(players, b));
  const out: Flight[] = [];
  for (const player of order) {
    const gain = entry.gains[player]!;
    for (const resource of RESOURCES) {
      const total = gain[resource] ?? 0;
      if (total <= 0) continue;
      const hexes = layout.hexes
        .map((tile, h) => ({ tile, h }))
        .filter(({ tile, h }) => tile.number === sum && h !== carcara && TERRAIN_RESOURCE[tile.terrain] === resource);
      const owed = hexes
        .map(({ h }) => ({
          h,
          n: geo.hexes[h]!.corners.reduce((acc, v) => {
            const b = buildings[v];
            return b && b.owner === player ? acc + (b.kind === 'city' ? 2 : 1) : acc;
          }, 0),
        }))
        .filter((x) => x.n > 0);
      if (owed.length === 0) {
        const from = hexes[0]?.h ?? layout.hexes.findIndex((t) => t.number === sum);
        if (from >= 0) out.push({ player, resource, hex: from, n: total });
        continue;
      }
      let left = total;
      for (const { h, n } of owed) {
        if (left <= 0) break;
        const take = Math.min(n, left);
        out.push({ player, resource, hex: h, n: take });
        left -= take;
      }
      // ganhou mais do que os terrenos explicam (não devia): o resto sai do último
      if (left > 0) out[out.length - 1]!.n += left;
    }
  }
  return out;
}

/** Terrenos que piscam numa rolagem: os que têm o número (`lit`) e o do Carcará, se tiver o número (`dark`: não rendeu). */
export interface RollHexes {
  lit: number[];
  dark: number | null;
}

/** Quais terrenos têm o número que saiu (`sum`), separando o do Carcará. Com 7 (ou sem tabuleiro), nenhum. */
export function rollHexes(sum: number, layout: BoardLayout | null, carcara: number): RollHexes {
  if (!layout || sum === 7) return { lit: [], dark: null };
  const all = layout.hexes.flatMap((t, h) => (t.number === sum ? [h] : []));
  return { lit: all.filter((h) => h !== carcara), dark: all.includes(carcara) ? carcara : null };
}

function rank(players: string[], p: string): number {
  const i = players.indexOf(p);
  return i < 0 ? players.length : i;
}

/** Ponto da curva de Bézier quadrática de `a` a `b`, com o meio levantado `lift` (fração da distância) pro alto. */
export function arcPoint(a: { x: number; y: number }, b: { x: number; y: number }, t: number, lift = 0.28): { x: number; y: number } {
  const dist = Math.hypot(b.x - a.x, b.y - a.y);
  const c = { x: (a.x + b.x) / 2, y: Math.min(a.y, b.y) - dist * lift };
  const u = 1 - t;
  return { x: u * u * a.x + 2 * u * t * c.x + t * t * b.x, y: u * u * a.y + 2 * u * t * c.y + t * t * b.y };
}

/** Animação do site ligada? Não com `prefers-reduced-motion` nem com a aba escondida (ali o navegador não anima). */
export function motionOk(): boolean {
  if (typeof document !== 'undefined' && document.hidden) return false;
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return true;
  return !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
