'use strict';
/* Kit "pontos e linhas": até 5 pontos na folha e até 10 linhas entre eles.
   Obra = {kit:'dots', points:[x,y][] (0–1, relativos à folha 4:3), lines:[i,j][] (índices de points, sem repetir)}. */
(function () {
  const NS = 'http://www.w3.org/2000/svg';
  const W = 400, H = 300, R = 10; // folha em unidades do viewBox (4:3); raio do ponto
  const MAX_PTS = 5, MAX_LINES = 10;
  const INK = '#3b2f2f', BLUE = '#2f5aa8';

  const CSS = `
.kd{position:absolute;inset:0;container-type:size;font-family:var(--ui)}
.kd svg{position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none;cursor:crosshair}
.kd svg circle{cursor:grab}
.kd-st{position:absolute;left:3cqw;right:15cqw;bottom:2.4cqw;pointer-events:none;font:600 4.2cqw/1 var(--hand);color:var(--ink-soft)}
.kd-st small{display:block;margin-top:.8cqw;font:400 2cqw/1.3 var(--ui)}
.kd-clr{position:absolute;right:2.4cqw;bottom:2.4cqw;padding:.9cqw 2.2cqw;border-radius:999px;border:1px solid var(--edge);background:var(--paper);
  font:600 2.2cqw/1 var(--ui);color:var(--ink-soft);box-shadow:0 1px 2px rgba(59,47,47,.2)}
.kd-clr:hover{color:var(--blue);border-color:var(--blue)}
.kd-show{position:absolute;inset:0;width:100%;height:100%;display:block}`;
  function injectCSS() {
    if (document.getElementById('kit-dots-css')) return;
    const s = document.createElement('style'); s.id = 'kit-dots-css'; s.textContent = CSS; document.head.appendChild(s);
  }
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const r3 = (v) => Math.round(v * 1000) / 1000;
  const key = (a, b) => (a < b ? `${a}-${b}` : `${b}-${a}`);
  const okPoint = (p) => Array.isArray(p) && p.length === 2 && p.every((v) => typeof v === 'number' && v >= 0 && v <= 1);

  function build(el, work, onChange) {
    injectCSS();
    // estado interno com ids estáveis; a obra usa índices (recalculados a cada mudança)
    let nextId = 0, pts = [], lines = [], sel = null, drag = null, msg = '', lastTap = null;
    if (work && Array.isArray(work.points)) {
      pts = work.points.filter(okPoint).slice(0, MAX_PTS).map(([x, y]) => ({ id: nextId++, x: x * W, y: y * H }));
      for (const [a, b] of work.lines || []) {
        if (a === b || !pts[a] || !pts[b]) continue;
        const k = key(pts[a].id, pts[b].id);
        if (!lines.includes(k) && lines.length < MAX_LINES) lines.push(k);
      }
    }
    el.innerHTML = `<div class="kd"><svg viewBox="0 0 ${W} ${H}" xmlns="${NS}"></svg><div class="kd-st"></div><button class="kd-clr">limpar</button></div>`;
    const svg = el.querySelector('svg'), st = el.querySelector('.kd-st'), clr = el.querySelector('.kd-clr');

    const toWork = () => ({
      kit: 'dots',
      points: pts.map((p) => [r3(p.x / W), r3(p.y / H)]),
      lines: lines.map((k) => k.split('-').map((id) => pts.findIndex((p) => p.id === Number(id)))),
    });
    const emit = () => onChange(toWork());

    function render() {
      let h = '';
      for (const k of lines) {
        const [a, b] = k.split('-').map(Number), A = pts.find((p) => p.id === a), B = pts.find((p) => p.id === b);
        h += `<line x1="${A.x}" y1="${A.y}" x2="${B.x}" y2="${B.y}" stroke="${INK}" stroke-width="4" stroke-linecap="round"/>`;
      }
      for (const p of pts) {
        const on = sel === p.id;
        h += `<circle data-id="${p.id}" cx="${p.x}" cy="${p.y}" r="${on ? R + 3 : R}" fill="${on ? '#5d82c7' : BLUE}" stroke="${on ? '#1d3c75' : 'rgba(59,47,47,.25)'}" stroke-width="${on ? 2.5 : 1}"/>`;
      }
      svg.innerHTML = h;
      const left = MAX_PTS - pts.length;
      const main = msg || (sel !== null ? 'agora clique em outro ponto pra ligar'
        : left ? `clique na folha pra pôr um ponto (${left} ${left === 1 ? 'restante' : 'restantes'})`
          : `5 pontos usados · ${lines.length} ${lines.length === 1 ? 'linha' : 'linhas'}`);
      st.innerHTML = `${main}<small>clique num ponto e depois em outro pra ligar ou desligar · arraste pra mover · clique duplo apaga</small>`;
      msg = '';
    }
    /** Ponteiro em unidades do viewBox, preso dentro da folha. */
    function sp(e) {
      const m = svg.getScreenCTM(); const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
      return { x: clamp(p.x, R, W - R), y: clamp(p.y, R, H - R) };
    }
    function onDown(e) {
      if (e.button !== undefined && e.button !== 0) return;
      const c = e.target.closest('circle[data-id]');
      if (c) {
        e.preventDefault();
        const p = pts.find((q) => q.id === Number(c.dataset.id));
        const q = sp(e);
        drag = { p, pid: e.pointerId, x0: q.x, y0: q.y, moved: false };
        svg.setPointerCapture(e.pointerId);
        return;
      }
      if (sel !== null) { sel = null; render(); return; }
      if (pts.length >= MAX_PTS) { msg = 'já tem 5 pontos (clique duplo apaga um)'; render(); return; }
      const q = sp(e);
      pts.push({ id: nextId++, x: q.x, y: q.y });
      render(); emit();
    }
    function onMove(e) {
      if (!drag || e.pointerId !== drag.pid) return;
      const q = sp(e);
      if (!drag.moved && Math.hypot(q.x - drag.x0, q.y - drag.y0) <= 3) return;
      drag.moved = true; drag.p.x = q.x; drag.p.y = q.y;
      render(); emit();
    }
    function onUp(e) {
      if (!drag || e.pointerId !== drag.pid) return;
      const { p, moved } = drag; drag = null;
      if (moved) return;
      const now = performance.now();
      // clique duplo = dois toques seguidos no mesmo ponto (o 1º seleciona); feito à mão porque o redesenho troca os círculos
      if (sel === p.id && lastTap && lastTap.id === p.id && now - lastTap.t < 400) { lastTap = null; remove(p.id); return; }
      lastTap = null;
      if (sel === null) { sel = p.id; lastTap = { id: p.id, t: now }; }
      else if (sel === p.id) sel = null;
      else {
        const k = key(sel, p.id);
        if (lines.includes(k)) lines = lines.filter((x) => x !== k);
        else if (lines.length >= MAX_LINES) msg = 'no máximo 10 linhas';
        else lines = [...lines, k];
        sel = null; render(); emit(); return;
      }
      render();
    }
    function remove(id) {
      pts = pts.filter((q) => q.id !== id);
      lines = lines.filter((k) => !k.split('-').map(Number).includes(id));
      sel = null; render(); emit();
    }
    function onClear() { if (!pts.length) return; pts = []; lines = []; sel = null; render(); emit(); }
    function stop(e) { e.stopPropagation(); }

    svg.addEventListener('pointerdown', onDown);
    svg.addEventListener('pointermove', onMove);
    svg.addEventListener('pointerup', onUp);
    svg.addEventListener('pointercancel', onUp);
    clr.addEventListener('click', onClear);
    clr.addEventListener('pointerdown', stop);
    render();
    return {
      destroy() {
        svg.removeEventListener('pointerdown', onDown);
        svg.removeEventListener('pointermove', onMove);
        svg.removeEventListener('pointerup', onUp);
        svg.removeEventListener('pointercancel', onUp);
        clr.removeEventListener('click', onClear);
        clr.removeEventListener('pointerdown', stop);
        el.innerHTML = '';
      },
    };
  }

  /** Pontos em tinta azul e linhas em tinta, na folha 4:3. */
  function show(el, work) {
    const points = ((work && work.points) || []).filter(okPoint).map(([x, y]) => [x * W, y * H]);
    let h = `<svg class="kd-show" viewBox="0 0 ${W} ${H}" xmlns="${NS}">`;
    for (const [a, b] of (work && work.lines) || []) {
      if (!points[a] || !points[b]) continue;
      h += `<line x1="${points[a][0]}" y1="${points[a][1]}" x2="${points[b][0]}" y2="${points[b][1]}" stroke="${INK}" stroke-width="4" stroke-linecap="round"/>`;
    }
    for (const [x, y] of points) h += `<circle cx="${x}" cy="${y}" r="${R}" fill="${BLUE}" stroke="rgba(59,47,47,.25)" stroke-width="1"/>`;
    el.innerHTML = h + '</svg>';
  }

  window.Kits = window.Kits || {};
  window.Kits.dots = { build, show };
})();
