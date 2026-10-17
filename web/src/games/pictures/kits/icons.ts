import '@tabler/icons-webfont/dist/tabler-icons.min.css';
import { ICON_NAMES, ICONS_MAX, ICONS_MIN, type WorkOf } from '@cartolina/shared';
import type { KitModule } from './types';

/* Kit "símbolos": 19 cartas com ícone; a obra é a fila de 2 a 5 cartas lado a lado.
   Obra = {kit:'icons', ids:number[]} (0–18, sem repetir, até 5; pronto pede 2). */

const TILT = [-2.2, 1.4, -0.8, 2, -1.5];

const CSS = `
.pc-ki{position:absolute;inset:0;container-type:size;font-family:var(--ui);color:var(--ink)}
.pc-ki-lab{position:absolute;left:4.6cqw;font:700 2.8cqw/1 var(--ui);color:var(--ink-soft)}
.pc-ki-hand{position:absolute;left:4.6cqw;right:4.6cqw;top:7.4cqw;display:grid;grid-template-columns:repeat(10,1fr);gap:1.2cqw 1.1cqw}
.pc-ki-card{position:relative;display:grid;place-items:center;background:var(--photo-border);border:1px solid var(--edge);border-radius:.9cqw;
  box-shadow:0 1px 2px rgba(59,47,47,.25);color:var(--ink)}
.pc-ki-hand .pc-ki-card{height:10.4cqw;padding:0;cursor:pointer;transition:transform .12s}
.pc-ki-hand .pc-ki-card:hover{transform:translateY(-.6cqw)}
.pc-ki-hand .pc-ki-card i{font-size:5cqw;line-height:1}
.pc-ki-hand .pc-ki-card.used{background:rgba(234,219,192,.6);box-shadow:none;transform:translateY(.4cqw)}
.pc-ki-hand .pc-ki-card.used i{opacity:.3}
.pc-ki-hand .pc-ki-card.used b{position:absolute;right:-.8cqw;top:-.8cqw;width:3.6cqw;height:3.6cqw;border-radius:50%;background:var(--blue);color:var(--paper);
  font:700 2.1cqw/3.6cqw var(--ui);text-align:center}
.pc-ki-hand .pc-ki-card.shake{animation:pc-ki-shake .3s}
@keyframes pc-ki-shake{25%{transform:translateX(-3px)}75%{transform:translateX(3px)}}
.pc-ki-row{position:absolute;left:0;right:0;top:36cqw;display:flex;justify-content:center;gap:2.4cqw;touch-action:none}
.pc-ki-slot{width:15cqw;height:20cqw;border-radius:1.2cqw;border:1.5px dashed rgba(125,106,88,.4)}
.pc-ki-row .pc-ki-card{width:15cqw;height:20cqw;border-radius:1.2cqw;cursor:grab}
.pc-ki-row .pc-ki-card i{font-size:9.5cqw;line-height:1}
.pc-ki-row .pc-ki-card.lift{cursor:grabbing;box-shadow:0 0 0 2px var(--blue),0 6px 14px rgba(59,47,47,.3);z-index:2}
.pc-ki-x{position:absolute;right:-1.4cqw;top:-1.4cqw;width:4.2cqw;height:4.2cqw;padding:0;border-radius:50%;border:1px solid var(--edge);background:var(--paper);
  color:var(--ink-soft);font:600 2.6cqw/1 var(--ui);display:grid;place-items:center;box-shadow:0 1px 2px rgba(59,47,47,.2)}
.pc-ki-x:hover{color:var(--blue);border-color:var(--blue)}
.pc-ki-foot{position:absolute;left:0;right:0;top:62cqw;text-align:center}
.pc-ki-foot .t{font:700 3.2cqw/1 var(--ui);color:var(--ink-soft)}
.pc-ki-foot .t.ok{color:var(--ok)}
.pc-ki-foot .s{display:block;margin-top:1.4cqw;font:500 2.2cqw/1.35 var(--ui);color:var(--ink-soft)}
.pc-ki-show{position:absolute;inset:0;container-type:size;display:flex;align-items:center;justify-content:center;gap:2.6cqw}
.pc-ki-show .pc-ki-card{width:16cqw;height:21.3cqw;border-radius:1.3cqw}
.pc-ki-show .pc-ki-card i{font-size:10cqw;line-height:1}`;

function injectCSS(): void {
  if (document.getElementById('pc-kit-icons-css')) return;
  const s = document.createElement('style');
  s.id = 'pc-kit-icons-css';
  s.textContent = CSS;
  document.head.appendChild(s);
}
const validId = (x: unknown): x is number => Number.isInteger(x) && (x as number) >= 0 && (x as number) < ICON_NAMES.length;
/** Classe do ícone da carta `id` (Tabler Icons). */
const iconClass = (id: number): string => `ti ti-${ICON_NAMES[id]}`;

function build(el: HTMLElement, work: WorkOf<'icons'> | null, onChange: (work: WorkOf<'icons'>) => void) {
  injectCSS();
  let ids: number[] = work && Array.isArray(work.ids) ? [...new Set(work.ids.filter(validId))].slice(0, ICONS_MAX) : [];
  el.innerHTML = `<div class="pc-ki"><span class="pc-ki-lab" style="top:2.6cqw">suas cartas</span><div class="pc-ki-hand"></div>
      <span class="pc-ki-lab" style="top:31cqw">a obra</span><div class="pc-ki-row"></div>
      <div class="pc-ki-foot"><span class="t"></span><span class="s">clique numa carta pra pôr na fila (de novo tira) · arraste na fila pra trocar a ordem</span></div></div>`;
  const hand = el.querySelector<HTMLElement>('.pc-ki-hand')!;
  const row = el.querySelector<HTMLElement>('.pc-ki-row')!;
  const t = el.querySelector<HTMLElement>('.pc-ki-foot .t')!;
  hand.innerHTML = ICON_NAMES.map((_, i) => `<button class="pc-ki-card" data-id="${i}"><i class="${iconClass(i)}"></i><b></b></button>`).join('');
  const handEls = [...hand.children] as HTMLElement[];
  let drag: { id: number; pid: number; x0: number; moved: boolean } | null = null;

  function render(): void {
    handEls.forEach((b, i) => {
      const k = ids.indexOf(i);
      b.classList.toggle('used', k >= 0);
      b.querySelector('b')!.textContent = k >= 0 ? String(k + 1) : '';
    });
    let h = '';
    for (let k = 0; k < ICONS_MAX; k++) {
      const id = ids[k];
      h +=
        id === undefined
          ? '<div class="pc-ki-slot"></div>'
          : `<div class="pc-ki-card${drag && drag.moved && drag.id === id ? ' lift' : ''}" data-id="${id}" style="transform:rotate(${TILT[k]}deg)"><i class="${iconClass(id)}"></i><button class="pc-ki-x" data-x="${id}" title="tirar">✕</button></div>`;
    }
    row.innerHTML = h;
    const n = ids.length;
    t.textContent =
      n >= ICONS_MIN
        ? `${n} ${n === 1 ? 'carta' : 'cartas'} na fila${n < ICONS_MAX ? ' · cabem mais ' + (ICONS_MAX - n) : ''}`
        : 'escolha de 2 a 5 cartas';
    t.classList.toggle('ok', n >= ICONS_MIN);
  }
  const emit = () => onChange({ kit: 'icons', ids: ids.slice() });

  function onHand(e: MouseEvent): void {
    const b = (e.target as Element).closest<HTMLElement>('.pc-ki-card');
    if (!b) return;
    const id = Number(b.dataset.id);
    if (ids.includes(id)) ids = ids.filter((x) => x !== id);
    else if (ids.length >= ICONS_MAX) {
      b.classList.remove('shake');
      void b.offsetWidth;
      b.classList.add('shake');
      t.textContent = 'no máximo 5 cartas';
      return;
    } else ids = [...ids, id];
    render();
    emit();
  }
  /** Fenda mais perto do ponteiro (as 5 fendas ficam sempre no mesmo lugar). */
  function slotAt(x: number): number {
    let best = 0, d = Infinity;
    [...row.children].forEach((c, k) => {
      const r = c.getBoundingClientRect(), dd = Math.abs(r.left + r.width / 2 - x);
      if (dd < d) {
        d = dd;
        best = k;
      }
    });
    return Math.min(best, ids.length - 1);
  }
  function onDown(e: PointerEvent): void {
    const target = e.target as Element;
    const x = target.closest<HTMLElement>('.pc-ki-x');
    if (x) {
      ids = ids.filter((v) => v !== Number(x.dataset.x));
      render();
      emit();
      return;
    }
    const c = target.closest<HTMLElement>('.pc-ki-card');
    if (!c) return;
    e.preventDefault();
    drag = { id: Number(c.dataset.id), pid: e.pointerId, x0: e.clientX, moved: false };
    row.setPointerCapture(e.pointerId);
  }
  function onMove(e: PointerEvent): void {
    if (!drag || e.pointerId !== drag.pid) return;
    if (!drag.moved) {
      if (Math.abs(e.clientX - drag.x0) < 4) return;
      drag.moved = true;
      render();
    }
    const to = slotAt(e.clientX), from = ids.indexOf(drag.id);
    if (to === from) return;
    ids.splice(from, 1);
    ids.splice(to, 0, drag.id);
    render();
    emit();
  }
  function onUp(e: PointerEvent): void {
    if (!drag || e.pointerId !== drag.pid) return;
    const was = drag.moved;
    drag = null;
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

/**
 * As cartas da fila lado a lado, centralizadas na folha. O `.pc-ki-show` é um contêiner de tamanho dentro do próprio
 * `el`: o tamanho das cartas e o vão entre elas saem do `el`, não da janela.
 */
function show(el: HTMLElement, work: WorkOf<'icons'>): void {
  injectCSS();
  const ids = (work?.ids ?? []).filter(validId);
  el.innerHTML = `<div class="pc-ki-show">${ids
    .map((id, k) => `<div class="pc-ki-card" style="transform:rotate(${TILT[k % TILT.length]}deg)"><i class="${iconClass(id)}"></i></div>`)
    .join('')}</div>`;
}

export const icons: KitModule<'icons'> = { build, show };
