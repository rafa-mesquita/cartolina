'use strict';
/* Kit "palitos e pedras": 4 palitos + 4 pedras soltos sobre a folha; o que fica fora dela está guardado na gaveta.
   Obra = {kit:'sticks', sticks:{x,y,rot}[4], stones:{x,y,rot}[4]}: centro da peça relativo à folha 4:3
   (0–1 = na folha; fora disso, até −0,5/1,5, = guardada) e giro em graus. */
(function () {
  const NS = 'http://www.w3.org/2000/svg';
  const W = 400, H = 300; // folha em unidades do viewBox (4:3)
  // a bancada é mais larga que a folha: à direita fica a gaveta, embaixo as dicas (a caixa toda continua 4:3)
  const VB = { x: -14, y: -52, w: 612, h: 459 };
  const DRAWER = { x: 412, y: 0, w: 178, h: 300 };
  const STICK_L = 0.30 * W, STICK_T = 0.018 * W;
  const STONE_R = [[0.045, 0.035], [0.035, 0.03], [0.05, 0.038], [0.03, 0.026]].map(([a, b]) => [a * W, b * W]);
  const WOOD = ['#BA7517', '#633806'], ROCK = ['#888780', '#444441'], BLUE = '#2f5aa8';
  // começam guardadas: palitos deitados empilhados, pedras embaixo deles
  const START = {
    sticks: [0.13, 0.25, 0.37, 0.49].map((y) => ({ x: 1.25, y, rot: 0 })),
    stones: [[1.13, 0.68], [1.33, 0.7], [1.15, 0.88], [1.35, 0.9]].map(([x, y]) => ({ x, y, rot: 0 })),
  };
  // o centro da peça fica sempre dentro da caixa visível (e dentro do −0,5/1,5 do schema)
  const LIM = { x0: (VB.x + 8) / W, x1: (VB.x + VB.w - 8) / W, y0: (VB.y + 8) / H, y1: (VB.y + VB.h - 8) / H };
  const HANDLE = 62, KNOB = 10, WHEEL_STEP = 15;

  const CSS = `
.ks{position:absolute;inset:0;container-type:size;font-family:var(--ui)}
.ks svg{position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none}
.ks-p{cursor:grab;filter:drop-shadow(0 1px 1px rgba(59,47,47,.35))}
.ks-p.on{filter:drop-shadow(0 2px 3px rgba(59,47,47,.45))}
.ks.drag,.ks.drag .ks-p{cursor:grabbing}
.ks-knob{cursor:alias}
.ks-hd line,.ks-hd circle:not(.ks-knob){pointer-events:none}
.ks-lab{font:700 17px var(--ui);fill:var(--ink-soft)}
.ks-st{font:700 18px var(--ui);fill:var(--ink-soft)}
.ks-st.ok{fill:var(--ok)}
.ks-tip{font:500 12.5px var(--ui);fill:var(--ink-soft)}
.ks-show{position:absolute;inset:0;width:100%;height:100%;display:block}
.ks-show .ks-p{cursor:default}`;
  function injectCSS() {
    if (document.getElementById('kit-sticks-css')) return;
    const s = document.createElement('style'); s.id = 'kit-sticks-css'; s.textContent = CSS; document.head.appendChild(s);
  }
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const r3 = (v) => Math.round(v * 1000) / 1000;
  const norm = (deg) => ((Math.round(deg) % 360) + 360) % 360;
  const okNum = (v, a, b) => typeof v === 'number' && Number.isFinite(v) && v >= a && v <= b;
  const onSheet = (q) => q.x >= 0 && q.x <= 1 && q.y >= 0 && q.y <= 1;

  /** Desenho de uma peça centrada na origem (o <g> de fora posiciona e gira). */
  function stickSVG() {
    const l = STICK_L, t = STICK_T;
    return `<rect x="${-l / 2}" y="${-t / 2}" width="${l}" height="${t}" rx="${t / 2}" fill="${WOOD[0]}" stroke="${WOOD[1]}" stroke-width="1"/>`
      + `<line x1="${-l / 2 + 6}" y1="${-t / 6}" x2="${l / 2 - 10}" y2="${-t / 6}" stroke="rgba(255,236,200,.35)" stroke-width="1.1" stroke-linecap="round"/>`;
  }
  function stoneSVG(i) {
    const [a, b] = STONE_R[i];
    return `<ellipse rx="${a}" ry="${b}" fill="${ROCK[0]}" stroke="${ROCK[1]}" stroke-width="1"/>`
      + `<ellipse cx="${-a * .3}" cy="${-b * .35}" rx="${a * .38}" ry="${b * .26}" fill="rgba(255,255,255,.16)"/>`;
  }
  const at = (q) => `translate(${q.x * W} ${q.y * H}) rotate(${q.rot})`;

  /** Lê uma lista de peças da obra; peça inválida volta pro lugar inicial da gaveta. */
  function readPieces(list, start) {
    return start.map((s, i) => {
      const q = Array.isArray(list) ? list[i] : null;
      return q && okNum(q.x, -0.5, 1.5) && okNum(q.y, -0.5, 1.5) && okNum(q.rot, -3600, 3600)
        ? { x: q.x, y: q.y, rot: norm(q.rot) } : { ...s };
    });
  }

  function build(el, work, onChange) {
    injectCSS();
    const ok = work && work.kit === 'sticks';
    // peças 0–3 = palitos, 4–7 = pedras (mesma ordem da obra)
    const pcs = [...readPieces(ok && work.sticks, START.sticks), ...readPieces(ok && work.stones, START.stones)];
    let sel = -1, drag = null, turn = null;

    el.innerHTML = `<div class="ks"><svg viewBox="${VB.x} ${VB.y} ${VB.w} ${VB.h}" xmlns="${NS}">
      <rect x="${VB.x}" y="${VB.y}" width="${VB.w}" height="${VB.h}" fill="rgba(234,219,192,.55)"/>
      <rect x="${DRAWER.x}" y="${DRAWER.y}" width="${DRAWER.w}" height="${DRAWER.h}" rx="10" fill="rgba(211,191,153,.45)" stroke="rgba(125,106,88,.45)" stroke-width="1.2" stroke-dasharray="5 4"/>
      <rect x="0" y="0" width="${W}" height="${H}" fill="#fbf7ef" stroke="#d3bf99" stroke-width="1.2" style="filter:drop-shadow(0 1px 2px rgba(59,47,47,.25))"/>
      <text class="ks-lab" x="2" y="-16">folha</text><text class="ks-lab" x="${DRAWER.x + 4}" y="-16">gaveta</text>
      <g class="ks-layer"></g>
      <text class="ks-st" x="2" y="${H + 34}"></text>
      <text class="ks-tip" x="2" y="${H + 60}">arraste as peças pra folha · clique numa peça e gire pela alça azul (ou pela rodinha)</text>
      <text class="ks-tip" x="2" y="${H + 80}">o que ficar fora da folha está guardado e não aparece na obra · clique no vazio pra soltar</text>
    </svg></div>`;
    const root = el.querySelector('.ks'), svg = el.querySelector('svg'), layer = el.querySelector('.ks-layer'), st = el.querySelector('.ks-st');

    const gs = pcs.map((_, i) => {
      const g = document.createElementNS(NS, 'g');
      g.setAttribute('class', 'ks-p'); g.dataset.i = i;
      g.innerHTML = i < 4 ? stickSVG() : stoneSVG(i - 4);
      return g;
    });
    // pedras embaixo, palitos por cima (a peça escolhida sobe pro topo)
    for (const i of [4, 5, 6, 7, 0, 1, 2, 3]) layer.appendChild(gs[i]);
    const hd = document.createElementNS(NS, 'g');
    hd.setAttribute('class', 'ks-hd'); hd.style.display = 'none';
    hd.innerHTML = `<line x1="0" y1="0" x2="0" y2="${-HANDLE}" stroke="${BLUE}" stroke-width="1.8" stroke-dasharray="4 4"/>`
      + `<circle class="ks-knob" cy="${-HANDLE}" r="${KNOB}" fill="${BLUE}" stroke="#fbf7ef" stroke-width="2"/><circle r="3.5" fill="${BLUE}"/>`;
    layer.appendChild(hd);

    const toWork = () => ({
      kit: 'sticks',
      sticks: pcs.slice(0, 4).map((q) => ({ x: r3(q.x), y: r3(q.y), rot: q.rot })),
      stones: pcs.slice(4).map((q) => ({ x: r3(q.x), y: r3(q.y), rot: q.rot })),
    });
    const emit = () => onChange(toWork());

    function put(i) {
      gs[i].setAttribute('transform', at(pcs[i]));
      if (i === sel) hd.setAttribute('transform', at(pcs[i]));
    }
    function status() {
      const n = pcs.filter(onSheet).length;
      st.textContent = n ? `na folha: ${n} de 8 ${n === 1 ? 'peça' : 'peças'}` : 'tudo na gaveta: arraste uma peça pra folha';
      st.classList.toggle('ok', n > 0);
    }
    function choose(i) {
      if (sel >= 0) gs[sel].classList.remove('on');
      sel = i;
      hd.style.display = i >= 0 ? '' : 'none';
      if (i >= 0) { gs[i].classList.add('on'); layer.appendChild(gs[i]); layer.appendChild(hd); put(i); }
    }
    /** Ponteiro em unidades do viewBox. */
    function sp(e) {
      const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(svg.getScreenCTM().inverse());
      return { x: p.x, y: p.y };
    }

    function onDown(e) {
      if (e.button !== undefined && e.button !== 0) return;
      if (e.target.closest('.ks-knob') && sel >= 0) {
        e.preventDefault();
        turn = { pid: e.pointerId, moved: false };
        svg.setPointerCapture(e.pointerId);
        return;
      }
      const g = e.target.closest('.ks-p');
      if (!g) { choose(-1); return; }
      e.preventDefault();
      const i = Number(g.dataset.i), q = sp(e);
      choose(i);
      drag = { i, pid: e.pointerId, ox: q.x - pcs[i].x * W, oy: q.y - pcs[i].y * H, moved: false };
      svg.setPointerCapture(e.pointerId);
      root.classList.add('drag');
    }
    function onMove(e) {
      if (turn && e.pointerId === turn.pid) {
        const q = sp(e), p = pcs[sel];
        p.rot = norm(Math.atan2(q.y - p.y * H, q.x - p.x * W) * 180 / Math.PI + 90);
        turn.moved = true; put(sel); emit();
        return;
      }
      if (!drag || e.pointerId !== drag.pid) return;
      const q = sp(e), p = pcs[drag.i];
      p.x = clamp((q.x - drag.ox) / W, LIM.x0, LIM.x1);
      p.y = clamp((q.y - drag.oy) / H, LIM.y0, LIM.y1);
      drag.moved = true; put(drag.i); status(); emit();
    }
    function onUp(e) {
      if (turn && e.pointerId === turn.pid) { turn = null; return; }
      if (!drag || e.pointerId !== drag.pid) return;
      drag = null; root.classList.remove('drag');
    }
    function onWheel(e) {
      const g = e.target.closest('.ks-p');
      const i = g ? Number(g.dataset.i) : (e.target.closest('.ks-hd') ? sel : -1);
      if (i < 0) return;
      e.preventDefault();
      if (i !== sel) choose(i);
      pcs[i].rot = norm(pcs[i].rot + (e.deltaY > 0 ? WHEEL_STEP : -WHEEL_STEP));
      put(i); emit();
    }

    svg.addEventListener('pointerdown', onDown);
    svg.addEventListener('pointermove', onMove);
    svg.addEventListener('pointerup', onUp);
    svg.addEventListener('pointercancel', onUp);
    svg.addEventListener('wheel', onWheel, { passive: false });
    pcs.forEach((_, i) => put(i));
    status();
    return {
      destroy() {
        svg.removeEventListener('pointerdown', onDown);
        svg.removeEventListener('pointermove', onMove);
        svg.removeEventListener('pointerup', onUp);
        svg.removeEventListener('pointercancel', onUp);
        svg.removeEventListener('wheel', onWheel);
        el.innerHTML = '';
      },
    };
  }

  /** Só as peças com o centro dentro da folha, do mesmo jeito que na montagem (o que passa da borda é cortado). */
  function show(el, work) {
    injectCSS();
    const ok = work && work.kit === 'sticks';
    const sticks = ok ? readPieces(work.sticks, START.sticks) : [], stones = ok ? readPieces(work.stones, START.stones) : [];
    let h = `<svg class="ks-show" viewBox="0 0 ${W} ${H}" xmlns="${NS}">`;
    stones.forEach((q, i) => { if (onSheet(q)) h += `<g class="ks-p" transform="${at(q)}">${stoneSVG(i)}</g>`; });
    sticks.forEach((q) => { if (onSheet(q)) h += `<g class="ks-p" transform="${at(q)}">${stickSVG()}</g>`; });
    el.innerHTML = h + '</svg>';
  }

  window.Kits = window.Kits || {};
  window.Kits.sticks = { build, show };
})();
