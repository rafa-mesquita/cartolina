'use strict';
/* Kit "cubos coloridos": grade 4×4, 8 cores × 3 cubos. Obra = {kit:'cubes', cells:(0..7|null)[16]}, linha por linha. */
(function () {
  const COLORS = ['#E24B4A', '#EF9F27', '#F2D14B', '#639922', '#378ADD', '#7F77DD', '#F6EEDD', '#2C2C2A'];
  const NAMES = ['vermelho', 'laranja', 'amarelo', 'verde', 'azul', 'roxo', 'creme', 'preto'];
  const CELLS = 16, PER_COLOR = 3;
  /** Brilho de cubo: luz no canto de cima, sombra embaixo (vale pra montagem e pra mostra). */
  const SHINE = 'linear-gradient(145deg,rgba(255,255,255,.42) 0%,rgba(255,255,255,.08) 38%,rgba(0,0,0,0) 60%,rgba(0,0,0,.16) 100%)';

  const CSS = `
.kc{position:absolute;inset:0;container-type:size;font-family:var(--ui);color:var(--ink)}
.kc-tray{position:absolute;left:5cqw;top:4cqw;padding:2cqw;border-radius:1.6cqw;background:var(--kraft);
  box-shadow:inset 0 1px 3px rgba(59,47,47,.28),0 0 0 1px var(--edge);display:grid;grid-template-columns:repeat(4,13cqw);gap:1.5cqw;touch-action:none}
.kc-cell{width:13cqw;height:13cqw;border-radius:1.3cqw;cursor:pointer;position:relative}
.kc-cell.empty{border:1.5px dashed rgba(125,106,88,.45);background:rgba(246,238,221,.55)}
.kc-cell.empty:hover{border-color:var(--blue)}
.kc-cube{box-shadow:0 0 0 1px rgba(59,47,47,.28),0 2px 3px rgba(59,47,47,.3)}
.kc-pal{position:absolute;left:67cqw;top:4cqw;width:28cqw}
.kc-pal h5{margin:0 0 1.8cqw;font:700 3.4cqw/1 var(--ui);color:var(--ink)}
.kc-sw{display:grid;grid-template-columns:repeat(2,1fr);gap:1.8cqw}
.kc-btn{position:relative;display:flex;align-items:center;gap:1.4cqw;padding:1cqw 1.4cqw;border:1px solid var(--edge);border-radius:999px;background:rgba(255,255,255,.35)}
.kc-btn .sq{width:5.4cqw;height:5.4cqw;border-radius:.9cqw;flex:none}
.kc-btn .n{font:700 3cqw/1 var(--ui);color:var(--ink)}
.kc-btn.on{border-color:var(--blue);box-shadow:0 0 0 1.5px var(--blue)}
.kc-btn.out{opacity:.38}
.kc-btn.out .n{text-decoration:line-through}
.kc-btn.shake{animation:kcShake .3s}
@keyframes kcShake{25%{transform:translateX(-3px)}75%{transform:translateX(3px)}}
.kc-tip{margin:2.6cqw 0 0;font:500 2.2cqw/1.45 var(--ui);color:var(--ink-soft)}
.kc-left{position:absolute;left:5cqw;width:57cqw;top:66cqw;text-align:center;font:700 3.2cqw/1 var(--ui);color:var(--ink-soft)}
.kc-left.full{color:var(--ok)}
.kc-show{position:absolute;inset:0;width:100%;height:100%;display:block}`;
  function injectCSS() {
    if (document.getElementById('kit-cubes-css')) return;
    const s = document.createElement('style'); s.id = 'kit-cubes-css'; s.textContent = CSS; document.head.appendChild(s);
  }
  const cubeBg = (c) => `${SHINE},${COLORS[c]}`;

  function build(el, work, onChange) {
    injectCSS();
    const cells = work && Array.isArray(work.cells) && work.cells.length === CELLS ? work.cells.slice() : Array(CELLS).fill(null);
    let cur = 0;
    const used = (c) => cells.filter((x) => x === c).length;
    const left = (c) => PER_COLOR - used(c);

    el.innerHTML = `<div class="kc"><div class="kc-tray"></div>
      <div class="kc-pal"><h5>cubos</h5><div class="kc-sw"></div>
      <p class="kc-tip">clique numa casa pra pôr o cubo; com a mesma cor, clique de novo pra tirar. Arraste pra pintar várias.</p></div>
      <div class="kc-left"></div></div>`;
    const tray = el.querySelector('.kc-tray'), sw = el.querySelector('.kc-sw'), leftEl = el.querySelector('.kc-left');
    tray.innerHTML = cells.map((_, i) => `<div class="kc-cell" data-i="${i}"></div>`).join('');
    sw.innerHTML = COLORS.map((_, c) => `<button class="kc-btn" data-c="${c}" title="${NAMES[c]}"><span class="sq kc-cube" style="background:${cubeBg(c)}"></span><span class="n"></span></button>`).join('');
    const cellEls = [...tray.children], btnEls = [...sw.children];

    function render() {
      cells.forEach((c, i) => {
        const d = cellEls[i];
        d.className = 'kc-cell ' + (c === null ? 'empty' : 'kc-cube');
        d.style.background = c === null ? '' : cubeBg(c);
      });
      btnEls.forEach((b, c) => {
        b.classList.toggle('on', c === cur); b.classList.toggle('out', left(c) === 0);
        b.querySelector('.n').textContent = `×${left(c)}`;
      });
      const empty = cells.filter((c) => c === null).length;
      leftEl.textContent = empty ? `faltam ${empty} ${empty === 1 ? 'casa' : 'casas'}` : 'pronto pra ficar pronto!';
      leftEl.classList.toggle('full', !empty);
    }
    const emit = () => onChange({ kit: 'cubes', cells: cells.slice() });
    function shake() { const b = btnEls[cur]; b.classList.remove('shake'); void b.offsetWidth; b.classList.add('shake'); }

    /** mode: 'paint' põe a cor ativa (se sobrar cubo); 'erase' tira cubos da cor ativa. Devolve se mudou. */
    function apply(i, mode) {
      if (mode === 'erase') { if (cells[i] !== cur) return false; cells[i] = null; return true; }
      if (cells[i] === cur) return false;
      if (left(cur) === 0) { shake(); return false; }
      cells[i] = cur; // se tinha outra cor, o cubo antigo volta pro monte (a contagem sai das casas)
      return true;
    }

    let drag = null; // { mode, pid }
    const cellAt = (e) => { const t = document.elementFromPoint(e.clientX, e.clientY); const d = t && t.closest('.kc-cell'); return d && tray.contains(d) ? Number(d.dataset.i) : -1; };
    function onDown(e) {
      const i = cellAt(e); if (i < 0) return;
      e.preventDefault();
      const mode = cells[i] === cur ? 'erase' : 'paint';
      drag = { mode, pid: e.pointerId, last: i };
      if (apply(i, mode)) { render(); emit(); }
    }
    function onMove(e) {
      if (!drag || e.pointerId !== drag.pid) return;
      const i = cellAt(e); if (i < 0 || i === drag.last) return;
      drag.last = i;
      if (apply(i, drag.mode)) { render(); emit(); }
    }
    function onUp(e) { if (drag && e.pointerId === drag.pid) drag = null; }
    function onPick(e) { const b = e.target.closest('.kc-btn'); if (!b) return; cur = Number(b.dataset.c); render(); }

    tray.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    sw.addEventListener('click', onPick);
    render();
    return {
      destroy() {
        tray.removeEventListener('pointerdown', onDown);
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onUp);
        sw.removeEventListener('click', onPick);
        el.innerHTML = '';
      },
    };
  }

  let showN = 0;
  /** Grade 4×4 de cubinhos, centralizada na folha 4:3 (SVG, vale em qualquer tamanho). */
  function show(el, work) {
    const cells = (work && work.cells) || Array(CELLS).fill(null);
    const id = `kcg${++showN}`, S = 62, G = 6, W = 4 * S + 3 * G, x0 = (400 - W) / 2, y0 = (300 - W) / 2;
    let h = `<svg class="kc-show" viewBox="0 0 400 300" xmlns="http://www.w3.org/2000/svg"><defs>
      <linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".42"/><stop offset=".38" stop-color="#fff" stop-opacity=".08"/>
      <stop offset=".6" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".18"/></linearGradient></defs>`;
    cells.forEach((c, i) => {
      const x = x0 + (i % 4) * (S + G), y = y0 + Math.floor(i / 4) * (S + G);
      if (c === null || c === undefined) { h += `<rect x="${x + 1}" y="${y + 1}" width="${S - 2}" height="${S - 2}" rx="6" fill="none" stroke="#a3958a" stroke-width="1.5" stroke-dasharray="5 4"/>`; return; }
      h += `<rect x="${x}" y="${y + 1.5}" width="${S}" height="${S}" rx="6" fill="rgba(59,47,47,.25)"/>`
        + `<rect x="${x}" y="${y}" width="${S}" height="${S}" rx="6" fill="${COLORS[c]}" stroke="rgba(59,47,47,.3)" stroke-width="1"/>`
        + `<rect x="${x}" y="${y}" width="${S}" height="${S}" rx="6" fill="url(#${id})"/>`;
    });
    el.innerHTML = h + '</svg>';
  }

  window.Kits = window.Kits || {};
  window.Kits.cubes = { build, show };
})();
