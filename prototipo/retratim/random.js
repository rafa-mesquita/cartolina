'use strict';
/* Obra aleatória e válida de cada kit (bots do protótipo). Unidades = workSchema do R1. */
(function () {
  const r = (a, b) => a + Math.random() * (b - a);
  const ri = (n) => Math.floor(Math.random() * n);
  const shuffle = (xs) => { const a = [...xs]; for (let i = a.length - 1; i > 0; i--) { const j = ri(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  /** Caminho ondulado dentro da folha (0–1), com n pontos. */
  function wavy(n, cx, cy, span) {
    const pts = []; let a = r(0, Math.PI * 2), x = cx, y = cy;
    for (let i = 0; i < n; i++) {
      pts.push([Math.min(.98, Math.max(.02, x)), Math.min(.98, Math.max(.02, y))]);
      a += r(-.6, .6); x += Math.cos(a) * span / n; y += Math.sin(a) * span / n * 1.33;
    }
    return pts.map(([px, py]) => [Math.round(px * 1000) / 1000, Math.round(py * 1000) / 1000]);
  }
  /* Blocos, na ordem de BLOCK_SHAPES (medidas das geometrias de kits/blocks.js): [largura x, fundo z, y em pé = metade da altura]. */
  const BLOCK_FOOT = [[1, 1, .5], [2, 1, .3], [3.2, .8, .125], [.7, .7, 1.1], [2, 1, .5], [2, .8, .55]];
  const BLOCK_SLOTS = [-2.4, 0, 2.4].flatMap((x) => [-1.2, 1.2].map((z) => [x, z]));
  const PAPER = 3.9; // o papel vai de -4 a 4
  /** Cantos da base de cada peça (girada em volta do eixo vertical, como o three.js faz). */
  function corners(p, i) {
    const [w, d] = BLOCK_FOOT[i], a = p.rot * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
    return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([u, v]) => {
      const lx = u * w / 2, lz = v * d / 2;
      return [p.x + lx * c + lz * s, p.z - lx * s + lz * c];
    });
  }
  /** Retângulos separados por pelo menos `gap` em algum eixo (teorema do eixo separador). */
  function apart(A, B, gap) {
    for (const R of [A, B]) for (let k = 0; k < 2; k++) {
      const ex = R[k + 1][0] - R[k][0], ez = R[k + 1][1] - R[k][1], n = Math.hypot(ex, ez), ax = -ez / n, az = ex / n;
      const pr = (Q) => Q.map(([x, z]) => x * ax + z * az);
      const a = pr(A), b = pr(B);
      if (Math.min(...a) - Math.max(...b) >= gap || Math.min(...b) - Math.max(...a) >= gap) return true;
    }
    return false;
  }
  function blocksFit(ps) {
    const cs = ps.map(corners);
    if (cs.some((q) => q.some(([x, z]) => Math.abs(x) > PAPER || Math.abs(z) > PAPER))) return false;
    for (let i = 0; i < cs.length; i++) for (let j = i + 1; j < cs.length; j++) if (!apart(cs[i], cs[j], .1)) return false;
    return true;
  }
  window.RandomWork = {
    cubes() {
      const bag = shuffle([0, 1, 2, 3, 4, 5, 6, 7].flatMap((c) => [c, c, c]));
      return { kit: 'cubes', cells: bag.slice(0, 16) };
    },
    laces() {
      return { kit: 'laces', long: wavy(60, r(.2, .8), r(.2, .8), 1.4), short: wavy(30, r(.2, .8), r(.2, .8), .6) };
    },
    sticks() {
      const p = () => ({ x: Math.round(r(.15, .85) * 1000) / 1000, y: Math.round(r(.15, .85) * 1000) / 1000, rot: ri(12) * 15 });
      return { kit: 'sticks', sticks: [p(), p(), p(), p()], stones: [p(), p(), p(), p()] };
    },
    blocks() {
      // Cada peça em pé, apoiada no papel (y = metade da altura; quem mostra não reempilha), uma por casa
      // de uma grade 3×2 com um pouco de ruído. Sorteia de novo até ninguém se encostar nem sair do papel.
      const cam = { theta: Math.round(r(-1, 1) * 100) / 100, phi: Math.round(r(.3, 1.2) * 100) / 100 };
      let pieces = null;
      for (let t = 0; t < 200 && !pieces; t++) {
        const slots = shuffle(BLOCK_SLOTS);
        const ps = BLOCK_FOOT.map((f, i) => ({
          x: Math.round((slots[i][0] + r(-.3, .3)) * 100) / 100, y: f[2],
          z: Math.round((slots[i][1] + r(-.3, .3)) * 100) / 100, rot: ri(24) * 15, lay: false,
        }));
        if (blocksFit(ps)) pieces = ps;
      }
      // Reserva (praticamente nunca usada): todas alinhadas, prancha de comprido no sentido da fila.
      if (!pieces) pieces = BLOCK_FOOT.map((f, i) => ({ x: BLOCK_SLOTS[i][0], y: f[2], z: BLOCK_SLOTS[i][1], rot: i === 2 ? 90 : 0, lay: false }));
      return { kit: 'blocks', pieces, camera: cam };
    },
    icons() {
      return { kit: 'icons', ids: shuffle(Array.from({ length: 19 }, (_, i) => i)).slice(0, 2 + ri(4)) };
    },
    dots() {
      const n = 3 + ri(3);
      const points = Array.from({ length: n }, () => [Math.round(r(.1, .9) * 1000) / 1000, Math.round(r(.1, .9) * 1000) / 1000]);
      const lines = []; for (let i = 0; i < n - 1; i++) lines.push([i, i + 1]);
      if (n > 3 && Math.random() < .5) lines.push([0, n - 1]);
      return { kit: 'dots', points, lines };
    },
  };
})();
