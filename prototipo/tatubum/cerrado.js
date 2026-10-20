'use strict';
/*
 * Fundo do cerrado (aprovado em ref/fundo-cerrado.html) com o ciclo do dia (pedido do Rafa): amanhece, fica dia,
 * entardece e anoitece, devagar. O desenho é feito UMA vez como máscara de camadas (céu, morros, árvores, chão,
 * capim); a cor de cada camada vem da paleta da hora, misturada entre as horas vizinhas. Sol e lua atravessam o
 * céu; estrelas e vaga-lumes só de noite. Canvas pequeno (largura variável × 180) ampliado sem suavizar.
 */
(function () {
  let W = 288;
  const H = 180;
  const B = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]]; // Bayer 4×4

  function rngOf(seed) {
    let s = seed >>> 0;
    return () => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  const rgb = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const hex = (c) => '#' + c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
  const mixRgb = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  /** Clareia (t > 0, em direção ao branco) ou escurece (t < 0) uma cor. */
  const shade = (h, t) => hex(mixRgb(rgb(h), t > 0 ? [255, 255, 255] : [0, 0, 0], Math.abs(t)));

  // Camadas da máscara (o céu é 0).
  const L = { SKY: 0, FAR: 1, FARTREE: 2, NEAR: 3, NEARTREE: 4, G1: 5, G2: 6, GRASS1: 7, GRASS2: 8 };

  /** Paletas das horas: céu em 4 tons (do alto até o horizonte), camadas do chão, nuvens, estrelas e vaga-lumes. */
  const HOURS = {
    night: { sky: ['#0f1030', '#17204a', '#1f3a6b', '#2c5a8c'], land: ['#1a2f5a', '#223a68', '#141f42', '#0f1733', '#0b1028', '#090c1e', '#132048', '#0f1a3c'], cloud: ['#7fb2e6', '#5a8fd0', '#3f6fb0'], stars: 1, flies: 1 },
    dawn: { sky: ['#2a2c66', '#6b4c8c', '#d77a8a', '#f6b67a'], land: ['#5a4a78', '#4a3a66', '#3a2c52', '#2c2142', '#2a1f3a', '#20182e', '#3d2c50', '#2f2242'], cloud: ['#ffd0b0', '#f3a3a0', '#c47a96'], stars: 0.25, flies: 0 },
    day: { sky: ['#4f9fe6', '#7fbcf0', '#b4dbf6', '#e6f1e2'], land: ['#8db37a', '#6f9a5a', '#7a9a4a', '#4f7a3a', '#c9a24a', '#b8913e', '#9a8a3a', '#86782e'], cloud: ['#ffffff', '#e6f0fa', '#c4d8ee'], stars: 0, flies: 0 },
    dusk: { sky: ['#2c2a6a', '#8a4a7a', '#f0845a', '#f8c35a'], land: ['#7a4a5a', '#5e3a4e', '#4a2e40', '#3a2234', '#3a2428', '#2c1a20', '#5a3434', '#4a2a2c'], cloud: ['#ffc28a', '#f08a6a', '#b45a6a'], stars: 0.15, flies: 0.4 },
  };
  /** O ciclo (fase de 0 a 1): noite → amanhecer → dia → entardecer → noite, com a noite e o dia durando mais. */
  const KEYS = [
    [0, 'night'], [0.1, 'night'], [0.22, 'dawn'], [0.34, 'day'], [0.62, 'day'], [0.74, 'dusk'], [0.86, 'night'], [1, 'night'],
  ];

  /** Paleta da fase `p`, misturando as duas horas vizinhas. */
  function paletteAt(p) {
    let i = 0;
    while (i < KEYS.length - 2 && p > KEYS[i + 1][0]) i++;
    const [p0, a] = KEYS[i];
    const [p1, b] = KEYS[i + 1];
    const t = p1 === p0 ? 0 : Math.min(1, Math.max(0, (p - p0) / (p1 - p0)));
    const A = HOURS[a], Bh = HOURS[b];
    const mix = (x, y) => mixRgb(rgb(x), rgb(y), t);
    return {
      sky: A.sky.map((c, k) => mix(c, Bh.sky[k])),
      land: A.land.map((c, k) => mix(c, Bh.land[k])),
      cloud: A.cloud.map((c, k) => hex(mix(c, Bh.cloud[k]))),
      stars: A.stars + (Bh.stars - A.stars) * t,
      flies: A.flies + (Bh.flies - A.flies) * t,
    };
  }

  /** A máscara de camadas do cerrado (largura W), desenhada uma vez por semente. */
  function buildMask(R) {
    const m = new Uint8Array(W * H);
    const set = (x, y, v) => { if (x >= 0 && x < W && y >= 0 && y < H) m[y * W + x] = v; };
    const fill = (y0, v) => { for (let y = y0; y < H; y++) for (let x = 0; x < W; x++) set(x, y, v); };
    const tree = (x, base, h, v, cw) => {
      let tx = x;
      for (let y = 0; y < h; y++) {
        if (R() < 0.35) tx += R() < 0.5 ? -1 : 1;
        set(tx, base - y, v);
        if (y > h * 0.5 && R() < 0.25) {
          const d = R() < 0.5 ? -1 : 1;
          for (let k = 1; k < 4; k++) set(tx + d * k, base - y - k, v);
        }
      }
      const top = base - h;
      for (let r = 0; r < 4; r++) {
        const half = Math.round(cw / 2 - (r === 0 ? 2 : r === 3 ? 1 : 0) - R() * 2);
        for (let i = -half; i <= half; i++) if (R() < 0.92) set(tx + i, top - r + 1, v);
      }
    };
    const mound = (x, base, h, v) => {
      for (let y = 0; y < h; y++) {
        const half = Math.max(1, Math.round(((h - y) / h) * 5));
        for (let i = -half; i <= half; i++) set(x + i, base - y, v);
      }
    };
    const grass = (y0, v, n) => {
      for (let i = 0; i < n; i++) {
        const x = Math.floor(R() * W), h = 1 + Math.floor(R() * 4);
        for (let j = 0; j < h; j++) set(x + (j > 1 && R() < 0.5 ? 1 : 0), y0 - j, v);
      }
    };
    fill(112, L.FAR);
    for (let x = 0; x < W; x++) {
      const hgt = Math.round(4 + Math.sin(x / 37) * 3 + Math.sin(x / 11) * 1.5);
      for (let y = 0; y < hgt; y++) set(x, 112 - y, L.FAR);
    }
    for (let i = 0; i < Math.round((13 * W) / 288); i++) tree(Math.floor(R() * W), 112, 10 + Math.floor(R() * 8), L.FARTREE, 12 + Math.floor(R() * 8));
    fill(128, L.NEAR);
    for (let x = 0; x < W; x++) {
      const hgt = Math.round(3 + Math.sin(x / 23 + 1) * 2);
      for (let y = 0; y < hgt; y++) set(x, 128 - y, L.NEAR);
    }
    for (let i = 0; i < Math.round((8 * W) / 288); i++) tree(Math.floor(R() * W), 130, 18 + Math.floor(R() * 12), L.NEARTREE, 16 + Math.floor(R() * 10));
    mound(36, 150, 14, L.NEARTREE);
    mound(W - 44, 152, 10, L.NEARTREE);
    // chão em duas cores com pontilhado (a escolha fica na máscara)
    for (let y = 150; y < H; y++) {
      const f = (y - 150) / (H - 150);
      for (let x = 0; x < W; x++) set(x, y, B[y % 4][x % 4] / 16 < f ? L.G2 : L.G1);
    }
    for (let x = 0; x < W; x++) if (R() < 0.5) set(x, 149, L.G1);
    grass(152, L.GRASS1, Math.round((110 * W) / 288));
    grass(170, L.GRASS2, Math.round((80 * W) / 288));
    return m;
  }

  /** Pinta o céu (com pontilhado entre os 4 tons) e as camadas do chão com a paleta `pal`. */
  function paint(skyCtx, landCtx, mask, pal) {
    const sky = skyCtx.createImageData(W, H);
    const land = landCtx.createImageData(W, H);
    const stops = [[0, 40], [40, 80], [80, 112]];
    for (let y = 0; y < H; y++) {
      let c1, c2, f;
      const s = stops.findIndex(([a, b]) => y >= a && y < b);
      if (s === -1) { c1 = c2 = pal.sky[3]; f = 0; }
      else { c1 = pal.sky[s]; c2 = pal.sky[s + 1]; f = (y - stops[s][0]) / (stops[s][1] - stops[s][0]); }
      for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4;
        const c = B[y % 4][x % 4] / 16 < f ? c2 : c1;
        sky.data[i] = c[0]; sky.data[i + 1] = c[1]; sky.data[i + 2] = c[2]; sky.data[i + 3] = 255;
        const layer = mask[y * W + x];
        if (layer) {
          const lc = pal.land[layer - 1];
          land.data[i] = lc[0]; land.data[i + 1] = lc[1]; land.data[i + 2] = lc[2]; land.data[i + 3] = 255;
        }
      }
    }
    skyCtx.putImageData(sky, 0, 0);
    landCtx.putImageData(land, 0, 0);
  }

  function cloudShape(R, w) {
    return Array.from({ length: w }, (_, i) => Math.round(3 + Math.sin((i / w) * Math.PI) * 4 + (R() < 0.3 ? 1 : 0)));
  }

  function disc(g, cx, cy, r, inner, outer) {
    for (let y = -r; y <= r; y++) {
      for (let x = -r; x <= r; x++) {
        const d = x * x + y * y;
        if (d <= r * r) { g.fillStyle = d > (r - 1) * (r - 1) ? outer : inner; g.fillRect(Math.round(cx + x), Math.round(cy + y), 1, 1); }
      }
    }
  }

  /**
   * Cenário de cerrado pra fundo de carta, na cor `base` (pedido do Rafa: cada carta com o fundo da cor dela):
   * céu clareando até a cor, sol, morros, árvores tortas e capim em tons da mesma cor. Devolve a URL (cw×ch).
   */
  function scene(cw, ch, seed, base) {
    const c = document.createElement('canvas');
    c.width = cw;
    c.height = ch;
    const g = c.getContext('2d');
    const R = rngOf(seed);
    const px = (x, y, col) => { g.fillStyle = col; g.fillRect(x, y, 1, 1); };
    const band = (y0, y1, c1, c2) => {
      for (let y = y0; y < y1; y++) {
        const f = (y - y0) / Math.max(1, y1 - y0);
        for (let x = 0; x < cw; x++) px(x, y, B[y % 4][x % 4] / 16 < f ? c2 : c1);
      }
    };
    const horizon = Math.round(ch * 0.58);
    band(0, Math.round(horizon * 0.45), shade(base, 0.72), shade(base, 0.45));
    band(Math.round(horizon * 0.45), horizon, shade(base, 0.45), shade(base, 0.15));
    disc(g, cw - 12, 11, 6, shade(base, 0.92), shade(base, 0.7));
    for (let x = 0; x < cw; x++) {
      const h = Math.round(4 + Math.sin(x / 9) * 2 + Math.sin(x / 4));
      for (let y = 0; y < h; y++) px(x, horizon - y, shade(base, -0.06));
    }
    const treeCol = shade(base, -0.35);
    for (let i = 0; i < Math.max(2, Math.round(cw / 14)); i++) {
      let tx = Math.floor(R() * cw);
      const h = 6 + Math.floor(R() * 6), w2 = 8 + Math.floor(R() * 6);
      for (let y = 0; y < h; y++) { if (R() < 0.35) tx += R() < 0.5 ? -1 : 1; px(tx, horizon - y, treeCol); }
      for (let r = 0; r < 3; r++) {
        const half = Math.round(w2 / 2 - (r === 0 ? 1 : 0) - R());
        for (let k = -half; k <= half; k++) if (R() < 0.9) px(tx + k, horizon - h - r + 1, treeCol);
      }
    }
    band(horizon + 1, ch, shade(base, -0.05), shade(base, -0.14));
    const grassCol = shade(base, -0.28);
    for (let i = 0; i < cw * 1.5; i++) {
      const x = Math.floor(R() * cw), y0 = horizon + 2 + Math.floor(R() * (ch - horizon - 2)), h = 1 + Math.floor(R() * 3);
      for (let j = 0; j < h; j++) px(x, y0 - j, grassCol);
    }
    return c.toDataURL();
  }

  let timer = null;
  let state = null;

  window.Cerrado = {
    scene,
    shade,
    /**
     * Desenha e anima o cerrado em `canvas`. A mesma `seed` dá o mesmo cerrado. `cycleSeconds` = duração de um dia
     * inteiro (amanhecer → noite); `phase` = de onde começa (0,22 ≈ amanhecendo).
     */
    start(canvas, seed = 7, width = 288, { cycleSeconds = 240, phase = 0.22 } = {}) {
      this.stop();
      W = width;
      canvas.width = W;
      canvas.height = H;
      const g = canvas.getContext('2d');
      const R = rngOf(seed);
      const mask = buildMask(R);
      const mk = () => { const c = document.createElement('canvas'); c.width = W; c.height = H; return c; };
      const skyC = mk(), landC = mk();
      const skyCtx = skyC.getContext('2d'), landCtx = landC.getContext('2d');
      const stars = Array.from({ length: Math.round((64 * W) / 288) }, () => ({
        x: Math.floor(R() * W), y: Math.floor(R() * 92), big: R() < 0.08, phase: R() * Math.PI * 2, speed: 0.5 + R() * 2, cut: R(),
      }));
      const clouds = [
        { x: 24, y: 30, s: cloudShape(R, 44), v: 0.6 },
        { x: 132, y: 22, s: cloudShape(R, 32), v: 0.4 },
        { x: 178, y: 58, s: cloudShape(R, 38), v: 0.8 },
        { x: 52, y: 70, s: cloudShape(R, 26), v: 0.5 },
      ];
      const flies = Array.from({ length: Math.round((14 * W) / 288) }, () => ({
        x: R() * W, y: 118 + R() * 55, ax: R() * Math.PI * 2, ay: R() * Math.PI * 2, blink: R() * Math.PI * 2, cut: R(),
      }));
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const t0 = performance.now();
      state = { phase, cycleSeconds, fixed: null };
      let pal = null;
      let lastPaint = -1;
      const frame = () => {
        if (document.hidden) return;
        const t = reduced ? 0 : (performance.now() - t0) / 1000;
        const p = state.fixed ?? (reduced ? state.phase : (state.phase + t / state.cycleSeconds) % 1);
        // Repinta as camadas só quando a hora andou um pouco (a mistura de cores é lenta).
        if (lastPaint < 0 || Math.abs(p - lastPaint) > 0.002) {
          pal = paletteAt(p);
          paint(skyCtx, landCtx, mask, pal);
          lastPaint = p;
        }
        g.drawImage(skyC, 0, 0);
        if (pal.stars > 0.02) {
          for (const s of stars) {
            if (s.cut > pal.stars) continue;
            const on = Math.sin(t * s.speed + s.phase) > -0.6;
            g.fillStyle = on ? (s.big ? '#ffffff' : '#9fb8e8') : '#4a5f94';
            g.fillRect(s.x, s.y, 1, 1);
            if (s.big && on) {
              g.fillStyle = '#9fb8e8';
              g.fillRect(s.x - 1, s.y, 1, 1); g.fillRect(s.x + 1, s.y, 1, 1);
              g.fillRect(s.x, s.y - 1, 1, 1); g.fillRect(s.x, s.y + 1, 1, 1);
            }
          }
        }
        // Sol de dia (do amanhecer ao entardecer) e lua de noite, num arco pelo céu, nascendo e se pondo atrás dos morros.
        const arc = (u) => ({ x: 14 + u * (W - 28), y: 112 - Math.sin(u * Math.PI) * 96 });
        const sunU = (p - 0.18) / 0.62;
        if (sunU > 0 && sunU < 1) { const s = arc(sunU); disc(g, s.x, s.y, 9, '#fff6c8', '#ffd76a'); }
        const moonU = ((p + 0.22) % 1) / 0.42;
        if (moonU > 0 && moonU < 1) { const m = arc(moonU); disc(g, m.x, m.y, 8, '#fff1c2', '#e8d9a0'); }
        for (const c of clouds) {
          const span = W + c.s.length;
          const x0 = Math.floor(((c.x + t * c.v) % span) - c.s.length);
          c.s.forEach((h, i) => {
            for (let j = 0; j < h; j++) {
              g.fillStyle = j === 0 ? pal.cloud[2] : j < 2 ? pal.cloud[1] : pal.cloud[0];
              g.fillRect(x0 + i, c.y - j, 1, 1);
            }
          });
        }
        g.drawImage(landC, 0, 0);
        if (pal.flies > 0.05) {
          for (const f of flies) {
            if (f.cut > pal.flies || Math.sin(t * 2.2 + f.blink) < 0.1) continue;
            const x = Math.round(f.x + Math.sin(t * 0.6 + f.ax) * 10);
            const y = Math.round(f.y + Math.sin(t * 0.9 + f.ay) * 4);
            g.fillStyle = '#f6e27a';
            g.fillRect(x, y, 1, 1);
            g.fillStyle = '#bfae4a';
            g.fillRect(x + 1, y, 1, 1);
          }
        }
      };
      frame();
      if (!reduced) timer = setInterval(frame, 83);
    },
    /** Fixa a hora (0 = meia-noite, 0,22 amanhecer, 0,5 meio-dia, 0,74 entardecer); `null` volta a andar sozinha. */
    setPhase(p) {
      if (state) state.fixed = p;
    },
    stop() {
      if (timer) clearInterval(timer);
      timer = null;
    },
  };
})();
