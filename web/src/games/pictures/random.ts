import { ICON_COUNT, type KitId, type Work, type WorkOf } from '@cartolina/shared';

/* Obra aleatória e válida de cada kit (bots e testes). Unidades = workSchema do shared. */

const r = (a: number, b: number) => a + Math.random() * (b - a);
const ri = (n: number) => Math.floor(Math.random() * n);
const r3 = (v: number) => Math.round(v * 1000) / 1000;
const r2 = (v: number) => Math.round(v * 100) / 100;
function shuffle<T>(xs: readonly T[]): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = ri(i + 1);
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}
/** Caminho ondulado dentro da folha (0–1), com n pontos. */
function wavy(n: number, cx: number, cy: number, span: number): [number, number][] {
  const pts: [number, number][] = [];
  let a = r(0, Math.PI * 2), x = cx, y = cy;
  for (let i = 0; i < n; i++) {
    pts.push([Math.min(0.98, Math.max(0.02, x)), Math.min(0.98, Math.max(0.02, y))]);
    a += r(-0.6, 0.6);
    x += (Math.cos(a) * span) / n;
    y += ((Math.sin(a) * span) / n) * 1.33;
  }
  return pts.map(([px, py]) => [r3(px), r3(py)]);
}

type BlockPiece = WorkOf<'blocks'>['pieces'][number];
/* Blocos, na ordem de BLOCK_SHAPES (medidas das geometrias de kits/blocks.ts): [largura x, fundo z, y em pé = metade da altura]. */
const BLOCK_FOOT: readonly (readonly [number, number, number])[] = [
  [1, 1, 0.5],
  [2, 1, 0.3],
  [3.2, 0.8, 0.125],
  [0.7, 0.7, 1.1],
  [2, 1, 0.5],
  [2, 0.8, 0.55],
];
const BLOCK_SLOTS = [-2.4, 0, 2.4].flatMap((x) => [-1.2, 1.2].map((z) => [x, z] as const));
const PAPER = 3.9; // o papel vai de -4 a 4
type Quad = [number, number][];
/** Cantos da base de cada peça (girada em volta do eixo vertical, como o three.js faz). */
function corners(p: BlockPiece, i: number): Quad {
  const [w, d] = BLOCK_FOOT[i]!, a = (p.rot * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  return (
    [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ] as const
  ).map(([u, v]) => {
    const lx = (u * w) / 2, lz = (v * d) / 2;
    return [p.x + lx * c + lz * s, p.z - lx * s + lz * c];
  });
}
/** Retângulos separados por pelo menos `gap` em algum eixo (teorema do eixo separador). */
function apart(A: Quad, B: Quad, gap: number): boolean {
  for (const R of [A, B])
    for (let k = 0; k < 2; k++) {
      const ex = R[k + 1]![0] - R[k]![0], ez = R[k + 1]![1] - R[k]![1], n = Math.hypot(ex, ez), ax = -ez / n, az = ex / n;
      const pr = (Q: Quad) => Q.map(([x, z]) => x * ax + z * az);
      const a = pr(A), b = pr(B);
      if (Math.min(...a) - Math.max(...b) >= gap || Math.min(...b) - Math.max(...a) >= gap) return true;
    }
  return false;
}
function blocksFit(ps: BlockPiece[]): boolean {
  const cs = ps.map(corners);
  if (cs.some((q) => q.some(([x, z]) => Math.abs(x) > PAPER || Math.abs(z) > PAPER))) return false;
  for (let i = 0; i < cs.length; i++) for (let j = i + 1; j < cs.length; j++) if (!apart(cs[i]!, cs[j]!, 0.1)) return false;
  return true;
}

const MAKERS: { [K in KitId]: () => WorkOf<K> } = {
  cubes() {
    const bag = shuffle([0, 1, 2, 3, 4, 5, 6, 7].flatMap((c) => [c, c, c]));
    return { kit: 'cubes', cells: bag.slice(0, 16) };
  },
  laces() {
    return { kit: 'laces', long: wavy(60, r(0.2, 0.8), r(0.2, 0.8), 1.4), short: wavy(30, r(0.2, 0.8), r(0.2, 0.8), 0.6) };
  },
  sticks() {
    const p = () => ({ x: r3(r(0.15, 0.85)), y: r3(r(0.15, 0.85)), rot: ri(12) * 15 });
    return { kit: 'sticks', sticks: [p(), p(), p(), p()], stones: [p(), p(), p(), p()] };
  },
  blocks() {
    // Cada peça em pé, apoiada no papel (y = metade da altura; quem mostra não reempilha), uma por casa
    // de uma grade 3×2 com um pouco de ruído. Sorteia de novo até ninguém se encostar nem sair do papel.
    const camera = { theta: r2(r(-1, 1)), phi: r2(r(0.3, 1.2)) };
    let pieces: BlockPiece[] | null = null;
    for (let t = 0; t < 200 && !pieces; t++) {
      const slots = shuffle(BLOCK_SLOTS);
      const ps = BLOCK_FOOT.map((f, i) => ({
        x: r2(slots[i]![0] + r(-0.3, 0.3)),
        y: f[2],
        z: r2(slots[i]![1] + r(-0.3, 0.3)),
        rot: ri(24) * 15,
        lay: false,
      }));
      if (blocksFit(ps)) pieces = ps;
    }
    // Reserva (praticamente nunca usada): todas alinhadas, prancha de comprido no sentido da fila.
    pieces ??= BLOCK_FOOT.map((f, i) => ({ x: BLOCK_SLOTS[i]![0], y: f[2], z: BLOCK_SLOTS[i]![1], rot: i === 2 ? 90 : 0, lay: false }));
    return { kit: 'blocks', pieces, camera };
  },
  icons() {
    return { kit: 'icons', ids: shuffle(Array.from({ length: ICON_COUNT }, (_, i) => i)).slice(0, 2 + ri(4)) };
  },
  dots() {
    const n = 3 + ri(3);
    const points = Array.from({ length: n }, () => [r3(r(0.1, 0.9)), r3(r(0.1, 0.9))] as [number, number]);
    const lines: [number, number][] = [];
    for (let i = 0; i < n - 1; i++) lines.push([i, i + 1]);
    if (n > 3 && Math.random() < 0.5) lines.push([0, n - 1]);
    return { kit: 'dots', points, lines };
  },
};

/** Obra aleatória, válida e não em branco do kit (passa em `workSchema`, `workError` e `readyError`). */
export function randomWork<K extends KitId>(kit: K): WorkOf<K>;
export function randomWork(kit: KitId): Work {
  return MAKERS[kit]();
}
