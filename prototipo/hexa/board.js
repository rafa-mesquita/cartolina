// Protótipo: geometria e sorteio do tabuleiro de 19 hexágonos (sem regras de jogo ainda).
// Hexágonos "em pé" (pointy-top), coordenadas axiais (q, r).

const SQ3 = Math.sqrt(3);
const DIRS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];

function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle(arr, rand) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const dist = (q, r) => Math.max(Math.abs(q), Math.abs(r), Math.abs(-q - r));

function center(q, r, R) {
  return { x: R * SQ3 * (q + r / 2), y: R * 1.5 * r };
}

function corners(cx, cy, R) {
  const pts = [];
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 180) * (60 * i - 30);
    pts.push({ x: cx + R * Math.cos(a), y: cy + R * Math.sin(a) });
  }
  return pts;
}

const TERRAINS = [
  ...Array(4).fill('mata'),
  ...Array(4).fill('pasto'),
  ...Array(4).fill('roca'),
  ...Array(3).fill('barreiro'),
  ...Array(3).fill('serra'),
  'deserto',
];
const NUMBERS = [2, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11, 12];
const PORTS = ['3:1', '3:1', '3:1', '3:1', 'madeira', 'barro', 'pasto', 'roca', 'pedra'];
const PLAYERS = ['Rafa', 'Bia', 'Duda', 'Léo'];

function ring(radius) {
  // Caminha o anel no sentido horário a partir de (radius, -radius)... ordem estável pros portos.
  const out = [];
  let q = DIRS[4][0] * radius;
  let r = DIRS[4][1] * radius;
  for (let side = 0; side < 6; side++) {
    for (let step = 0; step < radius; step++) {
      out.push([q, r]);
      q += DIRS[side][0];
      r += DIRS[side][1];
    }
  }
  return out;
}

function makeBoard(seed, R) {
  const rand = rng(seed);
  const land = [];
  for (let q = -2; q <= 2; q++) for (let r = -2; r <= 2; r++) if (dist(q, r) <= 2) land.push([q, r]);

  const terrains = shuffle(TERRAINS, rand);
  const hexes = land.map(([q, r], i) => {
    const c = center(q, r, R);
    return { q, r, ...c, terrain: terrains[i], number: null, pts: corners(c.x, c.y, R) };
  });

  // Números: refaz até 6 e 8 não ficarem vizinhos.
  const key = (q, r) => `${q},${r}`;
  const byKey = new Map(hexes.map((h) => [key(h.q, h.r), h]));
  for (let tries = 0; tries < 500; tries++) {
    const nums = shuffle(NUMBERS, rand);
    let k = 0;
    for (const h of hexes) h.number = h.terrain === 'deserto' ? null : nums[k++];
    const hot = (h) => h.number === 6 || h.number === 8;
    const bad = hexes.some((h) => hot(h) && DIRS.some(([dq, dr]) => {
      const n = byKey.get(key(h.q + dq, h.r + dr));
      return n && hot(n);
    }));
    if (!bad) break;
  }

  // Mar: anel 3. Portos em 9 das 18 casas (uma sim, uma não), tipos sorteados.
  const portTypes = shuffle(PORTS, rand);
  let p = 0;
  const ocean = ring(3).map(([q, r], i) => {
    const c = center(q, r, R);
    const pts = corners(c.x, c.y, R);
    let port = null;
    if (i % 2 === 0) {
      const landN = DIRS.map(([dq, dr]) => byKey.get(key(q + dq, r + dr))).find(Boolean);
      const near = pts
        .map((pt) => ({ pt, d: Math.hypot(pt.x - landN.x, pt.y - landN.y) }))
        .sort((a, b) => a.d - b.d)
        .slice(0, 2)
        .map((o) => o.pt);
      const bx = c.x + (landN.x - c.x) * 0.18;
      const by = c.y + (landN.y - c.y) * 0.18;
      port = { type: portTypes[p++], a: near[0], b: near[1], x: bx, y: by };
    }
    return { q, r, ...c, pts, port };
  });

  // Cantos (onde ficam aldeias) e lados (estradas), só da terra.
  const vmap = new Map();
  const vkey = (pt) => `${Math.round(pt.x)},${Math.round(pt.y)}`;
  for (const h of hexes) for (const pt of h.pts) if (!vmap.has(vkey(pt))) vmap.set(vkey(pt), { ...pt, n: [] });
  const verts = [...vmap.values()];
  for (const v of verts) {
    for (const w of verts) if (v !== w && Math.abs(Math.hypot(v.x - w.x, v.y - w.y) - R) < 2) v.n.push(w);
  }

  // Peças de exemplo: 2 aldeias + estradas por jogador, respeitando a distância.
  const taken = new Set();
  const pieces = [];
  const roads = [];
  const free = (v) => !taken.has(v) && v.n.every((w) => !taken.has(w));
  const pool = shuffle(verts.filter((v) => v.n.length === 3), rand);
  PLAYERS.forEach((_, pi) => {
    for (let k = 0; k < 2; k++) {
      const v = pool.find(free);
      if (!v) continue;
      taken.add(v);
      const city = (pi === 0 && k === 0) || (pi === 2 && k === 1);
      pieces.push({ x: v.x, y: v.y, player: pi, city });
      let cur = v;
      const len = pi === 1 && k === 0 ? 3 : 1;
      for (let s = 0; s < len; s++) {
        const nxt = cur.n.find((w) => !roads.some((rd) => (rd.a === cur && rd.b === w) || (rd.a === w && rd.b === cur)));
        if (!nxt) break;
        roads.push({ a: cur, b: nxt, player: pi });
        cur = nxt;
      }
    }
  });

  const robber = hexes.find((h) => h.terrain === 'deserto');
  return { hexes, ocean, verts, pieces, roads, robber, players: PLAYERS };
}

window.Hexa = { makeBoard, rng };
