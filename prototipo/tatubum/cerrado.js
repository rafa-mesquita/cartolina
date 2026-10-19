'use strict';
/*
 * Fundo de noite no cerrado (aprovado em ref/fundo-cerrado.html), agora animado:
 * céu e terra são desenhados uma vez; estrelas piscando, nuvens andando e vaga-lumes são redesenhados ~12 vezes por
 * segundo. Canvas pequeno (288×180) ampliado sem suavizar pro palco de 1440×900.
 */
(function () {
  const W = 288, H = 180;
  const B = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]]; // Bayer 4×4

  function rngOf(seed) {
    let s = seed >>> 0;
    return () => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  function layer() {
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    return c;
  }

  function painter(g) {
    const px = (x, y, c) => { g.fillStyle = c; g.fillRect(x, y, 1, 1); };
    const band = (y0, y1, c1, c2) => {
      for (let y = y0; y < y1; y++) {
        const f = (y - y0) / (y1 - y0);
        for (let x = 0; x < W; x++) px(x, y, B[y % 4][x % 4] / 16 < f ? c2 : c1);
      }
    };
    return { px, band };
  }

  /** Céu em faixas com pontilhado + lua (fixos). */
  function drawSky(g) {
    const { px, band } = painter(g);
    band(0, 40, '#0f1030', '#17204a');
    band(40, 80, '#17204a', '#1f3a6b');
    band(80, 112, '#1f3a6b', '#2c5a8c');
    band(112, H, '#2c5a8c', '#2c5a8c');
    const mx = 232, my = 26;
    for (let y = -9; y <= 9; y++) {
      for (let x = -9; x <= 9; x++) {
        const d = x * x + y * y;
        if (d <= 81) px(mx + x, my + y, d > 64 ? '#e8d9a0' : (x + 3) * (x + 3) + (y - 2) * (y - 2) < 6 ? '#d9c88a' : '#fff1c2');
      }
    }
  }

  /** Árvores tortas, cupinzeiros, chão e capim (fixos, transparentes onde é céu). */
  function drawLand(g, R) {
    const { px, band } = painter(g);
    const tree = (x, base, h, col, cw) => {
      let tx = x;
      for (let y = 0; y < h; y++) {
        if (R() < 0.35) tx += R() < 0.5 ? -1 : 1;
        px(tx, base - y, col);
        if (y > h * 0.5 && R() < 0.25) {
          const d = R() < 0.5 ? -1 : 1;
          for (let k = 1; k < 4; k++) px(tx + d * k, base - y - k, col);
        }
      }
      const top = base - h;
      for (let r = 0; r < 4; r++) {
        const half = Math.round(cw / 2 - (r === 0 ? 2 : r === 3 ? 1 : 0) - R() * 2);
        for (let i = -half; i <= half; i++) if (R() < 0.92) px(tx + i, top - r + 1, col);
      }
    };
    const mound = (x, base, h, col) => {
      for (let y = 0; y < h; y++) {
        const half = Math.max(1, Math.round(((h - y) / h) * 5));
        for (let i = -half; i <= half; i++) px(x + i, base - y, col);
      }
    };
    const grass = (y0, col, n) => {
      for (let i = 0; i < n; i++) {
        const x = Math.floor(R() * W), h = 1 + Math.floor(R() * 4);
        for (let j = 0; j < h; j++) px(x + (j > 1 && R() < 0.5 ? 1 : 0), y0 - j, col);
      }
    };
    band(112, H, '#1a2f5a', '#1a2f5a');
    for (let x = 0; x < W; x++) {
      const hgt = Math.round(4 + Math.sin(x / 37) * 3 + Math.sin(x / 11) * 1.5);
      for (let y = 0; y < hgt; y++) px(x, 112 - y, '#1a2f5a');
    }
    for (let i = 0; i < 13; i++) tree(Math.floor(R() * W), 112, 10 + Math.floor(R() * 8), '#223a68', 12 + Math.floor(R() * 8));
    band(128, H, '#141f42', '#141f42');
    for (let x = 0; x < W; x++) {
      const hgt = Math.round(3 + Math.sin(x / 23 + 1) * 2);
      for (let y = 0; y < hgt; y++) px(x, 128 - y, '#141f42');
    }
    for (let i = 0; i < 8; i++) tree(Math.floor(R() * W), 130, 18 + Math.floor(R() * 12), '#0f1733', 16 + Math.floor(R() * 10));
    mound(36, 150, 14, '#0f1733');
    mound(244, 152, 10, '#0f1733');
    band(150, H, '#0b1028', '#090c1e');
    for (let x = 0; x < W; x++) if (R() < 0.5) px(x, 149, '#0b1028');
    grass(152, '#132048', 110);
    grass(170, '#0f1a3c', 80);
  }

  function cloudShape(R, w) {
    return Array.from({ length: w }, (_, i) => Math.round(3 + Math.sin((i / w) * Math.PI) * 4 + (R() < 0.3 ? 1 : 0)));
  }

  let timer = null;

  window.Cerrado = {
    /** Desenha e anima o cerrado em `canvas` (288×180). A mesma `seed` dá o mesmo cerrado. */
    start(canvas, seed = 7) {
      this.stop();
      canvas.width = W;
      canvas.height = H;
      const g = canvas.getContext('2d');
      const R = rngOf(seed);
      const sky = layer();
      drawSky(sky.getContext('2d'));
      const land = layer();
      drawLand(land.getContext('2d'), R);
      const stars = Array.from({ length: 64 }, () => ({
        x: Math.floor(R() * W), y: Math.floor(R() * 92), big: R() < 0.08, phase: R() * Math.PI * 2, speed: 0.5 + R() * 2,
      }));
      const clouds = [
        { x: 24, y: 30, s: cloudShape(R, 44), v: 0.6 },
        { x: 132, y: 22, s: cloudShape(R, 32), v: 0.4 },
        { x: 178, y: 58, s: cloudShape(R, 38), v: 0.8 },
        { x: 52, y: 70, s: cloudShape(R, 26), v: 0.5 },
      ];
      const flies = Array.from({ length: 14 }, () => ({
        x: R() * W, y: 118 + R() * 55, ax: R() * Math.PI * 2, ay: R() * Math.PI * 2, blink: R() * Math.PI * 2,
      }));
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const t0 = performance.now();
      const frame = () => {
        if (document.hidden) return;
        const t = reduced ? 0 : (performance.now() - t0) / 1000;
        g.drawImage(sky, 0, 0);
        for (const s of stars) {
          const on = Math.sin(t * s.speed + s.phase) > -0.6;
          g.fillStyle = on ? (s.big ? '#ffffff' : '#9fb8e8') : '#4a5f94';
          g.fillRect(s.x, s.y, 1, 1);
          if (s.big && on) {
            g.fillStyle = '#9fb8e8';
            g.fillRect(s.x - 1, s.y, 1, 1); g.fillRect(s.x + 1, s.y, 1, 1);
            g.fillRect(s.x, s.y - 1, 1, 1); g.fillRect(s.x, s.y + 1, 1, 1);
          }
        }
        const cols = ['#7fb2e6', '#5a8fd0', '#3f6fb0'];
        for (const c of clouds) {
          const span = W + c.s.length;
          const x0 = Math.floor(((c.x + t * c.v) % span) - c.s.length);
          c.s.forEach((h, i) => {
            for (let j = 0; j < h; j++) {
              g.fillStyle = j === 0 ? cols[2] : j < 2 ? cols[1] : cols[0];
              g.fillRect(x0 + i, c.y - j, 1, 1);
            }
          });
        }
        g.drawImage(land, 0, 0);
        for (const f of flies) {
          if (Math.sin(t * 2.2 + f.blink) < 0.1) continue;
          const x = Math.round(f.x + Math.sin(t * 0.6 + f.ax) * 10);
          const y = Math.round(f.y + Math.sin(t * 0.9 + f.ay) * 4);
          g.fillStyle = '#f6e27a';
          g.fillRect(x, y, 1, 1);
          g.fillStyle = '#bfae4a';
          g.fillRect(x + 1, y, 1, 1);
        }
      };
      frame();
      if (!reduced) timer = setInterval(frame, 83);
    },
    stop() {
      if (timer) clearInterval(timer);
      timer = null;
    },
  };
})();
