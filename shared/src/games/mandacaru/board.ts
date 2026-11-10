/**
 * Geometria fixa do tabuleiro (não depende do sorteio). Hexágonos em pé, coordenadas axiais (q, r),
 * unidade = raio do hexágono. Cantos de cada terreno no sentido horário a partir do de cima.
 */
export interface GeoHex {
  q: number;
  r: number;
  x: number;
  y: number;
  /** 6 cantos (ids), no sentido horário a partir do de cima. */
  corners: number[];
  /** 6 lados: lado i liga corners[i] e corners[(i+1)%6]. */
  edges: number[];
  /** Terrenos vizinhos. */
  neighbors: number[];
}

export interface GeoVertex {
  x: number;
  y: number;
  hexes: number[];
  edges: number[];
  /** Cantos a um lado de distância. */
  neighbors: number[];
}

export interface GeoEdge {
  a: number;
  b: number;
  hexes: number[];
}

export interface GeoPort {
  edge: number;
  vertices: [number, number];
  /** O terreno da costa encostado na feira. */
  hex: number;
}

export interface Geometry {
  radius: number;
  hexes: GeoHex[];
  vertices: GeoVertex[];
  edges: GeoEdge[];
  /** Lados da costa (um terreno só), em volta da ilha, ordenados pelo ângulo do meio do lado. */
  coast: number[];
  ports: GeoPort[];
}

const SQ3 = Math.sqrt(3);
const DIRS: [number, number][] = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
/** Posições das 9 feiras na costa de 30 lados (raio 2); nenhuma divide canto com outra. */
const PORT_SLOTS_R2 = [0, 3, 7, 10, 13, 17, 20, 23, 27];

function build(radius: number): Geometry {
  const coords: [number, number][] = [];
  for (let q = -radius; q <= radius; q++) {
    for (let r = -radius; r <= radius; r++) {
      if (Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r)) <= radius) coords.push([q, r]);
    }
  }
  const index = new Map(coords.map(([q, r], i) => [`${q},${r}`, i]));
  const vertices: GeoVertex[] = [];
  const vkey = new Map<string, number>();
  const edges: GeoEdge[] = [];
  const ekey = new Map<string, number>();

  const hexes: GeoHex[] = coords.map(([q, r], h) => {
    const x = SQ3 * (q + r / 2);
    const y = 1.5 * r;
    const corners: number[] = [];
    for (let i = 0; i < 6; i++) {
      const ang = (Math.PI / 180) * (60 * i - 90);
      const vx = x + Math.cos(ang);
      const vy = y + Math.sin(ang);
      const k = `${Math.round(vx * 1000)},${Math.round(vy * 1000)}`;
      let v = vkey.get(k);
      if (v === undefined) {
        v = vertices.length;
        vkey.set(k, v);
        vertices.push({ x: vx, y: vy, hexes: [], edges: [], neighbors: [] });
      }
      vertices[v]!.hexes.push(h);
      corners.push(v);
    }
    const hexEdges: number[] = [];
    for (let i = 0; i < 6; i++) {
      const a = corners[i]!;
      const b = corners[(i + 1) % 6]!;
      const k = a < b ? `${a}-${b}` : `${b}-${a}`;
      let e = ekey.get(k);
      if (e === undefined) {
        e = edges.length;
        ekey.set(k, e);
        edges.push({ a: Math.min(a, b), b: Math.max(a, b), hexes: [] });
        vertices[a]!.edges.push(e);
        vertices[b]!.edges.push(e);
        vertices[a]!.neighbors.push(b);
        vertices[b]!.neighbors.push(a);
      }
      edges[e]!.hexes.push(h);
      hexEdges.push(e);
    }
    const neighbors = DIRS.map(([dq, dr]) => index.get(`${q + dq},${r + dr}`)).filter((n): n is number => n !== undefined);
    return { q, r, x, y, corners, edges: hexEdges, neighbors };
  });

  const mid = (e: GeoEdge) => ({ x: (vertices[e.a]!.x + vertices[e.b]!.x) / 2, y: (vertices[e.a]!.y + vertices[e.b]!.y) / 2 });
  const coast = edges
    .map((e, i) => ({ e, i }))
    .filter(({ e }) => e.hexes.length === 1)
    .map(({ e, i }) => ({ i, ang: Math.atan2(mid(e).y, mid(e).x) }))
    .sort((a, b) => a.ang - b.ang)
    .map(({ i }) => i);

  const slots = radius === 2 ? PORT_SLOTS_R2 : [];
  const ports: GeoPort[] = slots.map((s) => {
    const edge = coast[s]!;
    const e = edges[edge]!;
    return { edge, vertices: [e.a, e.b], hex: e.hexes[0]! };
  });

  return { radius, hexes, vertices, edges, coast, ports };
}

let cached: Geometry | null = null;

/** A geometria do tabuleiro de 19 (calculada uma vez). */
export function geometry(): Geometry {
  cached ??= build(2);
  return cached;
}

/** Chance de um número sair em 36 (2 e 12 = 1, 6 e 8 = 5; 7 ou null = 0). */
export function pips(n: number | null): number {
  return n === null || n === 7 ? 0 : 6 - Math.abs(7 - n);
}
