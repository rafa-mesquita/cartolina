import {
  CAMELIO_COLORS,
  CAMELIO_EXACT,
  camelioCard,
  type CamelioCard,
  type CamelioColor,
  type CamelioFrom,
  type CamelioView,
} from '@cartolina/shared';
import { HEX, backHtml, frontHtml } from './cardArt';
import { narrate } from './narrate';
import type { CamelioSound } from './sounds';
import type { StackLayout } from './layout';

/**
 * A virada do Cama-Leão (porta de `prototipo/cama-leao/anim.js`, sem globais).
 *
 * `playTurnAnim(root, prev, next, opts)` mostra a jogada `next.last` em cima do DOM de `prev` (a mesa parada) e
 * resolve `done` quando acabou; não muda estado de jogo. Tudo é buscado DENTRO de `root` (o palco, 1440×900 antes
 * da escala): `[data-pile="deck"|"open"] .lift > .card` (origem), `.seat[data-pid]` (dentro de `.cl-mine` = a sua
 * mesa), `.stacks`, `.stack[data-color] > .pile`, `.sum`, `.flags .flag[data-color]`, `.fans .fan[data-color]`.
 * Cria uma camada `.cl-fly` no `root`; esconde e anima elementos reais da mesa e desfaz tudo antes de resolver.
 * Teto de 4 s: se a animação não terminar (aba em segundo plano não faz quadros), encerra e resolve assim mesmo.
 * `stop()` encerra na hora (e `done` resolve). Uma virada nova no mesmo `root` encerra a anterior.
 * O CSS das classes `cl-fly`/`fly-*` está no `camelio.css` (nada de `<style>` em runtime).
 *
 * Tempos: voo 450ms (vira nos últimos 200 se veio do monte), pausa 200, e o resultado:
 * none +220 (≈0,9 s), scored +300 brilho +450 subida (≈1,45 s), bust/lost +240 tremida +450 queda (≈1,4 s).
 */

export interface AnimOptions {
  nameOf: (id: string) => string;
  say: (text: string) => void;
  sound: (name: CamelioSound) => void;
  /** Onde o clone estava na soltura (coordenadas do palco), só pra jogada sua de arrasto. */
  dropFrom?: { x: number; y: number; from: CamelioFrom } | null;
  layout: (pid: string, n: number) => StackLayout;
  /** Escala do palco (a anim converte px da tela em px do palco). */
  scale: number;
}

export interface TurnAnim {
  done: Promise<void>;
  stop(): void;
}

const FLY_MS = 450;
const FLIP_MS = 200;
const PAUSE_MS = 200;
const BOUNCE_MS = 220;
const GLOW_MS = 300;
const RISE_MS = 450;
const SHAKE_MS = 240;
const FALL_MS = 450;
const POP_MS = 200;
/** Teto: a mais longa leva ~1,45 s; sem quadros (aba escondida) o `finished` pode nunca chegar. */
const WATCHDOG_MS = 4000;
const EASE = 'cubic-bezier(.2,.8,.2,1)';
const SHADOW = '0 1px 3px rgba(31,42,74,.35)'; // a de .card
const LIFTED = '0 0 0 3px #e8b23a,0 22px 38px rgba(31,42,74,.42),0 6px 12px rgba(31,42,74,.25)'; // a do clone do arrasto
const AIR = '0 12px 20px rgba(31,42,74,.3),0 3px 6px rgba(31,42,74,.22)';
const GLOW = '0 0 0 2px #e8b23a,0 0 14px 4px rgba(232,178,58,.85)';

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}
interface Point {
  x: number;
  y: number;
}

/** A virada em curso de cada palco (uma de cada vez por palco). */
const current = new WeakMap<HTMLElement, Run>();

class Run {
  alive = true;
  readonly layer: HTMLDivElement;
  private readonly timers: ReturnType<typeof setTimeout>[] = [];
  private readonly undo: (() => void)[] = [];
  /** Animações da camada (`go`): canceladas no fim, pra nada seguir rodando num clone já removido. */
  private readonly anims: Animation[] = [];

  constructor(
    readonly root: HTMLElement,
    private readonly resolve: () => void,
  ) {
    this.layer = document.createElement('div');
    this.layer.className = 'cl-fly';
  }

  wait(ms: number): Promise<void> {
    return new Promise((res) => this.timers.push(setTimeout(res, ms)));
  }

  timer(fn: () => void, ms: number) {
    this.timers.push(setTimeout(fn, ms));
  }

  /** WAAPI com fill 'forwards' na camada da animação; a Promise nunca rejeita (cancelar é normal aqui). */
  go(el: Element, frames: Keyframe[], o: KeyframeAnimationOptions): Promise<void> {
    if (typeof el.animate !== 'function') return Promise.resolve();
    const a = el.animate(frames, { fill: 'forwards', ...o });
    this.anims.push(a);
    return Promise.resolve(a.finished).then(
      () => {},
      () => {},
    );
  }

  /** Anima um elemento de verdade da mesa: a animação sai antes do resolve (o redesenho vem logo depois). */
  goReal(el: Element, frames: Keyframe[], o: KeyframeAnimationOptions): Promise<void> {
    if (typeof el.animate !== 'function') return Promise.resolve();
    const a = el.animate(frames, { fill: 'forwards', ...o });
    this.undo.push(() => a.cancel());
    return Promise.resolve(a.finished).then(
      () => {},
      () => {},
    );
  }

  hide(el: HTMLElement) {
    const v = el.style.visibility;
    el.style.visibility = 'hidden';
    this.undo.push(() => {
      el.style.visibility = v;
    });
  }

  /** Muda um estilo de um elemento de verdade e devolve o antigo no fim. */
  setStyle(el: HTMLElement, prop: 'transformOrigin', value: string) {
    const old = el.style[prop];
    el.style[prop] = value;
    this.undo.push(() => {
      el.style[prop] = old;
    });
  }

  end() {
    if (!this.alive) return;
    this.alive = false;
    this.timers.forEach(clearTimeout);
    this.anims.forEach((a) => {
      try {
        a.cancel();
      } catch {
        /* já acabou */
      }
    });
    this.layer.remove();
    this.undo.reverse().forEach((f) => {
      try {
        f();
      } catch {
        /* o elemento já foi redesenhado */
      }
    });
    if (current.get(this.root) === this) current.delete(this.root);
    this.resolve();
  }
}

export function playTurnAnim(root: HTMLElement, prev: CamelioView, next: CamelioView, opts: AnimOptions): TurnAnim {
  current.get(root)?.end();
  let resolve!: () => void;
  const done = new Promise<void>((res) => (resolve = res));
  const run = new Run(root, resolve);
  if (!next.last) {
    run.end();
    return { done, stop: () => {} };
  }
  current.set(root, run);
  // o jogo não pode ficar preso animando: passou do teto, encerra do jeito que estiver
  run.timer(() => {
    if (run.alive) console.warn('virada passou do teto de tempo; encerrada');
    run.end();
  }, WATCHDOG_MS);
  try {
    sequence(prev, next, opts, run).then(
      () => run.end(),
      (err: unknown) => {
        console.error('virada do Cama-Leão falhou', err);
        run.end();
      },
    );
  } catch (err) {
    console.error('virada do Cama-Leão falhou', err);
    run.end();
  }
  return { done, stop: () => run.end() };
}

/** Monta tudo de forma síncrona (o clone existe já no primeiro quadro) e devolve a Promise da sequência. */
function sequence(prev: CamelioView, next: CamelioView, opts: AnimOptions, run: Run): Promise<void> {
  const last = next.last!;
  const card = camelioCard(last.card);
  const app = run.root;
  const layer = run.layer;
  const sound = (n: CamelioSound) => {
    try {
      opts.sound(n);
    } catch {
      /* som nunca derruba a jogada */
    }
  };

  /**
   * Retângulo de `el` em coordenadas do palco (antes da escala que faz o palco caber na janela).
   * A escala é medida a cada uso (um resize no meio da virada não erra o destino); `opts.scale` só vale
   * quando não dá pra medir (jsdom, palco ainda sem tamanho).
   */
  const box = (el: Element): Box => {
    const a = app.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    const measured = a.width / (app.offsetWidth || a.width);
    const scale = Number.isFinite(measured) && measured > 0 ? measured : opts.scale > 0 ? opts.scale : 1;
    return { x: (r.left - a.left) / scale, y: (r.top - a.top) / scale, w: r.width / scale, h: r.height / scale };
  };
  /** Largura de uma carta desenhada (o --w que o cardArt pôs nela). */
  const widthOf = (c: Element | null): number => {
    if (!(c instanceof HTMLElement)) return 0;
    return parseFloat(c.style.getPropertyValue('--w')) || box(c).w;
  };

  // 1. letreiro
  opts.say(narrate(last, opts.nameOf));

  app.appendChild(layer);

  // origem: a carta de lá some enquanto o clone viaja (não pode aparecer duas vezes)
  const lift = app.querySelector<HTMLElement>(`[data-pile="${last.from}"] .lift`);
  const srcCard = lift?.querySelector(':scope > .card') ?? null;
  const W0 = widthOf(srcCard) || 92;
  const drop = opts.dropFrom && opts.dropFrom.from === last.from ? opts.dropFrom : null;
  let from: Point;
  if (drop) from = { x: drop.x, y: drop.y };
  else if (srcCard) from = box(srcCard);
  else from = { x: (app.offsetWidth || 1440) / 2 - W0 / 2, y: 400 };
  if (lift) run.hide(lift);

  // destino: a mesa de quem recebe
  const seat = [...app.querySelectorAll<HTMLElement>('.seat[data-pid]')].find((s) => s.dataset.pid === last.to) ?? null;
  const stacks = seat?.querySelector<HTMLElement>('.stacks') ?? null;
  const mine = !!seat?.closest('.cl-mine');
  const stack = stacks?.querySelector<HTMLElement>(`.stack[data-color="${card.color}"]`) ?? null;
  const before = colorsOf(prev.table[last.to] ?? []);
  const after = colorsOf(next.table[last.to] ?? []);
  const withNew = after.includes(card.color) ? after : [...before, card.color];

  /** Onde fica cada pilha (canto de cima) com estas cores, do jeito que a mesa vai desenhar. */
  function slots(st: HTMLElement, colors: CamelioColor[]) {
    const R = box(st);
    const lay = opts.layout(last.to, colors.length);
    const sw = lay.w + lay.pad;
    const total = colors.length * sw + Math.max(0, colors.length - 1) * lay.gap;
    const x0 = mine ? R.x : R.x + (R.w - total) / 2; // a sua mesa alinha à esquerda; os assentos, no meio
    const at = new Map<CamelioColor, Point>();
    colors.forEach((c, i) => at.set(c, { x: x0 + i * (sw + lay.gap), y: R.y }));
    return { lay, at };
  }
  /** As outras pilhas de verdade deslizam (e mudam de tamanho) até onde vão ficar com `colors`. */
  function relayout(colors: CamelioColor[], ms: number, easing: string) {
    if (!stacks) return;
    const S = slots(stacks, colors);
    stacks.querySelectorAll<HTMLElement>('.stack[data-color]').forEach((el) => {
      const c = el.dataset.color as CamelioColor;
      const to = S.at.get(c);
      if (c === card.color || !to) return;
      const b = box(el);
      const w = widthOf(el.querySelector('.card'));
      const k = w ? S.lay.w / w : 1;
      if (Math.abs(to.x - b.x) < 0.5 && Math.abs(k - 1) < 0.01) return;
      run.setStyle(el, 'transformOrigin', '0 0');
      void run.goReal(el, [{ transform: 'none' }, { transform: `translate(${to.x - b.x}px,${to.y - b.y}px) scale(${k})` }], {
        duration: ms,
        easing,
      });
    });
  }

  // a pilha "de mentira" que recebe a carta: cópia da de verdade (ou uma nova, se a cor é nova) com a carta já dentro.
  // Fica escondida até o pouso; medir a carta nova nela dá o ponto exato do pouso.
  let ghost: HTMLElement | null = null;
  let landing: Box | null = null;
  if (stacks) {
    if (stack) {
      ghost = pin(stack, box);
      const w = widthOf(stack.querySelector('.pile .card:last-child')) || opts.layout(last.to, before.length).w;
      ghost.querySelector('.pile')?.insertAdjacentHTML('beforeend', frontHtml(card, w));
    } else {
      const S = slots(stacks, withNew);
      const at = S.at.get(card.color) ?? box(stacks);
      ghost = document.createElement('div');
      ghost.className = 'stack';
      ghost.innerHTML = `<div class="pile">${frontHtml(card, S.lay.w)}</div><span class="sum"></span>`;
      Object.assign(ghost.style, { left: `${at.x}px`, top: `${at.y}px` });
      if (!mine) {
        Object.assign(ghost.style, {
          width: `${S.lay.w + S.lay.pad}px`,
          paddingLeft: `${S.lay.pad / 2}px`,
          paddingRight: `${S.lay.pad / 2}px`,
        });
      }
      // a soma com a mesma letra das outras dessa mesa (o CSS dela depende de onde ela está)
      const probe = document.createElement('span');
      probe.className = 'sum';
      probe.style.cssText = 'position:absolute;visibility:hidden';
      stacks.appendChild(probe);
      const gs = ghost.querySelector<HTMLElement>('.sum');
      if (gs) copySum(probe, gs);
      probe.remove();
    }
    const sc = (prev.scored[last.to] ?? []).some((c) => c.color === card.color);
    const sumEl = ghost.querySelector<HTMLElement>('.sum');
    if (sumEl) {
      sumEl.textContent = `${last.sum}/${CAMELIO_EXACT}${sc ? ' ⚑' : ''}`;
      sumEl.classList.toggle('hot', last.outcome === 'none' && last.sum === CAMELIO_EXACT - 1);
      if (last.outcome === 'scored') Object.assign(sumEl.style, { color: '#9a6d10', fontWeight: '700' });
      if (last.outcome === 'bust' || last.outcome === 'lost') {
        Object.assign(sumEl.style, { color: '#c8372d', fontWeight: '700', background: 'rgba(200,55,45,.13)' });
      }
    }
    ghost.style.visibility = 'hidden';
    layer.appendChild(ghost);
    const lc = ghost.querySelector('.pile .card:last-child');
    landing = lc ? box(lc) : null;
  }
  const ghostBox = ghost ? box(ghost) : null;

  // 2. o clone que voa (com duas faces se veio do monte)
  const flip = last.from === 'deck' && prev.top;
  const fc = document.createElement('div');
  fc.className = 'fly-card';
  fc.innerHTML = flip
    ? `<div class="fly-tilt"><div class="fly-flip" style="width:${W0}px;height:${W0 * 1.44}px">` +
      `<div class="fly-face back">${backHtml(flip, W0)}</div><div class="fly-face front">${frontHtml(card, W0)}</div></div></div>`
    : `<div class="fly-tilt">${frontHtml(card, W0)}</div>`;
  const tilt = fc.firstElementChild as HTMLElement;
  const startT = `translate(${from.x}px,${from.y}px)`;
  fc.style.transform = startT;
  if (drop) tilt.style.transform = 'rotate(-4deg) scale(1.06)';
  layer.appendChild(fc);

  return (async () => {
    sound('flip');
    const to = landing ?? { x: from.x, y: from.y - 40, w: W0, h: W0 * 1.44 };
    const k = to.w / W0 || 1;
    const flight = run.go(fc, [{ transform: startT }, { transform: `translate(${to.x}px,${to.y}px) scale(${k})` }], {
      duration: FLY_MS,
      easing: EASE,
    });
    if (drop) {
      void run.go(tilt, [{ transform: 'rotate(-4deg) scale(1.06)' }, { transform: 'none' }], { duration: FLY_MS * 0.75, easing: 'ease-out' });
    } else {
      void run.go(tilt, [{ transform: 'none' }, { transform: 'rotate(-3deg)', offset: 0.45 }, { transform: 'none' }], {
        duration: FLY_MS,
        easing: 'ease-in-out',
      });
    }
    fc.querySelectorAll('.card').forEach((c) => {
      void run.go(
        c,
        drop ? [{ boxShadow: LIFTED }, { boxShadow: SHADOW }] : [{ boxShadow: SHADOW }, { boxShadow: AIR, offset: 0.4 }, { boxShadow: SHADOW }],
        { duration: FLY_MS, easing: 'ease-out' },
      );
    });
    // 3. vira nos últimos 200ms do voo (perspectiva leve: a carta não afunda)
    const flipper = fc.querySelector('.fly-flip');
    if (flip && flipper) {
      void run.go(flipper, [{ transform: 'perspective(900px) rotateY(0deg)' }, { transform: 'perspective(900px) rotateY(180deg)' }], {
        duration: FLIP_MS,
        delay: FLY_MS - FLIP_MS,
        easing: 'ease-in-out',
        fill: 'both',
      });
    }
    // cor nova: as outras pilhas abrem espaço enquanto a carta voa
    if (!stack) relayout(withNew, FLY_MS, EASE);
    await flight;
    if (!run.alive) return;
    if (!ghost || !stacks || !ghostBox || !landing) {
      await run.go(fc, [{ opacity: 1 }, { opacity: 0 }], { duration: 250 });
      return;
    }

    // pousou: a pilha de mentira entra no lugar da de verdade (a soma já com a carta nova)
    ghost.style.visibility = 'visible';
    fc.remove();
    if (stack) run.hide(stack);
    if (stacks.classList.contains('empty')) {
      void run.goReal(stacks, [{ opacity: getComputedStyle(stacks).opacity || '1' }, { opacity: 0 }], { duration: 160 });
    }

    // 4. o resultado
    await run.wait(PAUSE_MS);
    if (!run.alive) return;
    const newCard = ghost.querySelector('.pile .card:last-child');

    if (last.outcome === 'none') {
      sound('drop');
      if (newCard) {
        await run.go(newCard, [{ transform: 'none' }, { transform: 'translateY(-6px)', offset: 0.35, easing: 'ease-in' }, { transform: 'none' }], {
          duration: BOUNCE_MS,
          easing: 'ease-out',
        });
      }
      return;
    }

    if (last.outcome === 'scored') {
      sound('scored');
      ghost.querySelectorAll('.card').forEach((c) => {
        void run.go(c, [{ boxShadow: SHADOW }, { boxShadow: GLOW }], { duration: GLOW_MS, easing: 'ease-out' });
      });
      await run.go(ghost, [{ transform: 'none' }, { transform: 'scale(1.05)' }], { duration: GLOW_MS, easing: 'ease-out' });
      if (!run.alive) return;
      const t = scoreTarget(seat!, mine, ghostBox, landing.w, card.color, run, box);
      relayout(after, RISE_MS, 'ease-in-out');
      await run.go(
        ghost,
        [
          { transform: 'scale(1.05)', opacity: 1 },
          { opacity: 1, offset: 0.55 },
          {
            transform: `translate(${t.x - (ghostBox.x + ghostBox.w / 2)}px,${t.y - (ghostBox.y + ghostBox.h / 2)}px) scale(${t.k})`,
            opacity: 0,
          },
        ],
        { duration: RISE_MS, easing: 'cubic-bezier(.45,0,.55,1)' },
      );
      return;
    }

    // bust / lost: treme e cai (no lost a bandeirinha daquela cor cai junto, e na sua mesa o leque dos pontos também)
    sound(last.outcome);
    const falling: HTMLElement[] = [ghost];
    if (last.outcome === 'lost' && seat) {
      const fl = seat.querySelector<HTMLElement>(`.flags .flag[data-color="${card.color}"]`);
      if (fl) falling.push(pinFlat(fl, run, box));
      const fan = mine ? seat.querySelector<HTMLElement>(`.fans .fan[data-color="${card.color}"]`) : null;
      if (fan) falling.push(pinFlat(fan, run, box));
    }
    const shake = [0, -4, 4, -4, 4, -4, 4, 0].map((x) => ({ transform: `translateX(${x}px)` }));
    await Promise.all(falling.map((el) => run.go(el, shake, { duration: SHAKE_MS, easing: 'linear' })));
    if (!run.alive) return;
    relayout(after, FALL_MS, 'ease-in-out');
    await Promise.all(
      falling.map((el, i) =>
        run.go(
          el,
          [
            { transform: 'none', opacity: 1 },
            { opacity: 1, offset: 0.3 },
            { transform: `translateY(60px) rotate(${i === 0 ? 12 : -14}deg)`, opacity: 0 },
          ],
          { duration: FALL_MS, easing: 'cubic-bezier(.55,0,.85,.45)' },
        ),
      ),
    );
  })();
}

const colorsOf = (cards: readonly CamelioCard[]): CamelioColor[] => CAMELIO_COLORS.filter((c) => cards.some((x) => x.color === c));

/** Cópia de uma pilha de verdade, presa no mesmo lugar do palco (com o que o CSS dela tirava de quem a contém). */
function pin(src: HTMLElement, box: (el: Element) => Box): HTMLElement {
  const g = src.cloneNode(true) as HTMLElement;
  const b = box(src);
  const cs = getComputedStyle(src);
  g.removeAttribute('title');
  Object.assign(g.style, { left: `${b.x}px`, top: `${b.y}px`, width: `${b.w}px`, padding: cs.padding });
  const ss = src.querySelector('.sum');
  const gs = g.querySelector<HTMLElement>('.sum');
  if (ss && gs) copySum(ss, gs);
  return g;
}

function copySum(from: Element, to: HTMLElement) {
  const c = getComputedStyle(from);
  Object.assign(to.style, { fontSize: c.fontSize, padding: c.padding, letterSpacing: c.letterSpacing });
}

/** Copia uma bandeirinha (ou o leque) pra camada da animação e esconde a de verdade. */
function pinFlat(el: HTMLElement, run: Run, box: (el: Element) => Box): HTMLElement {
  const g = el.cloneNode(true) as HTMLElement;
  const b = box(el);
  Object.assign(g.style, { left: `${b.x}px`, top: `${b.y}px`, width: `${b.w}px`, height: `${b.h}px` });
  run.layer.appendChild(g);
  run.hide(el);
  return g;
}

/**
 * Pra onde sobem as cartas que fecharam: nos assentos, o fim das bandeirinhas do cabeçalho (onde a nova nasce,
 * e ela nasce ali de fato no fim da subida); na sua mesa, o próximo lugar da área de pontos (onde fica o leque).
 * `cw` é a largura das cartas da pilha. Devolve o centro do destino e a escala final.
 */
function scoreTarget(
  seat: HTMLElement,
  mine: boolean,
  gb: Box,
  cw: number,
  color: CamelioColor,
  run: Run,
  box: (el: Element) => Box,
): Point & { k: number } {
  const gapOf = (el: Element, fallback: number) => parseFloat(getComputedStyle(el).columnGap) || fallback;
  if (mine) {
    const fans = seat.querySelector('.fans');
    if (!fans) return { x: gb.x + gb.w / 2, y: gb.y - 60, k: 0.4 };
    const none = fans.querySelector('.none');
    if (none) void run.goReal(none, [{ opacity: getComputedStyle(none).opacity || '1' }, { opacity: 0 }], { duration: RISE_MS * 0.6 });
    const all = fans.querySelectorAll('.fan');
    const lastFan = all[all.length - 1];
    const k = cw ? 40 / cw : 0.6; // as cartas do leque têm 40 de largura
    const fb = box(fans);
    if (lastFan) {
      const lb = box(lastFan);
      return { x: lb.x + lb.w + gapOf(fans, 18) + (gb.w * k) / 2, y: lb.y + lb.h / 2, k };
    }
    return { x: fb.x + (gb.w * k) / 2, y: fb.y + 42, k };
  }
  const head = seat.querySelector('.head');
  const flags = seat.querySelector('.head .flags');
  if (!head || !flags) return { x: gb.x + gb.w / 2, y: gb.y - 40, k: 0.2 };
  const hb = box(head);
  const fb = box(flags);
  const one = flags.querySelector('.flag');
  const fw = one ? box(one).w : 14;
  const gap = gapOf(flags, 3);
  const t = { x: fb.x + fb.w - fw / 2, y: hb.y + hb.h / 2, k: 0.2 };
  // as que já estavam abrem lugar pra esquerda e a nova nasce no fim da subida
  flags.querySelectorAll('.flag').forEach((f) => {
    void run.goReal(f, [{ transform: 'none' }, { transform: `translateX(${-(fw + gap)}px)` }], {
      duration: POP_MS,
      delay: RISE_MS - POP_MS,
      easing: 'ease-out',
      fill: 'both',
    });
  });
  const nf = document.createElement('span');
  nf.className = 'flag';
  nf.style.setProperty('--c', HEX[color]);
  const fh = one ? box(one).h : 16;
  Object.assign(nf.style, { left: `${t.x - fw / 2}px`, top: `${t.y - fh / 2}px`, transformOrigin: '0 50%' });
  run.layer.appendChild(nf);
  void run.go(
    nf,
    [
      { transform: 'scale(0)', opacity: 0 },
      { transform: 'scale(1.25)', opacity: 1, offset: 0.6 },
      { transform: 'scale(1)', opacity: 1 },
    ],
    { duration: POP_MS, delay: RISE_MS - POP_MS, easing: 'ease-out', fill: 'both' },
  );
  return t;
}
