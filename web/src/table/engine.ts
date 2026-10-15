import type { Activity, CursorFx, ItoCardView, RevealEntry, RoomView } from '@cartolina/shared';
import { CW, FH, FW, HAND_S, PERSP, ROW_S, ROW_Y, TILT } from './constants';
import { applyH, inv3, solveH, type Mat3 } from './homography';
import {
  cursorFromLocal,
  effectiveRow,
  inRowZone,
  insertIndex,
  intentSettled,
  rowEntries,
  toServerIndex,
  toVisibleIndex,
  type GapSpec,
  type Intent,
  type RowEntry,
} from './rowLayout';
import { Spring } from './spring';

export interface EngineDom {
  wrap: HTMLElement;
  felt: HTMLElement;
  row: HTMLElement;
  overlay: HTMLElement;
  cursors: HTMLElement;
  tip: HTMLElement;
  markers: HTMLElement[];
}

export interface EngineHandlers {
  place(cardId: string, index: number): void;
  ret(cardId: string): void;
  cursor(fx: CursorFx): void;
  activity(activity: Activity): void;
  ping(x: number, y: number): void;
  revealDone(): void;
}

export interface EngineSnapshot {
  /** Fila que este cliente mostra (servidor + intenção pendente − cartas em voo). */
  row: readonly string[];
  /** Cartas fora da fila e fora da mão: sendo carregadas ou voando. */
  inFlight: ReadonlySet<string>;
  revealing: boolean;
}

export type RemoteCursorFx = CursorFx & { from: string };

type SpringKey = 'x' | 'y' | 'z' | 'stand' | 'rs' | 'wob' | 'flip' | 'shake' | 'stamp';

interface RowCard {
  id: string;
  owner: string;
  el: HTMLElement;
  flipEl: HTMLElement;
  faceA: HTMLElement;
  faceB: HTMLElement;
  stampEl: HTMLElement;
  tilt: number;
  landing: boolean;
  shown: boolean;
  appear: 'snap' | 'pop' | null;
  paintedA: string;
  paintedB: string;
  sp: Record<SpringKey, Spring>;
}

interface Overlay {
  cardId: string;
  owner: string;
  el: HTMLElement;
  flipEl: HTMLElement;
  tilt: number;
  x: Spring;
  y: Spring;
  s: Spring;
  rot: Spring;
  rx: Spring;
  fl: Spring;
  home: (() => [number, number, number, number] | null) | null;
  homeT: number;
}

interface Gap {
  el: HTMLElement;
  x: Spring;
  s: Spring;
  active: boolean;
  index: number;
  fresh: boolean;
  slot: number;
}

interface Remote {
  id: string;
  el: HTMLElement;
  x: Spring;
  y: Spring;
  target: { zone: 'table' | 'hand'; lx: number; ly: number };
  lastSeen: number;
  drag: { cardId: string; o: Overlay } | null;
}

interface PingFx {
  el: HTMLElement;
  rings: HTMLElement[];
  dot: HTMLElement;
  r1: Spring;
  r2: Spring;
  d: Spring;
  born: number;
}

const REMOTE_STALE_MS = 6000;
const WAIT_DROP_MS = 400;
const CURSOR_SVG =
  '<svg width="22" height="27" viewBox="0 0 22 27"><path d="M3 3 L3 22 L8 17.4 L11.4 25 L15 23.4 L11.7 16 L18.6 15.6 Z" style="fill:var(--c)" stroke="#3B2F2F" stroke-width="2" stroke-linejoin="round"/></svg>';

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const esc = (s: string) => s.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);
const initial = (name: string) => (Array.from(name.trim())[0] ?? '?').toUpperCase();
const sameList = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((x, i) => x === b[i]);
const sameSet = (a: ReadonlySet<string>, b: ReadonlySet<string>) => a.size === b.size && [...a].every((x) => b.has(x));

/** Inclinação fixa por carta, igual em todos os clientes. */
function tiltFor(id: string): number {
  let h = 2166136261;
  for (const ch of id) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 600) / 100 - 3;
}

export class TableEngine {
  private view: RoomView | null = null;
  private serverRow: string[] = [];
  private pending: Intent | null = null;
  private visible: string[] = [];
  private entries: RowEntry[] = [];
  private cards = new Map<string, RowCard>();
  private dying: RowCard[] = [];
  private overlays = new Set<Overlay>();
  private inFlight = new Map<string, Overlay>();
  private waiting = new Map<string, { o: Overlay; since: number }>();
  private gaps = new Map<string, Gap>();
  private remotes = new Map<string, Remote>();
  private pings: PingFx[] = [];
  private H: Mat3 | null = null;
  private Hi: Mat3 | null = null;
  private hDirty = true;
  private tilt = new Spring(TILT, 110, 0.68);
  private scale = new Spring(1, 110, 0.8);
  private tiltOn = true;
  private ptr = { x: 0, y: 0, px: 0, py: 0, vx: 0, vy: 0 };
  private pendingDrag: { cardId: string; from: 'hand' | 'row'; sx: number; sy: number } | null = null;
  private drag: { cardId: string; from: 'hand' | 'row'; o: Overlay; offX: number; offY: number } | null = null;
  private revealKey: string | null = null;
  private revealing = false;
  private revealTimers: number[] = [];
  private lastDown = { t: 0, x: 0, y: 0 };
  private tipSpring = new Spring(0, 500, 0.5);
  private tipTimer = 0;
  private raf = 0;
  private last = 0;
  private first = true;
  private listeners = new Set<() => void>();
  private snap: EngineSnapshot = { row: [], inFlight: new Set(), revealing: false };
  private cleanup: Array<() => void> = [];

  constructor(
    private dom: EngineDom,
    private handlers: EngineHandlers,
  ) {
    const on = <K extends keyof WindowEventMap>(type: K, fn: (e: WindowEventMap[K]) => void) => {
      window.addEventListener(type, fn);
      this.cleanup.push(() => window.removeEventListener(type, fn));
    };
    on('pointermove', (e) => this.onPointerMove(e));
    on('pointerup', () => {
      this.pendingDrag = null;
      if (this.drag) this.endDrag(false);
    });
    on('pointercancel', () => {
      this.pendingDrag = null;
      if (this.drag) this.endDrag(true);
    });
    on('blur', () => {
      this.pendingDrag = null;
      if (this.drag) this.endDrag(true);
    });
    on('resize', () => this.fit(false));
    const feltDown = (e: PointerEvent) => this.onFeltDown(e);
    dom.felt.addEventListener('pointerdown', feltDown);
    this.cleanup.push(() => dom.felt.removeEventListener('pointerdown', feltDown));
    this.fit(true);
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  // ---------- API pública ----------

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };

  getSnapshot = (): EngineSnapshot => this.snap;

  update(view: RoomView): void {
    const first = this.first;
    this.first = false;
    // Ids de carta se repetem entre rodadas (`dono:n`). Só se entra em `sorting` por uma distribuição nova,
    // então chegar nela vindo de outra fase significa que nada do que eu tinha é a mesma carta, mesmo
    // que o estado intermediário (sem cartas) tenha se perdido numa reconexão.
    const prevPhase = this.view?.game.phase ?? null;
    const freshDeal = prevPhase !== null && prevPhase !== 'sorting' && view.game.phase === 'sorting';
    const gone = (id: string) => freshDeal || !view.game.cards[id];
    this.view = view;
    this.serverRow = [...view.game.row];
    if (this.pending && intentSettled(this.serverRow, this.pending, performance.now())) this.pending = null;
    if (this.pending && (view.game.phase !== 'sorting' || gone(this.pending.cardId))) this.pending = null;

    for (const [id, rc] of this.cards) {
      if (!gone(id)) continue;
      this.cards.delete(id);
      rc.sp.rs.t = 0;
      rc.sp.z.t = 0;
      this.dying.push(rc);
    }
    for (const o of [...this.overlays]) {
      if (!gone(o.cardId)) continue;
      this.inFlight.delete(o.cardId);
      this.waiting.delete(o.cardId);
      this.removeOverlay(o);
    }
    if (this.drag && gone(this.drag.cardId)) {
      // A carta sumiu no meio do arrasto (ex.: anfitrião pulou a rodada): o overlay já saiu acima.
      this.drag = null;
      document.body.classList.remove('grabbing');
      if (view.you) this.hideGap(view.you);
      this.handlers.activity('thinking');
    }
    for (const r of this.remotes.values()) {
      if (r.drag && gone(r.drag.cardId)) {
        r.drag = null;
        this.hideGap(r.id);
      }
      if (!view.seats.some((s) => s.id === r.id)) {
        // Sem isso o overlay do arrasto ficaria órfão em `inFlight` e a carta sumiria da fila pra sempre.
        if (r.drag) this.remoteDrop(r);
        this.hideGap(r.id);
        r.el.remove();
        this.remotes.delete(r.id);
      }
    }

    for (const rc of this.cards.values()) this.paint(rc);
    for (const [id, w] of this.waiting) {
      if (!this.serverRow.includes(id)) continue;
      this.waiting.delete(id);
      this.land(w.o);
    }
    this.reconcile(first);
    this.syncReveal(first);
    this.emit();
  }

  remoteCursor(fx: RemoteCursorFx): void {
    const view = this.view;
    if (!view || fx.from === view.you || !view.seats.some((s) => s.id === fx.from)) return;
    const r = this.remotes.get(fx.from) ?? this.createRemote(fx.from);
    r.lastSeen = performance.now();
    r.target = { zone: fx.zone, lx: fx.x * FW, ly: fx.y * FH };
    r.el.style.opacity = '1';
    if (this.revealing || view.game.phase !== 'sorting') {
      if (r.drag) this.remoteDrop(r);
      return;
    }
    if (fx.drag) {
      if (r.drag && r.drag.cardId !== fx.drag.cardId) this.remoteDrop(r);
      if (!r.drag) this.remotePickup(r, fx.drag.cardId);
      if (r.drag) {
        if (fx.drag.index === null) this.clearGap(r.id);
        else this.setGap(r.id, toVisibleIndex(this.visible, this.serverRow, r.drag.cardId, fx.drag.index));
      }
    } else if (r.drag) {
      this.remoteDrop(r);
    }
  }

  remotePing(from: string, x: number, y: number): void {
    if (!this.view || from === this.view.you) return;
    this.ping(x * FW, y * FH, this.colorOf(from));
  }

  /** Chamado pela mão (React) no pointerdown de uma carta minha. */
  beginHandDrag(cardId: string, e: PointerEvent): void {
    if (e.button !== 0 || this.revealing || !this.H || this.view?.game.phase !== 'sorting') return;
    e.preventDefault();
    this.pendingDrag = { cardId, from: 'hand', sx: e.clientX, sy: e.clientY };
  }

  setTilt(on: boolean, instant = false): void {
    this.tiltOn = on;
    if (instant) this.tilt.snap(on ? TILT : 0);
    else this.tilt.t = on ? TILT : 0;
    this.fit(instant);
  }

  /** O servidor recusou uma ação minha: volta para a fila do servidor. */
  rollback(): void {
    this.pending = null;
    this.reconcile(false);
    this.emit();
  }

  destroy(): void {
    cancelAnimationFrame(this.raf);
    this.revealTimers.forEach((t) => clearTimeout(t));
    clearTimeout(this.tipTimer);
    this.cleanup.forEach((fn) => fn());
    for (const rc of this.cards.values()) rc.el.remove();
    for (const rc of this.dying) rc.el.remove();
    for (const o of this.overlays) o.el.remove();
    for (const r of this.remotes.values()) r.el.remove();
    for (const g of this.gaps.values()) g.el.remove();
    for (const p of this.pings) p.el.remove();
    document.body.classList.remove('grabbing');
    this.listeners.clear();
  }

  // ---------- fila ----------

  private reconcile(snapIn: boolean): void {
    const view = this.view;
    if (!view) return;
    this.visible = effectiveRow(this.serverRow, this.pending, new Set(this.inFlight.keys()));
    for (const id of this.visible) {
      const rc = this.cards.get(id) ?? this.createCard(id);
      if (!rc || rc.shown) continue;
      rc.shown = true;
      rc.appear = snapIn ? 'snap' : 'pop';
      rc.el.style.display = '';
    }
    for (const rc of this.cards.values()) {
      if (!rc.shown || this.visible.includes(rc.id)) continue;
      rc.shown = false;
      rc.el.style.display = 'none';
      if (rc.owner !== view.you && this.H && !this.inFlight.has(rc.id)) this.flyHomeFromRow(rc);
    }
    this.relayout();
  }

  private relayout(): void {
    const gaps: GapSpec[] = [];
    for (const [owner, g] of this.gaps) if (g.active) gaps.push({ owner, index: g.index });
    this.entries = rowEntries(this.visible, gaps);
    for (const e of this.entries) {
      if (e.kind === 'card') {
        const rc = this.cards.get(e.id);
        if (!rc) continue;
        const z = 1 + e.slot * 0.7;
        rc.sp.x.t = e.x;
        rc.sp.z.t = z;
        if (rc.appear) {
          rc.sp.x.snap(e.x);
          rc.sp.z.snap(z);
          rc.sp.y.snap(0);
          rc.sp.stand.snap(0);
          if (rc.appear === 'pop') {
            rc.sp.rs.snap(0.6);
            rc.sp.rs.t = 1;
          } else rc.sp.rs.snap(1);
          rc.appear = null;
        }
      } else {
        const g = this.gaps.get(e.owner);
        if (!g) continue;
        if (g.fresh) {
          g.x.snap(e.x);
          g.fresh = false;
        } else g.x.t = e.x;
        g.slot = e.slot;
      }
    }
  }

  private createCard(id: string): RowCard | null {
    const view = this.view;
    const card = view?.game.cards[id];
    if (!view || !card) return null;
    const el = document.createElement('div');
    el.className = `card rcard${card.owner === view.you ? ' mine' : ''}`;
    el.style.setProperty('--c', this.colorOf(card.owner));
    el.style.display = 'none';
    el.innerHTML = '<div class="flip"><div class="face a"></div><div class="face b num"></div></div><div class="xstamp">✕</div>';
    const flipEl = el.firstElementChild as HTMLElement;
    const rc: RowCard = {
      id,
      owner: card.owner,
      el,
      flipEl,
      faceA: flipEl.children[0] as HTMLElement,
      faceB: flipEl.children[1] as HTMLElement,
      stampEl: el.lastElementChild as HTMLElement,
      tilt: tiltFor(id),
      landing: false,
      shown: false,
      appear: null,
      paintedA: '',
      paintedB: '',
      sp: {
        x: new Spring(FW / 2, 230, 0.72),
        y: new Spring(0, 300, 0.75),
        z: new Spring(1, 320, 0.72),
        stand: new Spring(0, 230, 0.86),
        rs: new Spring(1, 420, 0.42),
        wob: new Spring(0, 520, 0.2),
        flip: new Spring(0, 150, 0.6),
        shake: new Spring(0, 1100, 0.1),
        stamp: new Spring(0, 520, 0.42),
      },
    };
    el.addEventListener('pointerdown', (e) => this.onRowCardDown(e, rc));
    this.dom.row.appendChild(el);
    this.cards.set(id, rc);
    this.paint(rc);
    return rc;
  }

  private paint(rc: RowCard): void {
    const card = this.view?.game.cards[rc.id];
    if (!card) return;
    const a = this.frontHTML(card);
    if (a !== rc.paintedA) {
      rc.faceA.innerHTML = a;
      rc.paintedA = a;
    }
    const b = this.numHTML(card);
    if (b !== rc.paintedB) {
      rc.faceB.innerHTML = b;
      rc.paintedB = b;
    }
  }

  private clueHTML(card: ItoCardView): string {
    return card.clue.trim() ? esc(card.clue) : '<span class="noclue">…</span>';
  }

  private frontHTML(card: ItoCardView): string {
    const mine = card.owner === this.view?.you && card.value !== null;
    return (
      `<div class="badge">${esc(initial(this.nameOf(card.owner)))}</div>` +
      (mine ? `<div class="mynum">${card.value}</div>` : '') +
      `<div class="clue">${this.clueHTML(card)}</div>`
    );
  }

  private numHTML(card: ItoCardView): string {
    return (
      `<div class="band"></div><div class="badge">${esc(initial(this.nameOf(card.owner)))}</div>` +
      `<div class="bignum">${card.value ?? '?'}</div><div class="clue mini">${this.clueHTML(card)}</div>`
    );
  }

  private nameOf(id: string): string {
    return this.view?.seats.find((s) => s.id === id)?.name ?? '?';
  }

  private colorOf(id: string): string {
    return this.view?.seats.find((s) => s.id === id)?.color ?? '#D9C2A0';
  }

  // ---------- buracos ----------

  private ensureGap(owner: string): Gap {
    let g = this.gaps.get(owner);
    if (g) return g;
    const el = document.createElement('div');
    el.className = 'gap';
    el.style.setProperty('--c', this.colorOf(owner));
    el.innerHTML = `<b>${esc(initial(this.nameOf(owner)))}</b>`;
    el.style.display = 'none';
    this.dom.row.appendChild(el);
    g = { el, x: new Spring(FW / 2, 260, 0.8), s: new Spring(0, 320, 0.62), active: false, index: 0, fresh: true, slot: 0 };
    this.gaps.set(owner, g);
    return g;
  }

  private setGap(owner: string, index: number): void {
    const g = this.ensureGap(owner);
    if (!g.active) {
      g.active = true;
      g.fresh = true;
      g.s.snap(0.55);
      g.s.t = 1;
      g.el.style.display = 'block';
    }
    g.index = index;
  }

  private clearGap(owner: string): void {
    const g = this.gaps.get(owner);
    if (g?.active) {
      g.active = false;
      g.s.t = 0;
    }
  }

  private hideGap(owner: string): void {
    const g = this.gaps.get(owner);
    if (!g) return;
    g.active = false;
    g.s.snap(0);
    g.el.style.display = 'none';
  }

  // ---------- overlays (cartas fora do feltro, de frente pra câmera) ----------

  private makeOverlay(cardId: string, x: number, y: number, s: number, rx: number, fl: number, k = 1400, zeta = 0.92): Overlay | null {
    const card = this.view?.game.cards[cardId];
    if (!card) return null;
    const el = document.createElement('div');
    el.className = 'card ocard';
    el.style.setProperty('--c', this.colorOf(card.owner));
    el.innerHTML = `<div class="flip"><div class="face a">${this.frontHTML(card)}</div><div class="face b back"><div class="tilde">~</div></div></div>`;
    this.dom.overlay.appendChild(el);
    const o: Overlay = {
      cardId,
      owner: card.owner,
      el,
      flipEl: el.firstElementChild as HTMLElement,
      tilt: tiltFor(cardId),
      x: new Spring(x, k, zeta),
      y: new Spring(y, k, zeta),
      s: new Spring(s, 380, 0.62),
      rot: new Spring(0, 300, 0.45),
      rx: new Spring(rx, 260, 0.7),
      fl: new Spring(fl, 190, 0.72),
      home: null,
      homeT: 0,
    };
    o.rx.t = 0;
    o.fl.t = 0;
    this.overlays.add(o);
    this.writeOverlay(o);
    return o;
  }

  private writeOverlay(o: Overlay): void {
    o.el.style.transform =
      `translate(${o.x.v.toFixed(2)}px,${o.y.v.toFixed(2)}px) perspective(700px) rotateX(${o.rx.v.toFixed(2)}deg) ` +
      `rotate(${(o.rot.v + o.tilt).toFixed(2)}deg) scale(${Math.max(0.01, o.s.v).toFixed(4)})`;
    o.flipEl.style.transform = `rotateY(${(o.fl.v * 180).toFixed(2)}deg)`;
  }

  private removeOverlay(o: Overlay): void {
    o.el.remove();
    this.overlays.delete(o);
  }

  /** Overlay → fila: a carta "deita" no plano 3D do feltro e assenta com mola. */
  private land(o: Overlay): void {
    const rc = this.cards.get(o.cardId) ?? this.createCard(o.cardId);
    this.inFlight.delete(o.cardId);
    this.hideGap(o.owner);
    if (rc && this.H) {
      const th = (this.tilt.v * Math.PI) / 180;
      const Z0 = 18 + 40 * Math.sin(th);
      let [lx, ly] = this.toLocal(o.x.v, o.y.v);
      const hs = this.hScale(lx, ly);
      [lx, ly] = this.toLocal(o.x.v, o.y.v + Z0 * Math.sin(th) * hs);
      const sp = rc.sp;
      sp.x.snap(lx);
      sp.x.vel = (o.x.vel / hs) * 0.5;
      sp.y.snap(ly - ROW_Y);
      sp.y.vel = (o.y.vel / hs) * 0.5;
      sp.y.t = 0;
      sp.z.snap(Z0);
      sp.stand.snap(1);
      sp.stand.t = 0;
      sp.rs.snap(o.s.v / (ROW_S * hs) / (1 + (Z0 * Math.cos(th)) / PERSP));
      sp.rs.t = 1;
      sp.wob.snap(o.rot.v);
      sp.wob.t = 0;
      rc.landing = true;
      rc.shown = true;
      rc.appear = null;
      rc.el.style.display = '';
    }
    this.removeOverlay(o);
    this.reconcile(false);
    this.emit();
  }

  /** Overlay → volta pra minha mão (minha carta) ou pro assento do dono (carta alheia, de costas). */
  private sendHome(o: Overlay): void {
    o.x.set(240, 0.74);
    o.y.set(240, 0.74);
    o.homeT = performance.now();
    const mine = o.owner === this.view?.you;
    o.home = () => {
      const sel = mine ? `[data-hand-slot="${o.cardId}"]` : `[data-seat-anchor="${o.owner}"]`;
      const el = document.querySelector<HTMLElement>(sel);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return mine ? [r.left + r.width / 2, r.top + r.height / 2, HAND_S, 0] : [r.left + r.width / 2, r.top + r.height / 2, 0.35, 1];
    };
  }

  private finishHome(o: Overlay): void {
    this.removeOverlay(o);
    if (this.inFlight.get(o.cardId) === o) this.inFlight.delete(o.cardId);
    this.reconcile(false);
    this.emit();
  }

  private flyHomeFromRow(rc: RowCard): void {
    const lx = rc.sp.x.v;
    const ly = ROW_Y + rc.sp.y.v;
    const [x, y] = this.toScreen(lx, ly);
    const o = this.makeOverlay(rc.id, x, y, ROW_S * rc.sp.rs.v * this.hScale(lx, ly), this.tilt.v, 0);
    if (!o) return;
    this.inFlight.set(rc.id, o);
    this.sendHome(o);
  }

  // ---------- arrasto local ----------

  private onRowCardDown(e: PointerEvent, rc: RowCard): void {
    const view = this.view;
    if (e.button !== 0 || !this.H || this.revealing || !view || view.game.phase !== 'sorting') return;
    if (rc.owner === view.you) {
      e.preventDefault();
      e.stopPropagation();
      this.pendingDrag = { cardId: rc.id, from: 'row', sx: e.clientX, sy: e.clientY };
    } else {
      rc.sp.wob.vel += (Math.random() < 0.5 ? -1 : 1) * 480;
      rc.sp.rs.vel += 0.5;
      this.showTip(`ei, essa carta é de ${this.nameOf(rc.owner)}!`, e.clientX, e.clientY);
    }
  }

  private onPointerMove(e: PointerEvent): void {
    this.ptr.x = e.clientX;
    this.ptr.y = e.clientY;
    const p = this.pendingDrag;
    if (p && !this.drag && Math.hypot(e.clientX - p.sx, e.clientY - p.sy) > 4) this.startDrag();
    this.emitCursor();
  }

  private emitCursor(): void {
    const me = this.view?.you;
    if (!this.Hi || !me) return;
    const [lx, ly] = this.toLocal(this.ptr.x, this.ptr.y);
    const g = this.gaps.get(me);
    const drag = this.drag
      ? { cardId: this.drag.cardId, index: g?.active ? toServerIndex(this.visible, this.serverRow, this.drag.cardId, g.index) : null }
      : null;
    this.handlers.cursor({ ...cursorFromLocal(lx, ly), drag });
  }

  private startDrag(): void {
    const p = this.pendingDrag;
    this.pendingDrag = null;
    const me = this.view?.you;
    if (!p || !me) return;
    let x: number;
    let y: number;
    let s: number;
    let rx = 0;
    if (p.from === 'hand') {
      const slot = document.querySelector<HTMLElement>(`[data-hand-slot="${p.cardId}"]`);
      if (!slot) return;
      const r = slot.getBoundingClientRect();
      x = r.left + r.width / 2;
      y = r.top + r.height / 2;
      s = HAND_S;
    } else {
      const rc = this.cards.get(p.cardId);
      if (!rc?.shown) return;
      const lx = rc.sp.x.v;
      const ly = ROW_Y + rc.sp.y.v;
      [x, y] = this.toScreen(lx, ly);
      s = ROW_S * rc.sp.rs.v * this.hScale(lx, ly);
      rx = this.tilt.v;
      this.setGap(me, Math.max(0, this.visible.indexOf(rc.id)));
      this.gaps.get(me)!.s.snap(1);
    }
    const o = this.makeOverlay(p.cardId, x, y, s, rx, 0);
    if (!o) return;
    o.s.t = HAND_S * 1.07;
    this.inFlight.set(p.cardId, o);
    if (this.pending?.cardId === p.cardId) this.pending = null;
    this.drag = { cardId: p.cardId, from: p.from, o, offX: (this.ptr.x - x) / s, offY: (this.ptr.y - y) / s };
    document.body.classList.add('grabbing');
    this.handlers.activity('dragging');
    this.reconcile(false);
    this.emit();
  }

  private updateDrag(): void {
    const d = this.drag;
    const me = this.view?.you;
    if (!d || !me) return;
    const o = d.o;
    o.x.t = this.ptr.x - d.offX * o.s.v;
    o.y.t = this.ptr.y - d.offY * o.s.v;
    const [lx, ly] = this.toLocal(this.ptr.x, this.ptr.y);
    if (inRowZone(lx, ly)) {
      this.setGap(me, insertIndex(this.entries, lx));
      o.s.t = ROW_S * this.hScale(clamp(lx, 0, FW), ROW_Y) * 1.06;
    } else {
      this.clearGap(me);
      o.s.t = HAND_S * 1.07;
    }
    o.rot.t = clamp(this.ptr.vx * 0.014, -14, 14);
    o.rx.t = clamp(-this.ptr.vy * 0.006, -10, 10);
  }

  private endDrag(forceHome: boolean): void {
    const d = this.drag;
    const me = this.view?.you;
    if (!d || !me) return;
    if (!forceHome) this.updateDrag();
    this.drag = null;
    document.body.classList.remove('grabbing');
    const g = this.gaps.get(me);
    const now = performance.now();
    if (!forceHome && g?.active) {
      const index = toServerIndex(this.visible, this.serverRow, d.cardId, g.index);
      this.pending = { kind: 'place', cardId: d.cardId, index, at: now };
      this.handlers.place(d.cardId, index);
      this.land(d.o);
    } else {
      this.clearGap(me);
      if (d.from === 'row') {
        this.pending = { kind: 'return', cardId: d.cardId, at: now };
        this.handlers.ret(d.cardId);
      }
      this.sendHome(d.o);
    }
    this.handlers.activity('thinking');
    this.emitCursor();
    this.emit();
  }

  /**
   * Encerra meu arrasto sem mandar `place`/`return` (a revelação começou e o servidor recusaria):
   * a carta volta pro lugar que o servidor conhece.
   */
  private abortDrag(): void {
    const d = this.drag;
    if (!d) return;
    this.drag = null;
    document.body.classList.remove('grabbing');
    if (this.view?.you) this.hideGap(this.view.you);
    if (this.serverRow.includes(d.cardId)) this.land(d.o);
    else this.sendHome(d.o);
    this.handlers.activity('thinking');
  }

  // ---------- remotos ----------

  private createRemote(id: string): Remote {
    const el = document.createElement('div');
    el.className = 'cursor';
    el.style.setProperty('--c', this.colorOf(id));
    el.innerHTML = `${CURSOR_SVG}<span>${esc(this.nameOf(id))}</span>`;
    this.dom.cursors.appendChild(el);
    const start = this.seatPoint(id) ?? [window.innerWidth / 2, window.innerHeight / 2];
    const r: Remote = {
      id,
      el,
      x: new Spring(start[0], 380, 0.92),
      y: new Spring(start[1], 380, 0.92),
      target: { zone: 'hand', lx: 0, ly: 0 },
      lastSeen: performance.now(),
      drag: null,
    };
    this.remotes.set(id, r);
    return r;
  }

  private seatPoint(id: string): [number, number] | null {
    const el = document.querySelector<HTMLElement>(`[data-seat-anchor="${id}"]`);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return [r.left + r.width / 2 + 10, r.top + r.height / 2 + 10];
  }

  private remotePickup(r: Remote, cardId: string): void {
    const card = this.view?.game.cards[cardId];
    if (!card || card.owner !== r.id) return;
    let o: Overlay | null = null;
    const waiting = this.waiting.get(cardId);
    const flying = this.inFlight.get(cardId);
    if (waiting) {
      // Overlays em espera continuam em `inFlight`: este ramo tem que vir antes da checagem de `inFlight`.
      this.waiting.delete(cardId);
      o = waiting.o;
    } else if (flying) {
      // Voltando pra casa: pega de volta no ar. Sem `home`, já está preso a um arrasto.
      if (!flying.home) return;
      o = flying;
    } else {
      const rc = this.cards.get(cardId);
      if (rc?.shown && this.H) {
        const lx = rc.sp.x.v;
        const ly = ROW_Y + rc.sp.y.v;
        const [x, y] = this.toScreen(lx, ly);
        o = this.makeOverlay(cardId, x, y, ROW_S * rc.sp.rs.v * this.hScale(lx, ly), this.tilt.v, 0);
      } else {
        const [x, y] = this.seatPoint(r.id) ?? [r.x.v, r.y.v];
        o = this.makeOverlay(cardId, x, y, 0.35, 0, 1, 520, 0.8);
        if (o) o.s.t = 1;
      }
    }
    if (!o) return;
    o.home = null;
    this.inFlight.set(cardId, o);
    r.drag = { cardId, o };
    this.reconcile(false);
    this.emit();
  }

  private remoteDrop(r: Remote): void {
    const d = r.drag;
    if (!d) return;
    r.drag = null;
    // Normalmente o `state` do place/return chega antes do cursor sem arrasto.
    if (this.serverRow.includes(d.cardId)) this.land(d.o);
    else this.waiting.set(d.cardId, { o: d.o, since: performance.now() });
  }

  // ---------- ping ----------

  private onFeltDown(e: PointerEvent): void {
    const now = performance.now();
    const me = this.view?.you;
    if (now - this.lastDown.t < 340 && Math.hypot(e.clientX - this.lastDown.x, e.clientY - this.lastDown.y) < 14 && this.Hi && me) {
      const [lx, ly] = this.toLocal(e.clientX, e.clientY);
      this.ping(lx, ly, this.colorOf(me));
      this.handlers.ping(clamp(lx / FW, -1, 2), clamp(ly / FH, -1, 2));
      this.lastDown.t = 0;
    } else {
      this.lastDown = { t: now, x: e.clientX, y: e.clientY };
    }
  }

  private ping(lx: number, ly: number, color: string): void {
    const el = document.createElement('div');
    el.className = 'ping';
    el.style.setProperty('--c', color);
    el.innerHTML = '<i></i><i></i><b></b>';
    el.style.transform = `translate3d(${lx}px,${ly}px,3px)`;
    this.dom.row.appendChild(el);
    const rings = Array.from(el.querySelectorAll('i')) as HTMLElement[];
    const p: PingFx = { el, rings, dot: el.querySelector('b') as HTMLElement, r1: new Spring(0, 70, 0.95), r2: new Spring(0, 55, 0.95), d: new Spring(0, 600, 0.35), born: performance.now() };
    p.r1.t = 1;
    p.d.t = 1;
    this.pings.push(p);
  }

  // ---------- revelação ----------

  private syncReveal(first: boolean): void {
    const g = this.view?.game;
    if (!g) return;
    if (g.phase !== 'reveal' || !g.reveal) {
      if (this.revealKey) {
        this.revealKey = null;
        this.revealing = false;
        this.revealTimers.forEach((t) => clearTimeout(t));
        this.revealTimers = [];
      }
      return;
    }
    const key = g.reveal.map((e) => e.cardId).join('|');
    if (key === this.revealKey) return;
    this.revealKey = key;
    this.revealing = true;
    this.pendingDrag = null;
    this.abortDrag();
    for (const r of this.remotes.values()) if (r.drag) this.remoteDrop(r);
    if (first) {
      for (const e of g.reveal) this.flipCard(e, true);
      this.revealing = false;
      this.handlers.revealDone();
      return;
    }
    let t = 750;
    for (const e of g.reveal) {
      this.later(t, () => this.flipCard(e, false));
      t += 620;
    }
    this.later(t + 500, () => {
      this.revealing = false;
      this.emit();
      this.handlers.revealDone();
    });
  }

  private later(ms: number, fn: () => void): void {
    this.revealTimers.push(window.setTimeout(fn, ms));
  }

  private flipCard(e: RevealEntry, instant: boolean): void {
    const rc = this.cards.get(e.cardId);
    if (!rc) return;
    this.paint(rc);
    if (instant) {
      rc.sp.flip.snap(1);
      if (e.error) {
        rc.el.classList.add('err');
        rc.sp.stamp.snap(1);
      }
      return;
    }
    rc.sp.flip.t = 1;
    this.later(330, () => {
      if (e.error) {
        rc.el.classList.add('err');
        rc.sp.stamp.snap(2.3);
        rc.sp.stamp.t = 1;
        rc.sp.shake.vel = 950;
      } else {
        rc.sp.rs.vel += 1.4;
      }
    });
  }

  // ---------- dica (tooltip) ----------

  private showTip(text: string, x: number, y: number): void {
    const tip = this.dom.tip;
    tip.textContent = text;
    tip.style.left = `${x + 14}px`;
    tip.style.top = `${y - 42}px`;
    this.tipSpring.snap(0.5);
    this.tipSpring.t = 1;
    clearTimeout(this.tipTimer);
    this.tipTimer = window.setTimeout(() => {
      this.tipSpring.t = 0;
    }, 1000);
  }

  // ---------- geometria ----------

  private fit(snapIt: boolean): void {
    const visH = (this.tiltOn ? 0.74 : 1) * FH;
    const availW = window.innerWidth - 2 * 175;
    const availH = window.innerHeight - 210 - 110;
    const k = clamp(Math.min(availW / FW, availH / visH), 0.4, 1.12);
    if (snapIt) this.scale.snap(k);
    else this.scale.t = k;
    this.hDirty = true;
  }

  private readH(): void {
    const pts = this.dom.markers.map((el) => {
      const r = el.getBoundingClientRect();
      return [r.left + r.width / 2, r.top + r.height / 2] as const;
    });
    const [a, b, c] = pts;
    if (!a || !b || !c || (a[0] === b[0] && a[1] === b[1]) || (a[0] === c[0] && a[1] === c[1])) return;
    this.H = solveH(
      [
        [0, 0],
        [FW, 0],
        [0, FH],
        [FW, FH],
      ],
      pts,
    );
    this.Hi = inv3(this.H);
  }

  private toScreen(lx: number, ly: number): [number, number] {
    return this.H ? applyH(this.H, lx, ly) : [lx, ly];
  }

  private toLocal(sx: number, sy: number): [number, number] {
    return this.Hi ? applyH(this.Hi, sx, sy) : [sx, sy];
  }

  private hScale(lx: number, ly: number): number {
    const [ax, ay] = this.toScreen(lx, ly);
    const [bx, by] = this.toScreen(lx + 10, ly);
    return Math.hypot(bx - ax, by - ay) / 10 || 1;
  }

  // ---------- snapshot ----------

  private emit(): void {
    const inFlight = new Set(this.inFlight.keys());
    const s = this.snap;
    if (s.revealing === this.revealing && sameList(s.row, this.visible) && sameSet(s.inFlight, inFlight)) return;
    this.snap = { row: [...this.visible], inFlight, revealing: this.revealing };
    this.listeners.forEach((fn) => fn());
  }

  // ---------- loop ----------

  private frame = (now: number): void => {
    const dt = Math.min(0.033, Math.max(0.001, (now - this.last) / 1000));
    this.last = now;
    this.tilt.step(dt);
    this.scale.step(dt);
    if (!this.tilt.resting || !this.scale.resting || this.hDirty || !this.H) {
      this.dom.felt.style.transform = `rotateX(${this.tilt.v.toFixed(3)}deg)`;
      this.dom.wrap.style.transform = `translateX(-50%) scale(${this.scale.v.toFixed(4)})`;
      this.readH();
      this.hDirty = false;
    }
    const p = this.ptr;
    p.vx = lerp(p.vx, (p.x - p.px) / dt, 0.3);
    p.vy = lerp(p.vy, (p.y - p.py) / dt, 0.3);
    p.px = p.x;
    p.py = p.y;

    this.updateDrag();
    this.stepRemotes(dt, now);
    this.relayout();
    this.stepCards(dt);
    this.stepGaps(dt);
    this.stepOverlays(dt, now);
    this.stepPings(dt, now);
    this.tipSpring.step(dt);
    this.dom.tip.style.opacity = this.tipSpring.v > 0.02 ? '1' : '0';
    this.dom.tip.style.transform = `scale(${Math.max(0, this.tipSpring.v).toFixed(3)})`;
    this.raf = requestAnimationFrame(this.frame);
  };

  private stepRemotes(dt: number, now: number): void {
    for (const r of this.remotes.values()) {
      if (now - r.lastSeen > REMOTE_STALE_MS) {
        r.el.style.opacity = '0';
        if (r.drag) this.remoteDrop(r);
      }
      const t = r.target.zone === 'table' && this.H ? this.toScreen(r.target.lx, r.target.ly) : this.seatPoint(r.id);
      if (t) {
        r.x.t = t[0];
        r.y.t = t[1];
      }
      r.x.step(dt);
      r.y.step(dt);
      r.el.style.transform = `translate(${r.x.v.toFixed(1)}px,${r.y.v.toFixed(1)}px)`;
      if (r.drag) {
        const o = r.drag.o;
        o.x.t = r.x.v + 8 * o.s.v;
        o.y.t = r.y.v + 22 * o.s.v;
        const [lx, ly] = this.toLocal(o.x.v, o.y.v);
        o.s.t = inRowZone(lx, ly) ? ROW_S * this.hScale(clamp(lx, 0, FW), ROW_Y) * 1.04 : 1;
        o.rot.t = clamp(r.x.vel * 0.014, -14, 14);
        o.rx.t = clamp(-r.y.vel * 0.006, -10, 10);
      }
    }
    for (const [id, w] of this.waiting) {
      if (now - w.since < WAIT_DROP_MS) continue;
      this.waiting.delete(id);
      if (this.serverRow.includes(id)) this.land(w.o);
      else {
        this.clearGap(w.o.owner);
        this.sendHome(w.o);
      }
    }
  }

  private writeCard(rc: RowCard): void {
    const sp = rc.sp;
    const f = clamp(sp.flip.v, 0, 1.2);
    const z = Math.max(0.5, sp.z.v) + Math.sin(Math.PI * clamp(f, 0, 1)) * 34;
    rc.el.style.transform =
      `translate3d(${(sp.x.v + sp.shake.v).toFixed(2)}px,${(ROW_Y + sp.y.v).toFixed(2)}px,${z.toFixed(2)}px) ` +
      `rotateX(${(-this.tilt.v * sp.stand.v).toFixed(2)}deg) rotateZ(${(rc.tilt + sp.wob.v + sp.shake.v * 0.25).toFixed(2)}deg) ` +
      `scale(${Math.max(0.001, ROW_S * sp.rs.v).toFixed(4)})`;
    rc.flipEl.style.transform = `rotateY(${(sp.flip.v * 180).toFixed(2)}deg)`;
    const st = sp.stamp.v;
    rc.stampEl.style.opacity = st > 0.02 ? '1' : '0';
    rc.stampEl.style.transform = `translateZ(6px) rotate(-10deg) scale(${Math.max(0, st).toFixed(3)})`;
  }

  private stepCards(dt: number): void {
    for (const rc of this.cards.values()) {
      if (!rc.shown) continue;
      for (const s of Object.values(rc.sp)) s.step(dt);
      if (rc.landing && rc.sp.z.v < rc.sp.z.t + 6) {
        rc.landing = false;
        rc.sp.rs.vel -= 1.5;
        rc.sp.y.vel *= 0.4;
      }
      this.writeCard(rc);
    }
    this.dying = this.dying.filter((rc) => {
      rc.sp.rs.step(dt);
      rc.sp.z.step(dt);
      this.writeCard(rc);
      if (rc.sp.rs.v >= 0.03) return true;
      rc.el.remove();
      return false;
    });
  }

  private stepGaps(dt: number): void {
    for (const g of this.gaps.values()) {
      if (g.el.style.display === 'none') continue;
      g.x.step(dt);
      g.s.step(dt);
      if (!g.active && g.s.v < 0.05) {
        g.el.style.display = 'none';
        continue;
      }
      const s = Math.max(0, g.s.v);
      g.el.style.opacity = clamp(s * 1.3, 0, 1).toFixed(3);
      g.el.style.transform = `translate3d(${g.x.v.toFixed(2)}px,${ROW_Y}px,${(0.5 + g.slot * 0.7).toFixed(2)}px) scale(${(ROW_S * s).toFixed(4)})`;
    }
  }

  private stepOverlays(dt: number, now: number): void {
    for (const o of [...this.overlays]) {
      if (o.home) {
        const t = o.home();
        if (!t) {
          this.finishHome(o);
          continue;
        }
        [o.x.t, o.y.t, o.s.t, o.fl.t] = t;
        o.rot.t = 0;
        o.rx.t = 0;
      }
      o.x.step(dt);
      o.y.step(dt);
      o.s.step(dt);
      o.rot.step(dt);
      o.rx.step(dt);
      o.fl.step(dt);
      this.writeOverlay(o);
      if (o.home) {
        const settled =
          Math.hypot(o.x.v - o.x.t, o.y.v - o.y.t) < 1.2 &&
          Math.hypot(o.x.vel, o.y.vel) < 40 &&
          Math.abs(o.s.v - o.s.t) < 0.01 &&
          Math.abs(o.fl.v - o.fl.t) < 0.02;
        if (settled || now - o.homeT > 1800) this.finishHome(o);
      }
    }
  }

  private stepPings(dt: number, now: number): void {
    this.pings = this.pings.filter((p) => {
      const age = now - p.born;
      if (age > 120) p.r2.t = 1;
      if (age > 700) p.d.t = 0;
      p.r1.step(dt);
      p.r2.step(dt);
      p.d.step(dt);
      [p.r1, p.r2].forEach((r, i) => {
        const ring = p.rings[i];
        if (!ring) return;
        ring.style.transform = `scale(${Math.max(0, r.v).toFixed(3)})`;
        ring.style.opacity = clamp(1 - r.v, 0, 1).toFixed(3);
      });
      p.dot.style.transform = `scale(${Math.max(0, p.d.v).toFixed(3)})`;
      if (age < 1600) return true;
      p.el.remove();
      return false;
    });
  }
}
