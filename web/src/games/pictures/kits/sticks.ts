import { STICKS, type WorkOf } from '@cartolina/shared';
import type { KitModule } from './types';

/* Kit "palitos e pedras": 4 palitos + 4 pedras soltos sobre a folha; o que fica fora dela está guardado na gaveta.
   Obra = {kit:'sticks', sticks:{x,y,rot}[4], stones:{x,y,rot}[4]}: centro da peça relativo à folha 4:3
   (0–1 = na folha; fora disso, até −0,5/1,5, = guardada) e giro em graus. */

type Work = WorkOf<'sticks'>;
interface Piece {
  x: number;
  y: number;
  rot: number;
}

const NS = 'http://www.w3.org/2000/svg';
const W = 400, H = 300; // folha em unidades do viewBox (4:3)
// a bancada é mais larga que a folha: à direita fica a gaveta, embaixo as dicas (a caixa toda continua 4:3)
const VB = { x: -14, y: -52, w: 612, h: 459 };
const DRAWER = { x: 412, y: 0, w: 178, h: 300 };
const STICK_L = 0.3 * W, STICK_T = 0.018 * W;
const STONE_R = (
  [
    [0.045, 0.035],
    [0.035, 0.03],
    [0.05, 0.038],
    [0.03, 0.026],
  ] as const
).map(([a, b]) => [a * W, b * W] as const);
const WOOD = ['#BA7517', '#633806'], ROCK = ['#888780', '#444441'], BLUE = '#2f5aa8';
// começam guardadas: palitos deitados empilhados, pedras embaixo deles
const START: { sticks: Piece[]; stones: Piece[] } = {
  sticks: [0.13, 0.25, 0.37, 0.49].map((y) => ({ x: 1.25, y, rot: 0 })),
  stones: (
    [
      [1.13, 0.68],
      [1.33, 0.7],
      [1.15, 0.88],
      [1.35, 0.9],
    ] as const
  ).map(([x, y]) => ({ x, y, rot: 0 })),
};
// o centro da peça fica sempre dentro da caixa visível (e dentro do −0,5/1,5 do schema)
export const LIM = { x0: (VB.x + 8) / W, x1: (VB.x + VB.w - 8) / W, y0: (VB.y + 8) / H, y1: (VB.y + VB.h - 8) / H };
const HANDLE = 62, KNOB = 10, WHEEL_STEP = 15;

const CSS = `
.pc-ks{position:absolute;inset:0;container-type:size;font-family:var(--ui)}
.pc-ks svg{position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none}
.pc-ks-p{cursor:grab;filter:drop-shadow(0 1px 1px rgba(59,47,47,.35))}
.pc-ks-p.on{filter:drop-shadow(0 2px 3px rgba(59,47,47,.45))}
.pc-ks.drag,.pc-ks.drag .pc-ks-p{cursor:grabbing}
.pc-ks-knob{cursor:alias}
.pc-ks-hd line,.pc-ks-hd circle:not(.pc-ks-knob){pointer-events:none}
.pc-ks-lab{font:700 17px var(--ui);fill:var(--ink-soft)}
.pc-ks-st{font:700 18px var(--ui);fill:var(--ink-soft)}
.pc-ks-st.ok{fill:var(--ok)}
.pc-ks-tip{font:500 12.5px var(--ui);fill:var(--ink-soft)}
.pc-ks-show{position:absolute;inset:0;width:100%;height:100%;display:block}
.pc-ks-show .pc-ks-p{cursor:default}`;

function injectCSS(): void {
  if (document.getElementById('pc-kit-sticks-css')) return;
  const s = document.createElement('style');
  s.id = 'pc-kit-sticks-css';
  s.textContent = CSS;
  document.head.appendChild(s);
}
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const r3 = (v: number) => Math.round(v * 1000) / 1000;
const norm = (deg: number) => ((Math.round(deg) % 360) + 360) % 360;
const okNum = (v: unknown, a: number, b: number): v is number =>
  typeof v === 'number' && Number.isFinite(v) && v >= a && v <= b;
const onSheet = (q: Piece) => q.x >= 0 && q.x <= 1 && q.y >= 0 && q.y <= 1;

/** Desenho de uma peça centrada na origem (o <g> de fora posiciona e gira). */
function stickSVG(): string {
  const l = STICK_L, t = STICK_T;
  return (
    `<rect x="${-l / 2}" y="${-t / 2}" width="${l}" height="${t}" rx="${t / 2}" fill="${WOOD[0]}" stroke="${WOOD[1]}" stroke-width="1"/>` +
    `<line x1="${-l / 2 + 6}" y1="${-t / 6}" x2="${l / 2 - 10}" y2="${-t / 6}" stroke="rgba(255,236,200,.35)" stroke-width="1.1" stroke-linecap="round"/>`
  );
}
function stoneSVG(i: number): string {
  const [a, b] = STONE_R[i]!;
  return (
    `<ellipse rx="${a}" ry="${b}" fill="${ROCK[0]}" stroke="${ROCK[1]}" stroke-width="1"/>` +
    `<ellipse cx="${-a * 0.3}" cy="${-b * 0.35}" rx="${a * 0.38}" ry="${b * 0.26}" fill="rgba(255,255,255,.16)"/>`
  );
}
const at = (q: Piece) => `translate(${q.x * W} ${q.y * H}) rotate(${q.rot})`;

/** Pedras embaixo, palitos por cima: a ordem de quem não mexeu em nada (índices de [...palitos, ...pedras]). */
const BASE_ORDER = [4, 5, 6, 7, 0, 1, 2, 3];
/** Quem fica por cima, do fundo pra frente; ordem inválida (ou de obra antiga, sem ela) volta pra de sempre. */
function readOrder(order: readonly number[] | undefined): number[] {
  const n = BASE_ORDER.length;
  const ok = Array.isArray(order) && order.length === n && new Set(order).size === n && order.every((i) => Number.isInteger(i) && i >= 0 && i < n);
  return ok ? [...order] : [...BASE_ORDER];
}

/** Lê uma lista de peças da obra; peça inválida volta pro lugar inicial da gaveta. */
function readPieces(list: readonly Piece[] | null | undefined, start: readonly Piece[]): Piece[] {
  return start.map((s, i) => {
    const q = Array.isArray(list) ? list[i] : null;
    return q && okNum(q.x, -0.5, 1.5) && okNum(q.y, -0.5, 1.5) && okNum(q.rot, -3600, 3600)
      ? { x: q.x, y: q.y, rot: norm(q.rot) }
      : { ...s };
  });
}

function build(el: HTMLElement, work: Work | null, onChange: (work: Work) => void) {
  injectCSS();
  const ok = work?.kit === 'sticks';
  // peças 0–3 = palitos, 4–7 = pedras (mesma ordem da obra)
  const pcs = [
    ...readPieces(ok ? work.sticks : null, START.sticks),
    ...readPieces(ok ? work.stones : null, START.stones),
  ];
  // a última peça escolhida fica por cima, na montagem e na obra (o print desenha nessa ordem)
  const order = readOrder(ok ? work.order : undefined);
  let sel = -1;
  let drag: { i: number; pid: number; ox: number; oy: number; moved: boolean } | null = null;
  let turn: { pid: number; moved: boolean } | null = null;

  el.innerHTML = `<div class="pc-ks"><svg viewBox="${VB.x} ${VB.y} ${VB.w} ${VB.h}" xmlns="${NS}">
      <rect x="${VB.x}" y="${VB.y}" width="${VB.w}" height="${VB.h}" fill="rgba(234,219,192,.55)"/>
      <rect x="${DRAWER.x}" y="${DRAWER.y}" width="${DRAWER.w}" height="${DRAWER.h}" rx="10" fill="rgba(211,191,153,.45)" stroke="rgba(125,106,88,.45)" stroke-width="1.2" stroke-dasharray="5 4"/>
      <rect x="0" y="0" width="${W}" height="${H}" fill="#fbf7ef" stroke="#d3bf99" stroke-width="1.2" style="filter:drop-shadow(0 1px 2px rgba(59,47,47,.25))"/>
      <text class="pc-ks-lab" x="2" y="-16">folha</text><text class="pc-ks-lab" x="${DRAWER.x + 4}" y="-16">gaveta</text>
      <g class="pc-ks-layer"></g>
      <text class="pc-ks-st" x="2" y="${H + 34}"></text>
      <text class="pc-ks-tip" x="2" y="${H + 60}">arraste as peças pra folha · clique numa peça e gire pela alça azul (ou pela rodinha)</text>
      <text class="pc-ks-tip" x="2" y="${H + 80}">o que ficar fora da folha está guardado e não aparece na obra · clique no vazio pra soltar</text>
    </svg></div>`;
  const root = el.querySelector<HTMLElement>('.pc-ks')!;
  const svg = el.querySelector('svg')!;
  const layer = el.querySelector<SVGGElement>('.pc-ks-layer')!;
  const st = el.querySelector<SVGTextElement>('.pc-ks-st')!;

  const gs = pcs.map((_, i) => {
    const g = document.createElementNS(NS, 'g');
    g.setAttribute('class', 'pc-ks-p');
    g.dataset.i = String(i);
    g.innerHTML = i < STICKS ? stickSVG() : stoneSVG(i - STICKS);
    return g;
  });
  for (const i of order) layer.appendChild(gs[i]!);
  const hd = document.createElementNS(NS, 'g');
  hd.setAttribute('class', 'pc-ks-hd');
  hd.style.display = 'none';
  hd.innerHTML =
    `<line x1="0" y1="0" x2="0" y2="${-HANDLE}" stroke="${BLUE}" stroke-width="1.8" stroke-dasharray="4 4"/>` +
    `<circle class="pc-ks-knob" cy="${-HANDLE}" r="${KNOB}" fill="${BLUE}" stroke="#fbf7ef" stroke-width="2"/><circle r="3.5" fill="${BLUE}"/>`;
  layer.appendChild(hd);

  const toWork = (): Work => ({
    kit: 'sticks',
    sticks: pcs.slice(0, STICKS).map((q) => ({ x: r3(q.x), y: r3(q.y), rot: q.rot })),
    stones: pcs.slice(STICKS).map((q) => ({ x: r3(q.x), y: r3(q.y), rot: q.rot })),
    order: [...order],
  });
  const emit = () => onChange(toWork());

  function put(i: number): void {
    gs[i]!.setAttribute('transform', at(pcs[i]!));
    if (i === sel) hd.setAttribute('transform', at(pcs[i]!));
  }
  function status(): void {
    const n = pcs.filter(onSheet).length;
    st.textContent = n ? `na folha: ${n} de 8 ${n === 1 ? 'peça' : 'peças'}` : 'tudo na gaveta: arraste uma peça pra folha';
    st.classList.toggle('ok', n > 0);
  }
  /** Escolhe a peça `i` (−1 = nenhuma) e sobe ela pro topo; diz se a ordem de quem fica por cima mudou. */
  function choose(i: number): boolean {
    if (sel >= 0) gs[sel]!.classList.remove('on');
    sel = i;
    hd.style.display = i >= 0 ? '' : 'none';
    if (i >= 0) {
      gs[i]!.classList.add('on');
      layer.appendChild(gs[i]!);
      layer.appendChild(hd);
      put(i);
      if (order[order.length - 1] !== i) {
        order.splice(order.indexOf(i), 1);
        order.push(i);
        return true;
      }
    }
    return false;
  }
  /** Ponteiro em unidades do viewBox. */
  function sp(e: PointerEvent): { x: number; y: number } {
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(svg.getScreenCTM()!.inverse());
    return { x: p.x, y: p.y };
  }

  function onDown(e: PointerEvent): void {
    if (e.button !== undefined && e.button !== 0) return;
    const target = e.target as Element;
    if (target.closest('.pc-ks-knob') && sel >= 0) {
      e.preventDefault();
      turn = { pid: e.pointerId, moved: false };
      svg.setPointerCapture(e.pointerId);
      return;
    }
    const g = target.closest<SVGGElement>('.pc-ks-p');
    if (!g) {
      choose(-1);
      return;
    }
    e.preventDefault();
    const i = Number(g.dataset.i), q = sp(e);
    if (choose(i)) emit(); // só clicar já põe por cima (e vale na obra)
    drag = { i, pid: e.pointerId, ox: q.x - pcs[i]!.x * W, oy: q.y - pcs[i]!.y * H, moved: false };
    svg.setPointerCapture(e.pointerId);
    root.classList.add('drag');
  }
  function onMove(e: PointerEvent): void {
    if (turn && e.pointerId === turn.pid) {
      const q = sp(e), p = pcs[sel]!;
      p.rot = norm((Math.atan2(q.y - p.y * H, q.x - p.x * W) * 180) / Math.PI + 90);
      turn.moved = true;
      put(sel);
      emit();
      return;
    }
    if (!drag || e.pointerId !== drag.pid) return;
    const q = sp(e), p = pcs[drag.i]!;
    p.x = clamp((q.x - drag.ox) / W, LIM.x0, LIM.x1);
    p.y = clamp((q.y - drag.oy) / H, LIM.y0, LIM.y1);
    drag.moved = true;
    put(drag.i);
    status();
    emit();
  }
  function onUp(e: PointerEvent): void {
    if (turn && e.pointerId === turn.pid) {
      turn = null;
      return;
    }
    if (!drag || e.pointerId !== drag.pid) return;
    drag = null;
    root.classList.remove('drag');
  }
  function onWheel(e: WheelEvent): void {
    const target = e.target as Element;
    const g = target.closest<SVGGElement>('.pc-ks-p');
    const i = g ? Number(g.dataset.i) : target.closest('.pc-ks-hd') ? sel : -1;
    if (i < 0) return;
    e.preventDefault();
    if (i !== sel) choose(i);
    pcs[i]!.rot = norm(pcs[i]!.rot + (e.deltaY > 0 ? WHEEL_STEP : -WHEEL_STEP));
    put(i);
    emit();
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
function show(el: HTMLElement, work: Work): void {
  injectCSS();
  const ok = work?.kit === 'sticks';
  const pcs = ok ? [...readPieces(work.sticks, START.sticks), ...readPieces(work.stones, START.stones)] : [];
  let h = `<svg class="pc-ks-show" viewBox="0 0 ${W} ${H}" xmlns="${NS}">`;
  // na mesma ordem da montagem: quem o artista escolheu por último fica por cima
  for (const i of ok ? readOrder(work.order) : []) {
    const q = pcs[i]!;
    if (onSheet(q)) h += `<g class="pc-ks-p" transform="${at(q)}">${i < STICKS ? stickSVG() : stoneSVG(i - STICKS)}</g>`;
  }
  el.innerHTML = h + '</svg>';
}

export const sticks: KitModule<'sticks'> = { build, show };
