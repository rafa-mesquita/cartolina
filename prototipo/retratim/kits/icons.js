'use strict';
/* Kit "símbolos": 19 cartas com ícone; a obra é a fila de 2 a 5 cartas lado a lado.
   Obra = {kit:'icons', ids:number[]} (0–18, sem repetir, até 5; pronto pede 2). */
(function () {
  /** Índice = id da carta. O R2 copia esta lista pro shared. */
  const ICON_NAMES = ['ti-circle', 'ti-square', 'ti-triangle', 'ti-arrow-up', 'ti-arrow-right', 'ti-wave-sine', 'ti-sun', 'ti-moon', 'ti-cloud',
    'ti-flame', 'ti-droplet', 'ti-leaf', 'ti-home', 'ti-eye', 'ti-heart', 'ti-star', 'ti-bolt', 'ti-user', 'ti-paw'];
  window.ICON_NAMES = ICON_NAMES;
  const MAX = 5, MIN = 2;
  const TILT = [-2.2, 1.4, -.8, 2, -1.5];

  const CSS = `
.ki{position:absolute;inset:0;container-type:size;font-family:var(--ui);color:var(--ink)}
.ki-lab{position:absolute;left:4.6cqw;font:700 2.8cqw/1 var(--ui);color:var(--ink-soft)}
.ki-hand{position:absolute;left:4.6cqw;right:4.6cqw;top:7.4cqw;display:grid;grid-template-columns:repeat(10,1fr);gap:1.2cqw 1.1cqw}
.ki-card{position:relative;display:grid;place-items:center;background:var(--photo-border);border:1px solid var(--edge);border-radius:.9cqw;
  box-shadow:0 1px 2px rgba(59,47,47,.25);color:var(--ink)}
.ki-hand .ki-card{height:10.4cqw;padding:0;cursor:pointer;transition:transform .12s}
.ki-hand .ki-card:hover{transform:translateY(-.6cqw)}
.ki-hand .ki-card i{font-size:5cqw;line-height:1}
.ki-hand .ki-card.used{background:rgba(234,219,192,.6);box-shadow:none;transform:translateY(.4cqw)}
.ki-hand .ki-card.used i{opacity:.3}
.ki-hand .ki-card.used b{position:absolute;right:-.8cqw;top:-.8cqw;width:3.6cqw;height:3.6cqw;border-radius:50%;background:var(--blue);color:var(--paper);
  font:700 2.1cqw/3.6cqw var(--ui);text-align:center}
.ki-hand .ki-card.shake{animation:kiShake .3s}
@keyframes kiShake{25%{transform:translateX(-3px)}75%{transform:translateX(3px)}}
.ki-row{position:absolute;left:0;right:0;top:36cqw;display:flex;justify-content:center;gap:2.4cqw;touch-action:none}
.ki-slot{width:15cqw;height:20cqw;border-radius:1.2cqw;border:1.5px dashed rgba(125,106,88,.4)}
.ki-row .ki-card{width:15cqw;height:20cqw;border-radius:1.2cqw;cursor:grab}
.ki-row .ki-card i{font-size:9.5cqw;line-height:1}
.ki-row .ki-card.lift{cursor:grabbing;box-shadow:0 0 0 2px var(--blue),0 6px 14px rgba(59,47,47,.3);z-index:2}
.ki-x{position:absolute;right:-1.4cqw;top:-1.4cqw;width:4.2cqw;height:4.2cqw;padding:0;border-radius:50%;border:1px solid var(--edge);background:var(--paper);
  color:var(--ink-soft);font:600 2.6cqw/1 var(--ui);display:grid;place-items:center;box-shadow:0 1px 2px rgba(59,47,47,.2)}
.ki-x:hover{color:var(--blue);border-color:var(--blue)}
.ki-foot{position:absolute;left:0;right:0;top:62cqw;text-align:center}
.ki-foot .t{font:700 3.2cqw/1 var(--ui);color:var(--ink-soft)}
.ki-foot .t.ok{color:var(--ok)}
.ki-foot .s{display:block;margin-top:1.4cqw;font:500 2.2cqw/1.35 var(--ui);color:var(--ink-soft)}
.ki-show{position:absolute;inset:0;container-type:size;display:flex;align-items:center;justify-content:center;gap:2.6cqw}
.ki-show .ki-card{width:16cqw;height:21.3cqw;border-radius:1.3cqw}
.ki-show .ki-card i{font-size:10cqw;line-height:1}`;
  function injectCSS() {
    if (document.getElementById('kit-icons-css')) return;
    const s = document.createElement('style'); s.id = 'kit-icons-css'; s.textContent = CSS; document.head.appendChild(s);
  }
  const validId = (x) => Number.isInteger(x) && x >= 0 && x < ICON_NAMES.length;

  function build(el, work, onChange) {
    injectCSS();
    let ids = work && Array.isArray(work.ids) ? [...new Set(work.ids.filter(validId))].slice(0, MAX) : [];
    el.innerHTML = `<div class="ki"><span class="ki-lab" style="top:2.6cqw">suas cartas</span><div class="ki-hand"></div>
      <span class="ki-lab" style="top:31cqw">a obra</span><div class="ki-row"></div>
      <div class="ki-foot"><span class="t"></span><span class="s">clique numa carta pra pôr na fila (de novo tira) · arraste na fila pra trocar a ordem</span></div></div>`;
    const hand = el.querySelector('.ki-hand'), row = el.querySelector('.ki-row'), t = el.querySelector('.ki-foot .t');
    hand.innerHTML = ICON_NAMES.map((n, i) => `<button class="ki-card" data-id="${i}"><i class="ti ${n}"></i><b></b></button>`).join('');
    const handEls = [...hand.children];
    let drag = null; // { id, pid, x0, moved }

    function render() {
      handEls.forEach((b, i) => {
        const k = ids.indexOf(i);
        b.classList.toggle('used', k >= 0); b.querySelector('b').textContent = k >= 0 ? k + 1 : '';
      });
      let h = '';
      for (let k = 0; k < MAX; k++) {
        const id = ids[k];
        h += id === undefined
          ? '<div class="ki-slot"></div>'
          : `<div class="ki-card${drag && drag.moved && drag.id === id ? ' lift' : ''}" data-id="${id}" style="transform:rotate(${TILT[k]}deg)"><i class="ti ${ICON_NAMES[id]}"></i><button class="ki-x" data-x="${id}" title="tirar">✕</button></div>`;
      }
      row.innerHTML = h;
      const n = ids.length;
      t.textContent = n >= MIN ? `${n} ${n === 1 ? 'carta' : 'cartas'} na fila${n < MAX ? ' · cabem mais ' + (MAX - n) : ''}` : 'escolha de 2 a 5 cartas';
      t.classList.toggle('ok', n >= MIN);
    }
    const emit = () => onChange({ kit: 'icons', ids: ids.slice() });

    function onHand(e) {
      const b = e.target.closest('.ki-card'); if (!b) return;
      const id = Number(b.dataset.id);
      if (ids.includes(id)) ids = ids.filter((x) => x !== id);
      else if (ids.length >= MAX) { b.classList.remove('shake'); void b.offsetWidth; b.classList.add('shake'); t.textContent = 'no máximo 5 cartas'; return; }
      else ids = [...ids, id];
      render(); emit();
    }
    /** Fenda mais perto do ponteiro (as 5 fendas ficam sempre no mesmo lugar). */
    function slotAt(x) {
      let best = 0, d = Infinity;
      [...row.children].forEach((c, k) => { const r = c.getBoundingClientRect(), dd = Math.abs(r.left + r.width / 2 - x); if (dd < d) { d = dd; best = k; } });
      return Math.min(best, ids.length - 1);
    }
    function onDown(e) {
      const x = e.target.closest('.ki-x');
      if (x) { ids = ids.filter((v) => v !== Number(x.dataset.x)); render(); emit(); return; }
      const c = e.target.closest('.ki-card'); if (!c) return;
      e.preventDefault();
      drag = { id: Number(c.dataset.id), pid: e.pointerId, x0: e.clientX, moved: false };
      row.setPointerCapture(e.pointerId);
    }
    function onMove(e) {
      if (!drag || e.pointerId !== drag.pid) return;
      if (!drag.moved) { if (Math.abs(e.clientX - drag.x0) < 4) return; drag.moved = true; render(); }
      const to = slotAt(e.clientX), from = ids.indexOf(drag.id);
      if (to === from) return;
      ids.splice(from, 1); ids.splice(to, 0, drag.id);
      render(); emit();
    }
    function onUp(e) {
      if (!drag || e.pointerId !== drag.pid) return;
      const was = drag.moved; drag = null;
      if (was) render();
    }
    hand.addEventListener('click', onHand);
    row.addEventListener('pointerdown', onDown);
    row.addEventListener('pointermove', onMove);
    row.addEventListener('pointerup', onUp);
    row.addEventListener('pointercancel', onUp);
    render();
    return {
      destroy() {
        hand.removeEventListener('click', onHand);
        row.removeEventListener('pointerdown', onDown);
        row.removeEventListener('pointermove', onMove);
        row.removeEventListener('pointerup', onUp);
        row.removeEventListener('pointercancel', onUp);
        el.innerHTML = '';
      },
    };
  }

  /** As cartas da fila lado a lado, centralizadas na folha. */
  function show(el, work) {
    injectCSS();
    const ids = ((work && work.ids) || []).filter(validId);
    el.innerHTML = `<div class="ki-show">${ids.map((id, k) => `<div class="ki-card" style="transform:rotate(${TILT[k % TILT.length]}deg)"><i class="ti ${ICON_NAMES[id]}"></i></div>`).join('')}</div>`;
  }

  window.Kits = window.Kits || {};
  window.Kits.icons = { build, show };
})();
