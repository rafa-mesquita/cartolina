import { DOT_LINES_MAX, DOTS_MAX, type WorkOf } from '@cartolina/shared';
import type { KitModule } from './types';

/* Kit "pontos e linhas": até 5 pontos na folha e até 10 linhas entre eles.
   Obra = {kit:'dots', points:[x,y][] (0–1, relativos à folha 4:3), lines:[i,j][] (índices de points, sem repetir)}. */

type Work = WorkOf<'dots'>;

const NS = 'http://www.w3.org/2000/svg';
const W = 400, H = 300, R = 10; // folha em unidades do viewBox (4:3); raio do ponto
const INK = '#3b2f2f', BLUE = '#2f5aa8';

const CSS = `
.pc-kd{position:absolute;inset:0;container-type:size;font-family:var(--ui)}
.pc-kd svg{position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none;cursor:crosshair}
.pc-kd svg circle{cursor:grab}
.pc-kd-st{position:absolute;left:3cqw;right:15cqw;bottom:2.4cqw;pointer-events:none;font:700 3cqw/1.1 var(--ui);color:var(--ink-soft)}
.pc-kd-st small{display:block;margin-top:1cqw;font:500 2cqw/1.35 var(--ui)}
.pc-kd-clr{position:absolute;right:2.4cqw;bottom:2.4cqw;padding:.9cqw 2.2cqw;border-radius:999px;border:1px solid var(--edge);background:var(--paper);
  font:700 2.2cqw/1 var(--ui);color:var(--ink-soft);box-shadow:0 1px 2px rgba(59,47,47,.2)}
.pc-kd-clr:hover{color:var(--blue);border-color:var(--blue)}
.pc-kd-show{position:absolute;inset:0;width:100%;height:100%;display:block}`;

function injectCSS(): void {
  if (document.getElementById('pc-kit-dots-css')) return;
  const s = document.createElement('style');
  s.id = 'pc-kit-dots-css';
  s.textContent = CSS;
  document.head.appendChild(s);
}
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const r3 = (v: number) => Math.round(v * 1000) / 1000;
const key = (a: number, b: number) => (a < b ? `${a}-${b}` : `${b}-${a}`);
const okPoint = (p: unknown): p is [number, number] =>
  Array.isArray(p) && p.length === 2 && p.every((v) => typeof v === 'number' && v >= 0 && v <= 1);
const ends = (k: string): [number, number] => k.split('-').map(Number) as [number, number];

interface Dot {
  id: number;
  x: number;
  y: number;
}

function build(el: HTMLElement, work: Work | null, onChange: (work: Work) => void) {
  injectCSS();
  // estado interno com ids estáveis; a obra usa índices (recalculados a cada mudança)
  let nextId = 0, pts: Dot[] = [], lines: string[] = [], sel: number | null = null, msg = '';
  let drag: { p: Dot; pid: number; x0: number; y0: number; moved: boolean } | null = null;
  let lastTap: { id: number; t: number } | null = null;
  if (work && Array.isArray(work.points)) {
    pts = work.points.filter(okPoint).slice(0, DOTS_MAX).map(([x, y]) => ({ id: nextId++, x: x * W, y: y * H }));
    for (const [a, b] of work.lines ?? []) {
      const A = pts[a], B = pts[b];
      if (a === b || !A || !B) continue;
      const k = key(A.id, B.id);
      if (!lines.includes(k) && lines.length < DOT_LINES_MAX) lines.push(k);
    }
  }
  el.innerHTML = `<div class="pc-kd"><svg viewBox="0 0 ${W} ${H}" xmlns="${NS}"></svg><div class="pc-kd-st"></div><button class="pc-kd-clr">limpar</button></div>`;
  const svg = el.querySelector('svg')!;
  const st = el.querySelector<HTMLElement>('.pc-kd-st')!;
  const clr = el.querySelector<HTMLElement>('.pc-kd-clr')!;

  const toWork = (): Work => ({
    kit: 'dots',
    points: pts.map((p) => [r3(p.x / W), r3(p.y / H)] as [number, number]),
    lines: lines.map((k) => ends(k).map((id) => pts.findIndex((p) => p.id === id)) as [number, number]),
  });
  const emit = () => onChange(toWork());

  function render(): void {
    let h = '';
    for (const k of lines) {
      const [a, b] = ends(k), A = pts.find((p) => p.id === a)!, B = pts.find((p) => p.id === b)!;
      h += `<line x1="${A.x}" y1="${A.y}" x2="${B.x}" y2="${B.y}" stroke="${INK}" stroke-width="4" stroke-linecap="round"/>`;
    }
    for (const p of pts) {
      const on = sel === p.id;
      h += `<circle data-id="${p.id}" cx="${p.x}" cy="${p.y}" r="${on ? R + 3 : R}" fill="${on ? '#5d82c7' : BLUE}" stroke="${on ? '#1d3c75' : 'rgba(59,47,47,.25)'}" stroke-width="${on ? 2.5 : 1}"/>`;
    }
    svg.innerHTML = h;
    const left = DOTS_MAX - pts.length;
    const main =
      msg ||
      (sel !== null
        ? 'agora clique em outro ponto pra ligar'
        : left
          ? `clique na folha pra pôr um ponto (${left} ${left === 1 ? 'restante' : 'restantes'})`
          : `5 pontos usados · ${lines.length} ${lines.length === 1 ? 'linha' : 'linhas'}`);
    st.innerHTML = `${main}<small>clique num ponto e depois em outro pra ligar ou desligar · arraste pra mover · clique duplo apaga</small>`;
    msg = '';
  }
  /** Ponteiro em unidades do viewBox, preso dentro da folha. */
  function sp(e: PointerEvent): { x: number; y: number } {
    const m = svg.getScreenCTM()!;
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    return { x: clamp(p.x, R, W - R), y: clamp(p.y, R, H - R) };
  }
  function onDown(e: PointerEvent): void {
    if (e.button !== undefined && e.button !== 0) return;
    const c = (e.target as Element).closest<SVGElement>('circle[data-id]');
    if (c) {
      e.preventDefault();
      const p = pts.find((q) => q.id === Number(c.dataset.id))!;
      const q = sp(e);
      drag = { p, pid: e.pointerId, x0: q.x, y0: q.y, moved: false };
      svg.setPointerCapture(e.pointerId);
      return;
    }
    if (sel !== null) {
      sel = null;
      render();
      return;
    }
    if (pts.length >= DOTS_MAX) {
      msg = 'já tem 5 pontos (clique duplo apaga um)';
      render();
      return;
    }
    const q = sp(e);
    pts.push({ id: nextId++, x: q.x, y: q.y });
    render();
    emit();
  }
  function onMove(e: PointerEvent): void {
    if (!drag || e.pointerId !== drag.pid) return;
    const q = sp(e);
    if (!drag.moved && Math.hypot(q.x - drag.x0, q.y - drag.y0) <= 3) return;
    drag.moved = true;
    drag.p.x = q.x;
    drag.p.y = q.y;
    render();
    emit();
  }
  function onUp(e: PointerEvent): void {
    if (!drag || e.pointerId !== drag.pid) return;
    const { p, moved } = drag;
    drag = null;
    if (moved) return;
    const now = performance.now();
    // clique duplo = dois toques seguidos no mesmo ponto (o 1º seleciona); feito à mão porque o redesenho troca os círculos
    if (sel === p.id && lastTap && lastTap.id === p.id && now - lastTap.t < 400) {
      lastTap = null;
      remove(p.id);
      return;
    }
    lastTap = null;
    if (sel === null) {
      sel = p.id;
      lastTap = { id: p.id, t: now };
    } else if (sel === p.id) sel = null;
    else {
      const k = key(sel, p.id);
      if (lines.includes(k)) lines = lines.filter((x) => x !== k);
      else if (lines.length >= DOT_LINES_MAX) msg = 'no máximo 10 linhas';
      else lines = [...lines, k];
      sel = null;
      render();
      emit();
      return;
    }
    render();
  }
  function remove(id: number): void {
    pts = pts.filter((q) => q.id !== id);
    lines = lines.filter((k) => !ends(k).includes(id));
    sel = null;
    render();
    emit();
  }
  function onClear(): void {
    if (!pts.length) return;
    pts = [];
    lines = [];
    sel = null;
    render();
    emit();
  }
  function stop(e: Event): void {
    e.stopPropagation();
  }

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
function show(el: HTMLElement, work: Work): void {
  injectCSS();
  const points = (work?.points ?? []).filter(okPoint).map(([x, y]) => [x * W, y * H] as const);
  let h = `<svg class="pc-kd-show" viewBox="0 0 ${W} ${H}" xmlns="${NS}">`;
  for (const [a, b] of work?.lines ?? []) {
    const A = points[a], B = points[b];
    if (!A || !B) continue;
    h += `<line x1="${A[0]}" y1="${A[1]}" x2="${B[0]}" y2="${B[1]}" stroke="${INK}" stroke-width="4" stroke-linecap="round"/>`;
  }
  for (const [x, y] of points) h += `<circle cx="${x}" cy="${y}" r="${R}" fill="${BLUE}" stroke="rgba(59,47,47,.25)" stroke-width="1"/>`;
  el.innerHTML = h + '</svg>';
}

export const dots: KitModule<'dots'> = { build, show };
