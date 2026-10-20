/*
 * Efeitos do Tatubum (spec §5.5): voo de carta, carimbo, tremor, flash, texto que pula e partículas em pixel.
 * Tudo em coordenadas do palco (1440×900). Com prefers-reduced-motion: sem tremor, flash nem partículas; voos instantâneos.
 * Porte de `prototipo/tatubum/fx.js`.
 */
import { Sound } from './sounds';

/** Ponto em coordenadas do palco. */
export interface Point {
  x: number;
  y: number;
}
/** Ponto, ou elemento (usa o centro dele). */
export type At = Element | Point;

/** Centro e tamanho de um elemento, em coordenadas do palco. */
export interface Box extends Point {
  w: number;
  h: number;
}

interface Particle extends Point {
  vx: number;
  vy: number;
  grav: number;
  drag: number;
  life: number;
  max: number;
  size: number;
  shrink: boolean;
  color: string;
}

interface BurstOpts {
  colors: string[];
  count?: number;
  speed?: number;
  grav?: number;
  drag?: number;
  life?: number;
  size?: number;
  spread?: number;
  dir?: number;
  shrink?: boolean;
}

const PX = 4; // tamanho do "pixel" das partículas no palco

/** O movimento reduzido é lido na hora (a preferência pode mudar com a página aberta). */
const reduced = (): boolean => typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

let stage: HTMLElement | null = null;
let layer: HTMLElement | null = null;
let canvas: HTMLCanvasElement | null = null;
let g: CanvasRenderingContext2D | null = null;
let scaleOf: () => number = () => 1;
const parts: Particle[] = [];
let raf = 0;

const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

function need<T>(v: T | null, what: string): T {
  if (!v) throw new Error(`Fx.init() não foi chamado (${what})`);
  return v;
}

/** Centro e tamanho de um elemento, em coordenadas do palco. */
function box(el: Element): Box {
  const s = scaleOf();
  const r = el.getBoundingClientRect();
  const st = need(stage, 'palco').getBoundingClientRect();
  return { x: (r.left - st.left) / s + r.width / s / 2, y: (r.top - st.top) / s + r.height / s / 2, w: r.width / s, h: r.height / s };
}
const pointOf = (p: At): Point => (p instanceof Element ? box(p) : p);

function tick(): void {
  if (!g || !canvas) {
    raf = 0;
    return;
  }
  g.clearRect(0, 0, canvas.width, canvas.height);
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i]!;
    p.life -= 1;
    if (p.life <= 0) { parts.splice(i, 1); continue; }
    p.vx *= p.drag; p.vy = p.vy * p.drag + p.grav;
    p.x += p.vx; p.y += p.vy;
    g.fillStyle = p.color;
    const sz = p.size * (p.shrink ? Math.max(0.3, p.life / p.max) : 1);
    g.fillRect(Math.round(p.x / PX), Math.round(p.y / PX), Math.max(1, Math.round(sz)), Math.max(1, Math.round(sz)));
  }
  raf = parts.length ? requestAnimationFrame(tick) : 0;
}

function spawn(list: Particle[]): void {
  if (reduced() || !g) return;
  parts.push(...list);
  if (!raf) raf = requestAnimationFrame(tick);
}

function burst(at: At, { colors, count = 24, speed = 6, grav = 0.25, drag = 0.96, life = 40, size = 1, spread = Math.PI * 2, dir = -Math.PI / 2, shrink = true }: BurstOpts): void {
  const c = pointOf(at);
  spawn(Array.from({ length: count }, () => {
    const a = dir + (Math.random() - 0.5) * spread;
    const v = speed * (0.4 + Math.random() * 0.8);
    const l = life * (0.6 + Math.random() * 0.6);
    return { x: c.x, y: c.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, grav, drag, life: l, max: l, size, shrink, color: colors[Math.floor(Math.random() * colors.length)]! };
  }));
}

/**
 * Anima e espera terminar. Com a aba escondida o navegador congela as animações (e o `finished` nunca chega),
 * então ali a animação é instantânea, e sempre há um tempo-limite pra fila de efeitos nunca travar.
 */
function animate(el: Element, frames: Keyframe[], opts: KeyframeAnimationOptions): Promise<unknown> {
  if (reduced() || document.hidden) opts = { ...opts, duration: 1 };
  // Sem Web Animations (ex.: jsdom) não há o que esperar.
  if (typeof el.animate !== 'function') return Promise.resolve();
  const a = el.animate(frames, { fill: 'forwards', ...opts });
  return Promise.race([a.finished.catch(() => {}), wait((Number(opts.duration) || 0) + 150)]);
}

export interface FlyOpts {
  /** O elemento que voa (carta ou verso). */
  node: HTMLElement;
  from: At;
  to: At;
  dur?: number;
  rot?: number;
  scaleFrom?: number;
  scaleTo?: number;
  /** Troca o conteúdo no meio do voo, virando a carta. */
  flipTo?: HTMLElement | null;
  /** Cor do rastro de partículas. */
  trail?: string | null;
}

/** Carimbo por cima de `el` (Nem vem!): cai grande, bate e fica. */
async function stamp(el: Element, text: string, color = '#e4572e'): Promise<void> {
  const c = box(el);
  const s = document.createElement('div');
  s.className = 'stamp';
  s.textContent = text;
  s.style.color = color;
  s.style.left = c.x + 'px';
  s.style.top = c.y + 'px';
  need(layer, 'camada').appendChild(s);
  await animate(s, [{ transform: 'translate(-50%,-50%) rotate(-14deg) scale(2.6)', opacity: 0 }, { transform: 'translate(-50%,-50%) rotate(-10deg) scale(1)', opacity: 1 }], { duration: 220, easing: 'steps(5, end)' });
  shake(160, 5);
  burst(c, { colors: [color, '#fff3e0'], count: 14, speed: 5, grav: 0.1, life: 18 });
  await wait(650);
  await animate(s, [{ opacity: 1 }, { opacity: 0 }], { duration: 200, easing: 'steps(4, end)' });
  s.remove();
}

function shake(ms = 300, px = 8): void {
  const st = need(stage, 'palco');
  if (reduced() || typeof st.animate !== 'function') return;
  st.animate(
    Array.from({ length: 8 }, (_, i) => ({ translate: i === 7 ? '0 0' : `${(Math.random() - 0.5) * 2 * px}px ${(Math.random() - 0.5) * 2 * px}px` })),
    { duration: ms, easing: 'steps(8, end)' },
  );
}

export const Fx = {
  /** Preferência de movimento reduzido (lida na hora). */
  get REDUCED(): boolean {
    return reduced();
  },
  wait,
  box,
  /** Liga os efeitos ao palco: `getScale` devolve a escala atual do palco (palco 1440×900 → tela). */
  init(stageEl: HTMLElement, layerEl: HTMLElement, particleCanvas: HTMLCanvasElement, getScale: () => number): void {
    stage = stageEl;
    layer = layerEl;
    canvas = particleCanvas;
    canvas.width = 1440 / PX;
    canvas.height = 900 / PX;
    g = canvas.getContext('2d');
    scaleOf = getScale;
  },
  /** Desliga (ao desmontar a mesa): para as partículas e solta o palco. */
  dispose(): void {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    parts.length = 0;
    stage = layer = canvas = g = null;
    scaleOf = () => 1;
  },

  /**
   * Carta voando de `from` pra `to` (elementos ou pontos do palco). `node` é o elemento que voa (carta ou verso);
   * `flipTo` (opcional) troca o conteúdo no meio do voo, virando a carta.
   */
  async fly({ node, from, to, dur = 520, rot = 0, scaleFrom = 1, scaleTo = 1, flipTo = null, trail = null }: FlyOpts): Promise<void> {
    const a = pointOf(from), b = pointOf(to);
    node.classList.add('flying');
    need(layer, 'camada').appendChild(node);
    const tf = (p: Point, r: number, s: number, sx = 1) => `translate(${p.x}px, ${p.y}px) translate(-50%, -50%) rotate(${r}deg) scale(${s * sx}, ${s})`;
    const mid = { x: (a.x + b.x) / 2, y: Math.min(a.y, b.y) - 40 };
    const steps = 'steps(16, end)';
    if (trail) {
      const iv = setInterval(() => {
        const c = box(node);
        spawn([{ x: c.x, y: c.y, vx: 0, vy: 0, grav: 0, drag: 1, life: 14, max: 14, size: 2, shrink: true, color: trail }]);
      }, 30);
      setTimeout(() => clearInterval(iv), dur);
    }
    if (flipTo) {
      await animate(node, [{ transform: tf(a, 0, scaleFrom) }, { transform: tf(mid, rot / 2, (scaleFrom + scaleTo) / 2, 0.02) }], { duration: dur / 2, easing: steps });
      node.replaceChildren(...flipTo.childNodes);
      node.className = flipTo.className + ' flying';
      await animate(node, [{ transform: tf(mid, rot / 2, (scaleFrom + scaleTo) / 2, 0.02) }, { transform: tf(b, rot, scaleTo) }], { duration: dur / 2, easing: steps });
    } else {
      await animate(node, [{ transform: tf(a, 0, scaleFrom) }, { transform: tf(mid, rot / 2, (scaleFrom + scaleTo) / 2) }, { transform: tf(b, rot, scaleTo) }], { duration: dur, easing: steps });
    }
    node.remove();
  },

  stamp,

  /** Texto grande que pula (BUM!, UFA!, VENCEU!). */
  async pop(text: string, at: At, { color = '#f2c14e', size = 120, hold = 900 }: { color?: string; size?: number; hold?: number } = {}): Promise<void> {
    const c = pointOf(at);
    const t = document.createElement('div');
    t.className = 'pop';
    t.textContent = text;
    t.style.color = color;
    t.style.fontSize = size + 'px';
    t.style.left = c.x + 'px';
    t.style.top = c.y + 'px';
    need(layer, 'camada').appendChild(t);
    await animate(t, [{ transform: 'translate(-50%,-50%) scale(0.2) rotate(-8deg)' }, { transform: 'translate(-50%,-50%) scale(1.25) rotate(-6deg)' }, { transform: 'translate(-50%,-50%) scale(1) rotate(-6deg)' }], { duration: 300, easing: 'steps(6, end)' });
    await wait(hold);
    await animate(t, [{ opacity: 1 }, { opacity: 0 }], { duration: 250, easing: 'steps(5, end)' });
    t.remove();
  },

  /** Um sprite que pula e some (ex.: o olho do Espiar em cima do monte). */
  async icon(url: string, at: At, { size = 96, hold = 700 }: { size?: number; hold?: number } = {}): Promise<void> {
    const c = pointOf(at);
    const img = document.createElement('img');
    img.src = url;
    img.className = 'pop';
    img.style.width = size + 'px';
    img.style.left = c.x + 'px';
    img.style.top = c.y + 'px';
    need(layer, 'camada').appendChild(img);
    await animate(img, [{ transform: 'translate(-50%,-50%) scale(0.2)' }, { transform: 'translate(-50%,-50%) scale(1.2)' }, { transform: 'translate(-50%,-50%) scale(1)' }], { duration: 260, easing: 'steps(5, end)' });
    await animate(img, [{ transform: 'translate(-50%,-50%) scaleY(1)' }, { transform: 'translate(-50%,-50%) scaleY(0.1)' }, { transform: 'translate(-50%,-50%) scaleY(1)' }], { duration: 240, easing: 'steps(4, end)' });
    await wait(hold);
    await animate(img, [{ opacity: 1 }, { opacity: 0 }], { duration: 200, easing: 'steps(4, end)' });
    img.remove();
  },

  /** Um X vermelho em cima de `el` (jogada cancelada). */
  async cross(el: Element): Promise<void> {
    const c = box(el);
    const x = document.createElement('div');
    x.className = 'cross';
    x.style.left = c.x + 'px';
    x.style.top = c.y + 'px';
    need(layer, 'camada').appendChild(x);
    await animate(x, [{ transform: 'translate(-50%,-50%) scale(2)', opacity: 0 }, { transform: 'translate(-50%,-50%) scale(1)', opacity: 1 }], { duration: 180, easing: 'steps(4, end)' });
    await wait(450);
    x.remove();
  },

  shake,

  flash(color = '#ffffff', ms = 160): void {
    if (reduced()) return;
    const f = document.createElement('div');
    f.className = 'flash';
    f.style.background = color;
    need(layer, 'camada').appendChild(f);
    void animate(f, [{ opacity: 0.85 }, { opacity: 0 }], { duration: ms, easing: 'steps(4, end)' }).then(() => f.remove());
  },

  /** Golpe de espada (Ataque): um risco diagonal de pixels. */
  slash(at: At): void {
    const c = pointOf(at);
    if (reduced()) return;
    const list: Particle[] = [];
    for (let i = 0; i < 26; i++) {
      list.push({ x: c.x - 90 + i * 7, y: c.y - 70 + i * 5.5, vx: 0.4, vy: 0.3, grav: 0, drag: 1, life: 10 + i * 0.6, max: 26, size: 3, shrink: true, color: i % 3 ? '#d9e2ec' : '#ffffff' });
    }
    spawn(list);
  },

  sparks(at: At): void { burst(at, { colors: ['#f2c14e', '#fff3c4', '#e4572e'], count: 10, speed: 4, grav: 0.18, life: 22, dir: -Math.PI / 2, spread: 1.6 }); },
  hearts(at: At): void { burst(at, { colors: ['#ff8fab', '#e0567a', '#ffe1ea'], count: 26, speed: 4, grav: -0.05, drag: 0.97, life: 55, size: 2, dir: -Math.PI / 2, spread: 2.2 }); },
  glitter(at: At, color = '#7fd8d8'): void { burst(at, { colors: [color, '#ffffff'], count: 18, speed: 3, grav: -0.02, life: 30, size: 1 }); },
  boom(at: At): void {
    burst(at, { colors: ['#e4572e', '#f2c14e', '#fff3c4', '#2b1a10', '#a0703f'], count: 90, speed: 12, grav: 0.3, drag: 0.94, life: 60, size: 3 });
    burst(at, { colors: ['#3b3b4f', '#5a5a70'], count: 30, speed: 4, grav: -0.08, drag: 0.95, life: 80, size: 4 });
  },
  fireworks(at: At): void {
    const c = pointOf(at);
    const palette = [['#f2c14e', '#fff3c4'], ['#e4572e', '#ffb199'], ['#7fd8d8', '#ffffff'], ['#ff8fab', '#ffe1ea'], ['#9ee37d', '#ffffff']];
    for (let i = 0; i < 7; i++) {
      setTimeout(() => {
        if (!g) return; // a mesa fechou antes do rojão
        burst({ x: c.x + (Math.random() - 0.5) * 520, y: c.y - 60 - Math.random() * 220 }, { colors: palette[i % palette.length]!, count: 46, speed: 7, grav: 0.12, drag: 0.95, life: 50, size: 2 });
        Sound.play('tic');
      }, i * 260);
    }
  },
};
