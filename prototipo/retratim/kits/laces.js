'use strict';
/* Kit "cadarços": duas cordas (uma longa, uma curta) pra dobrar em cima da folha.
   Obra = {kit:'laces', long:[x,y][], short:[x,y][]}: cada corda reamostrada em até 60 pontos, x e y em 0–1 da folha 4:3.
   Física = a da referência aprovada (ref/corda.html, v3): o ponto pego arrasta um trecho em volta (janela com queda
   suave, K pontos de cada lado); o resto só vem quando a corda estica (pull só puxa); um relaxamento com mínimo de
   0,85·L evita embolar; clamp na folha. */
(function () {
  const NS = 'http://www.w3.org/2000/svg';
  const W = 600, H = 450; // folha em unidades lógicas (4:3); o canvas escala junto com a folha
  const K = 9, GRAB = 26, EDGE = 7, EMIT_MS = 300;
  /** len = comprimento total em larguras da folha; n = pontos internos; out = pontos na obra; cx, cy = centro do novelo inicial (lado a lado, sem se encostar). */
  const ROPES = [
    { id: 'long', len: 1.6, n: 160, out: 60, cx: .345, cy: .46, main: '#D85A30', dark: '#712B13', light: '#F0997B' },
    { id: 'short', len: 0.7, n: 70, out: 30, cx: .84, cy: .56, main: '#1D9E75', dark: '#085041', light: '#9FE1CB' },
  ];
  const METAL = '#5F5E5A';

  const CSS = `
.kl{position:absolute;inset:0;container-type:size;font-family:var(--ui)}
.kl canvas{position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none}
.kl-st{position:absolute;left:3cqw;right:27cqw;bottom:2.4cqw;pointer-events:none;font:500 2cqw/1.35 var(--ui);color:var(--ink-soft)}
.kl-again{position:absolute;right:2.4cqw;bottom:2.4cqw;padding:.9cqw 2.2cqw;border-radius:999px;border:1px solid var(--edge);background:var(--paper);
  font:700 2.2cqw/1 var(--ui);color:var(--ink-soft);box-shadow:0 1px 2px rgba(59,47,47,.2)}
.kl-again:hover{color:var(--blue);border-color:var(--blue)}
.kl-show{position:absolute;inset:0;width:100%;height:100%;display:block}`;
  function injectCSS() {
    if (document.getElementById('kit-laces-css')) return;
    const s = document.createElement('style'); s.id = 'kit-laces-css'; s.textContent = CSS; document.head.appendChild(s);
  }
  const okPoint = (p) => Array.isArray(p) && p.length === 2 && p.every((v) => typeof v === 'number' && v >= 0 && v <= 1);

  /** Reamostra uma corda (pontos em px) pra `n` pontos igualmente espaçados ao longo dela, em 0–1 da folha. */
  function resample(P, n, W, H) {
    const acc = [0];
    for (let i = 1; i < P.length; i++) acc.push(acc[i - 1] + Math.hypot(P[i].x - P[i - 1].x, P[i].y - P[i - 1].y));
    const total = acc[acc.length - 1], out = [];
    for (let k = 0; k < n; k++) {
      const d = total * k / (n - 1);
      let i = 1; while (i < acc.length - 1 && acc[i] < d) i++;
      const t = (d - acc[i - 1]) / ((acc[i] - acc[i - 1]) || 1);
      const x = P[i - 1].x + (P[i].x - P[i - 1].x) * t, y = P[i - 1].y + (P[i].y - P[i - 1].y) * t;
      out.push([Math.round(Math.min(1, Math.max(0, x / W)) * 1000) / 1000, Math.round(Math.min(1, Math.max(0, y / H)) * 1000) / 1000]);
    }
    return out;
  }
  /** O contrário do resample: polilinha da obra (0–1) → `n` pontos em px igualmente espaçados ao longo dela. */
  function spread(Q, n) {
    const P = Q.map(([x, y]) => ({ x: x * W, y: y * H }));
    const acc = [0];
    for (let i = 1; i < P.length; i++) acc.push(acc[i - 1] + Math.hypot(P[i].x - P[i - 1].x, P[i].y - P[i - 1].y));
    const total = acc[acc.length - 1], out = [];
    for (let k = 0; k < n; k++) {
      const d = total * k / (n - 1);
      let i = 1; while (i < acc.length - 1 && acc[i] < d) i++;
      const t = (d - acc[i - 1]) / ((acc[i] - acc[i - 1]) || 1);
      out.push({ x: P[i - 1].x + (P[i].x - P[i - 1].x) * t, y: P[i - 1].y + (P[i].y - P[i - 1].y) * t });
    }
    return out;
  }

  /* ---------- física (igual à ref/corda.html, por corda) ---------- */
  function clampRope(r) { r.P.forEach((p) => { p.x = Math.min(W - EDGE, Math.max(EDGE, p.x)); p.y = Math.min(H - EDGE, Math.max(EDGE, p.y)); }); }
  function relax(r, pin, it) {
    const { P, N, L } = r, m = L * .85;
    for (let k = 0; k < it; k++) for (let j = 0; j < N - 1; j++) {
      const a = P[j], b = P[j + 1], dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || .001;
      let c = 0; if (d < m) c = m - d; else if (d > L) c = L - d; else continue;
      const ux = dx / d * c, uy = dy / d * c;
      let wa = .5, wb = .5; if (j === pin) { wa = 0; wb = 1; } if (j + 1 === pin) { wa = 1; wb = 0; }
      a.x -= ux * wa; a.y -= uy * wa; b.x += ux * wb; b.y += uy * wb;
    }
  }
  function pull(r, i) {
    const { P, N, L } = r;
    for (let j = i + 1; j < N; j++) { const a = P[j - 1], b = P[j], dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy); if (d > L) { b.x = a.x + dx / d * L; b.y = a.y + dy / d * L; } }
    for (let j = i - 1; j >= 0; j--) { const a = P[j + 1], b = P[j], dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy); if (d > L) { b.x = a.x + dx / d * L; b.y = a.y + dy / d * L; } }
  }
  /** Novelo inicial (o `init` da referência), centrado em (cx·W, cy·H). */
  function tangle(r) {
    const { N, L } = r, P = [];
    let x = W * .1, y = H * .3, a = 0;
    for (let i = 0; i < N; i++) { P.push({ x, y }); a = 1.25 * Math.sin(i / N * Math.PI * 4.2); x += L * Math.cos(a) * .62; y += L * Math.sin(a) * .9 + L * .12; }
    let mx = 0, my = 0; P.forEach((p) => { mx += p.x; my += p.y; });
    mx = r.spec.cx * W - mx / N; my = r.spec.cy * H - my / N;
    P.forEach((p) => { p.x += mx; p.y += my; });
    r.P = P; relax(r, -1, 6); clampRope(r);
  }
  function makeRope(spec, pts) {
    const r = { spec, N: spec.n, L: spec.len * W / spec.n, P: null };
    if (Array.isArray(pts) && pts.length >= 2 && pts.every(okPoint)) {
      r.P = spread(pts, r.N);
      // obra que veio de outro lugar (ex.: maior que a corda): o relaxamento traz os trechos de volta pro comprimento
      let over = false; for (let j = 0; j < r.N - 1; j++) if (Math.hypot(r.P[j + 1].x - r.P[j].x, r.P[j + 1].y - r.P[j].y) > r.L * 1.001) { over = true; break; }
      if (over) relax(r, -1, 6);
      clampRope(r);
    } else tangle(r);
    return r;
  }

  /* ---------- desenho (montagem no canvas; mostra em SVG, com a mesma aparência) ---------- */
  function tracePath(cx, P) {
    const N = P.length;
    cx.beginPath(); cx.moveTo(P[0].x, P[0].y);
    for (let i = 1; i < N - 1; i++) cx.quadraticCurveTo(P[i].x, P[i].y, (P[i].x + P[i + 1].x) / 2, (P[i].y + P[i + 1].y) / 2);
    cx.lineTo(P[N - 1].x, P[N - 1].y);
  }
  function tip(cx, a, b) {
    const dx = a.x - b.x, dy = a.y - b.y, d = Math.hypot(dx, dy) || 1;
    cx.beginPath(); cx.moveTo(a.x, a.y); cx.lineTo(a.x + dx / d * 12, a.y + dy / d * 12);
    cx.lineWidth = 6; cx.strokeStyle = METAL; cx.lineCap = 'butt'; cx.stroke();
  }
  function drawRope(cx, r) {
    const P = r.P, N = P.length, s = r.spec;
    cx.lineCap = 'round'; cx.lineJoin = 'round';
    tracePath(cx, P); cx.lineWidth = 9; cx.strokeStyle = s.dark; cx.stroke();
    tracePath(cx, P); cx.lineWidth = 6; cx.strokeStyle = s.main; cx.stroke();
    tracePath(cx, P); cx.setLineDash([2, 5]); cx.lineWidth = 2; cx.strokeStyle = s.light; cx.stroke(); cx.setLineDash([]);
    tip(cx, P[0], P[1]); tip(cx, P[N - 1], P[N - 2]);
  }
  function svgPath(P) {
    const f = (v) => Math.round(v * 10) / 10, N = P.length;
    let d = `M${f(P[0].x)} ${f(P[0].y)}`;
    for (let i = 1; i < N - 1; i++) d += `Q${f(P[i].x)} ${f(P[i].y)} ${f((P[i].x + P[i + 1].x) / 2)} ${f((P[i].y + P[i + 1].y) / 2)}`;
    return d + `L${f(P[N - 1].x)} ${f(P[N - 1].y)}`;
  }
  function svgTip(a, b) {
    const dx = a.x - b.x, dy = a.y - b.y, d = Math.hypot(dx, dy) || 1;
    return `<line x1="${a.x}" y1="${a.y}" x2="${a.x + dx / d * 12}" y2="${a.y + dy / d * 12}" stroke="${METAL}" stroke-width="6"/>`;
  }

  function build(el, work, onChange) {
    injectCSS();
    const ok = work && work.kit === 'laces';
    const ropes = ROPES.map((s) => makeRope(s, ok ? work[s.id] : null));
    let order = [0, 1]; // ordem de desenho (a última fica por cima)
    let drag = null, hov = null, lastEmit = 0;

    el.innerHTML = `<div class="kl"><canvas></canvas><div class="kl-st">arraste qualquer ponto da corda: o trecho em volta vem junto, o resto só segue quando ela estica</div>`
      + `<button class="kl-again">embolar de novo</button></div>`;
    const cv = el.querySelector('canvas'), again = el.querySelector('.kl-again'), cx = cv.getContext('2d');
    // resolução do canvas pelo tamanho na tela (no arraste do divisor ele só escala; ao soltar a bancada é recriada)
    const px = Math.min(3, Math.max(2, Math.ceil((el.getBoundingClientRect().width || W) * (window.devicePixelRatio || 1) / W)));
    cv.width = W * px; cv.height = H * px; cx.setTransform(px, 0, 0, px, 0, 0);

    const toWork = () => ({ kit: 'laces', long: resample(ropes[0].P, ROPES[0].out, W, H), short: resample(ropes[1].P, ROPES[1].out, W, H) });
    const emit = () => { lastEmit = performance.now(); onChange(toWork()); };

    function draw() {
      cx.clearRect(0, 0, W, H);
      for (const k of order) drawRope(cx, ropes[k]);
      const h = drag || hov;
      if (h) {
        const P = ropes[h.r].P, N = P.length, a = Math.max(0, h.i - K), b = Math.min(N - 1, h.i + K);
        cx.beginPath(); cx.moveTo(P[a].x, P[a].y); for (let j = a + 1; j <= b; j++) cx.lineTo(P[j].x, P[j].y);
        cx.lineWidth = 14; cx.lineCap = 'round'; cx.strokeStyle = drag ? 'rgba(55,138,221,.28)' : 'rgba(55,138,221,.16)'; cx.stroke();
      }
      cv.style.cursor = drag ? 'grabbing' : hov ? 'grab' : 'default';
    }
    /** Ponteiro em unidades lógicas da folha. */
    function pos(e) {
      const rc = cv.getBoundingClientRect();
      return [(e.clientX - rc.left) * W / rc.width, (e.clientY - rc.top) * H / rc.height];
    }
    /** Ponto mais perto entre as duas cordas (raio de 26 px na folha), a de cima ganha no empate. */
    function near(x, y) {
      let best = null, bd = GRAB * W / (el.clientWidth || W);
      for (const k of [...order].reverse()) ropes[k].P.forEach((p, i) => { const d = Math.hypot(p.x - x, p.y - y); if (d < bd) { bd = d; best = { r: k, i }; } });
      return best;
    }
    function onDown(e) {
      if (e.button !== undefined && e.button !== 0) return;
      const [x, y] = pos(e), h = near(x, y);
      if (!h) return;
      e.preventDefault();
      drag = { ...h, pid: e.pointerId, moved: false };
      order = order.filter((k) => k !== h.r).concat(h.r);
      cv.setPointerCapture(e.pointerId); draw();
    }
    function onMove(e) {
      const [x, y] = pos(e);
      if (!drag) {
        const h = near(x, y), same = h && hov ? h.r === hov.r && h.i === hov.i : h === hov;
        if (!same) { hov = h; draw(); }
        return;
      }
      if (e.pointerId !== drag.pid) return;
      const r = ropes[drag.r], P = r.P, N = r.N, i = drag.i;
      const tx = Math.min(W - EDGE, Math.max(EDGE, x)), ty = Math.min(H - EDGE, Math.max(EDGE, y)), dx = tx - P[i].x, dy = ty - P[i].y;
      for (let j = Math.max(0, i - K); j <= Math.min(N - 1, i + K); j++) {
        const w = .5 * (1 + Math.cos(Math.PI * Math.abs(j - i) / (K + 1)));
        P[j].x += dx * w; P[j].y += dy * w;
      }
      P[i].x = tx; P[i].y = ty; pull(r, i); relax(r, i, 3); P[i].x = tx; P[i].y = ty; clampRope(r);
      drag.moved = true; draw();
      if (performance.now() - lastEmit >= EMIT_MS) emit();
    }
    function onUp(e) {
      if (!drag || e.pointerId !== drag.pid) return;
      const moved = drag.moved; drag = null; draw();
      if (moved) emit();
    }
    function onLeave() { if (!drag && hov) { hov = null; draw(); } }
    function onAgain() { ropes.forEach(tangle); order = [0, 1]; hov = null; draw(); emit(); }
    function stop(e) { e.stopPropagation(); }

    cv.addEventListener('pointerdown', onDown);
    cv.addEventListener('pointermove', onMove);
    cv.addEventListener('pointerup', onUp);
    cv.addEventListener('pointercancel', onUp);
    cv.addEventListener('pointerleave', onLeave);
    again.addEventListener('click', onAgain);
    again.addEventListener('pointerdown', stop);
    draw();
    return {
      destroy() {
        cv.removeEventListener('pointerdown', onDown);
        cv.removeEventListener('pointermove', onMove);
        cv.removeEventListener('pointerup', onUp);
        cv.removeEventListener('pointercancel', onUp);
        cv.removeEventListener('pointerleave', onLeave);
        again.removeEventListener('click', onAgain);
        again.removeEventListener('pointerdown', stop);
        el.innerHTML = '';
      },
    };
  }

  /** As duas cordas como na montagem (traço grosso, borda escura, tracejado claro, pontas metálicas), suavizadas. */
  function show(el, work) {
    injectCSS();
    let h = `<svg class="kl-show" viewBox="0 0 ${W} ${H}" xmlns="${NS}" fill="none" stroke-linecap="round" stroke-linejoin="round">`;
    for (const s of ROPES) {
      const pts = work && work.kit === 'laces' ? work[s.id] : null;
      if (!Array.isArray(pts) || pts.length < 2 || !pts.every(okPoint)) continue;
      const P = pts.map(([x, y]) => ({ x: x * W, y: y * H })), d = svgPath(P), N = P.length;
      h += `<path d="${d}" stroke="${s.dark}" stroke-width="9"/><path d="${d}" stroke="${s.main}" stroke-width="6"/>`
        + `<path d="${d}" stroke="${s.light}" stroke-width="2" stroke-dasharray="2 5"/>`
        + `<g stroke-linecap="butt">${svgTip(P[0], P[1])}${svgTip(P[N - 1], P[N - 2])}</g>`;
    }
    el.innerHTML = h + '</svg>';
  }

  window.Kits = window.Kits || {};
  window.Kits.laces = { build, show };
})();
