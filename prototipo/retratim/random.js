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
      return {
        kit: 'blocks',
        pieces: Array.from({ length: 6 }, () => ({ x: Math.round(r(-3, 3) * 100) / 100, y: 0, z: Math.round(r(-3, 3) * 100) / 100, rot: ri(24) * 15, lay: Math.random() < .3 })),
        camera: { theta: Math.round(r(-1, 1) * 100) / 100, phi: Math.round(r(.3, 1.2) * 100) / 100 },
      };
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
