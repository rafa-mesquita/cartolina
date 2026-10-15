/**
 * Bots SÓ PARA DESENVOLVIMENTO: deixam testar a mesa sozinho no localhost.
 * Cada bot abre o próprio WebSocket (token novo) e joga como uma pessoa: escreve pista,
 * arrasta a carta até a fila com o cursor, solta e fica pronto. Nunca faz ações de host.
 * Este módulo só é importado via `import()` atrás de `import.meta.env.DEV` — não vai pro build de produção.
 */
import { CLUE_MAX, PLAYER_COLORS, type CursorFx, type ItoView } from '@cartolina/shared';
import { getRoomInfo, type RoomInfo } from '../net/api';
import { wsUrl } from '../net/config';
import { RoomConnection, type SocketLike } from '../net/connection';
import { FH, FW, ROW_Y } from '../table/constants';
import { rowEntries } from '../table/rowLayout';

export const BOT_NAMES = ['Bot Bia', 'Bot Caio', 'Bot Duda', 'Bot Enzo', 'Bot Lia', 'Bot Téo', 'Bot Nina', 'Bot Gui', 'Bot Malu'];

export const CLUE_BUCKETS: ReadonlyArray<{ max: number; phrases: readonly string[] }> = [
  { max: 20, phrases: ['quase nada', 'bem pouquinho mesmo', 'quase zero', 'nadinha'] },
  { max: 40, phrases: ['pouquinho', 'um pouco', 'meio fraquinho', 'pouco, mas tem'] },
  { max: 60, phrases: ['meio termo', 'mais ou menos', 'no meio', 'nem muito nem pouco'] },
  { max: 80, phrases: ['bastante', 'bem forte', 'muito, mas não tudo', 'um tantão'] },
  { max: 100, phrases: ['muito!!', 'demais!!', 'no talo', 'o máximo'] },
];

export type Rng = () => number;
export interface Pt {
  x: number;
  y: number;
}

/** Pista escrita a partir do número da carta (uma frase da faixa, com um pouco de variedade). */
export function clueFor(value: number, rng: Rng): string {
  const bucket = CLUE_BUCKETS.find((b) => value <= b.max) ?? CLUE_BUCKETS[CLUE_BUCKETS.length - 1]!;
  const phrase = bucket.phrases[Math.min(bucket.phrases.length - 1, Math.floor(rng() * bucket.phrases.length))]!;
  return Array.from(phrase).slice(0, CLUE_MAX).join('');
}

/** Onde pôr a carta numa fila de `rowLength` cartas (sem ela): proporção do valor, às vezes ±1 de "erro humano". */
export function targetIndex(value: number, rowLength: number, rng: Rng): number {
  let index = Math.round((value / 100) * rowLength);
  if (rng() < 0.25) index += rng() < 0.5 ? -1 : 1;
  return Math.max(0, Math.min(rowLength, index));
}

/** Ponto de uma curva quadrática de `from` a `to`; `bend` desloca o meio na perpendicular (fração da distância). */
export function curvePoint(from: Pt, to: Pt, t: number, bend: number): Pt {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const cx = (from.x + to.x) / 2 - dy * bend;
  const cy = (from.y + to.y) / 2 + dx * bend;
  const u = 1 - t;
  return { x: u * u * from.x + 2 * u * t * cx + t * t * to.x, y: u * u * from.y + 2 * u * t * cy + t * t * to.y };
}

const FRAME_MS = 33;
/** Tempo sem ver o resultado de uma ação antes de considerar que ela se perdeu e tentar de novo. */
const ACTION_TIMEOUT_MS = 3000;
const ease = (t: number) => t * t * (3 - 2 * t);

function uuid(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6]! & 0x0f) | 0x40;
  b[8] = (b[8]! & 0x3f) | 0x80;
  const h = Array.from(b, (n) => n.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export interface BotOptions {
  code: string;
  url?: string;
  createSocket?: (url: string) => SocketLike;
  getInfo?: (code: string) => Promise<RoomInfo | null>;
  rng?: Rng;
  /** Nomes/cores já escolhidos por outros bots que ainda podem não aparecer nos assentos. */
  taken?: () => { names: string[]; colors: string[] };
  /** Chamado quando o bot desiste sozinho (sala cheia etc.). */
  onGone?: (bot: BotPlayer) => void;
}

interface RoundState {
  wasReady: boolean;
  nudgeDecided: boolean;
  readySent: { at: number; row: string } | null;
  placedAt: Map<string, number>;
}

export class BotPlayer {
  readonly code: string;
  name: string | null = null;
  color: string | null = null;
  private conn: RoomConnection | null = null;
  private unsub: (() => void) | null = null;
  private timers = new Set<ReturnType<typeof setTimeout>>();
  private started = false;
  private stopped = false;
  private rng: Rng;
  private triedColors = new Set<string>();
  private retrying = false;
  private busy = false;
  private dragging = false;
  private anim = 0;
  private pos: Pt = { x: 0.5, y: 0.5 };
  private round: RoundState | null = null;

  constructor(private opts: BotOptions) {
    this.code = opts.code;
    this.rng = opts.rng ?? Math.random;
  }

  get playerId(): string | null {
    return this.conn?.getSnapshot().playerId ?? null;
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    const getInfo = this.opts.getInfo ?? ((code: string) => getRoomInfo(code));
    void getInfo(this.code)
      .catch(() => null)
      .then((info) => {
        if (this.stopped) return;
        const taken = this.opts.taken?.() ?? { names: [], colors: [] };
        const seats = info?.seats ?? [];
        const names = new Set([...taken.names, ...seats.map((s) => s.name)]);
        this.name = BOT_NAMES.find((n) => !names.has(n)) ?? `Bot ${1 + Math.floor(this.rng() * 99)}`;
        taken.colors.concat(seats.map((s) => s.color)).forEach((c) => this.triedColors.add(c));
        this.color = this.nextColor();
        this.conn = new RoomConnection({
          url: this.opts.url ?? wsUrl(this.code),
          token: uuid(),
          name: this.name,
          color: this.color,
          createSocket: this.opts.createSocket,
        });
        this.unsub = this.conn.subscribe(this.react);
        this.conn.start();
        this.idleLoop();
        this.pulse();
      });
  }

  stop(): void {
    this.stopped = true;
    this.timers.forEach((t) => clearTimeout(t));
    this.timers.clear();
    this.unsub?.();
    this.unsub = null;
    this.conn?.stop();
  }

  // ---------- tempo ----------

  private later(ms: number, fn: () => void): void {
    if (this.stopped) return;
    const t = setTimeout(() => {
      this.timers.delete(t);
      if (!this.stopped) fn();
    }, ms);
    this.timers.add(t);
  }

  /** Depois de `stop()` a promessa nunca resolve: a sequência em andamento simplesmente para. */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => this.later(ms, resolve));
  }

  private between(min: number, max: number): number {
    return min + this.rng() * (max - min);
  }

  /** Revisão periódica: pega casos em que nenhuma mensagem nova chega (ex.: ação perdida). */
  private pulse(): void {
    this.later(1000, () => {
      this.react();
      this.pulse();
    });
  }

  // ---------- entrada ----------

  private nextColor(): string {
    const free = PLAYER_COLORS.find((c) => !this.triedColors.has(c)) ?? PLAYER_COLORS[0];
    this.triedColors.add(free);
    return free;
  }

  private onJoinFailed(code: string | null): void {
    if (this.retrying) return;
    if (code !== 'color_taken' || this.triedColors.size >= PLAYER_COLORS.length) {
      this.stop();
      this.opts.onGone?.(this);
      return;
    }
    this.retrying = true;
    this.later(this.between(100, 400), () => {
      this.retrying = false;
      this.color = this.nextColor();
      this.conn?.retryJoin(this.name ?? BOT_NAMES[0]!, this.color);
    });
  }

  // ---------- decisão ----------

  private game(): { me: string; g: ItoView } | null {
    const snap = this.conn?.getSnapshot();
    if (!snap || snap.status !== 'joined' || !snap.playerId || !snap.view) return null;
    return { me: snap.playerId, g: snap.view.game };
  }

  private sorting(): { me: string; g: ItoView } | null {
    const s = this.game();
    return s && s.g.phase === 'sorting' && s.g.players.includes(s.me) ? s : null;
  }

  private react = (): void => {
    if (this.stopped || !this.conn) return;
    const snap = this.conn.getSnapshot();
    if (snap.status === 'join_failed') return this.onJoinFailed(snap.joinError);
    const s = this.sorting();
    if (!s) {
      if (this.game()) this.round = null;
      return;
    }
    const { me, g } = s;
    const round = (this.round ??= { wasReady: false, nudgeDecided: false, readySent: null, placedAt: new Map() });
    if (g.ready.includes(me)) {
      round.wasReady = true;
      round.readySent = null;
    }
    if (this.busy) return;

    const now = Date.now();
    const mine = Object.values(g.cards).filter((c) => c.owner === me);
    const recentlyPlaced = (id: string) => now - (round.placedAt.get(id) ?? -Infinity) < ACTION_TIMEOUT_MS;
    const inHand = mine.filter((c) => !g.row.includes(c.id));
    const next = inHand.find((c) => !recentlyPlaced(c.id));
    if (next) return this.job(this.between(1500, 5000), () => this.placeFromHand(next.id));
    if (inHand.length > 0) return; // esperando o servidor confirmar

    if (!round.nudgeDecided) {
      round.nudgeDecided = true;
      if (g.row.length > 1 && this.rng() < 0.15) return this.job(this.between(1000, 3000), () => this.nudge());
    }

    if (g.ready.includes(me)) return;
    const rowKey = g.row.join(',');
    if (round.readySent && round.readySent.row === rowKey && now - round.readySent.at < ACTION_TIMEOUT_MS) return;
    round.readySent = null;
    const delay = round.wasReady ? this.between(1500, 4000) : this.between(1000, 3000);
    this.job(delay, () => this.becomeReady());
  };

  private job(delay: number, fn: () => Promise<void>): void {
    this.busy = true;
    void (async () => {
      await this.sleep(delay);
      try {
        await fn();
      } finally {
        this.busy = false;
        this.dragging = false;
      }
      this.react();
    })();
  }

  // ---------- ações ----------

  private async placeFromHand(cardId: string): Promise<void> {
    const inHand = () => {
      const s = this.sorting();
      const card = s?.g.cards[cardId];
      return s && card && card.owner === s.me && !s.g.row.includes(cardId) ? { ...s, card } : null;
    };
    let s = inHand();
    if (!s) return;
    if (!s.card.clue) {
      this.conn!.sendActivity('writing');
      await this.sleep(this.between(1000, 2000));
      s = inHand();
      if (!s) return;
      this.conn!.sendAction({ type: 'clue', cardId, text: clueFor(s.card.value ?? 50, this.rng) });
      await this.sleep(this.between(300, 700));
      s = inHand();
      if (!s) return;
    }
    const base = s.g.row.filter((id) => id !== cardId);
    const index = targetIndex(s.card.value ?? 50, base.length, this.rng);
    await this.dragTo(cardId, index, base, s.me, null);
  }

  /** Empurra uma carta própria da fila uma posição pra um lado (gente faz isso o tempo todo). */
  private async nudge(): Promise<void> {
    const s = this.sorting();
    if (!s) return;
    const own = s.g.row.filter((id) => s.g.cards[id]?.owner === s.me);
    if (own.length === 0 || s.g.row.length < 2) return;
    const cardId = own[Math.floor(this.rng() * own.length)]!;
    const cur = s.g.row.indexOf(cardId);
    const last = s.g.row.length - 1;
    const dir = this.rng() < 0.5 ? -1 : 1;
    const index = cur + dir >= 0 && cur + dir <= last ? cur + dir : cur - dir;
    const from = rowEntries(s.g.row, []).find((e) => e.kind === 'card' && e.id === cardId);
    if (!from) return;
    const base = s.g.row.filter((id) => id !== cardId);
    await this.dragTo(cardId, index, base, s.me, { x: from.x / FW, y: ROW_Y / FH });
  }

  /** Anima o arrasto (da mão ou de `from` na fila) até o buraco `index` e solta. */
  private async dragTo(cardId: string, index: number, base: string[], me: string, from: Pt | null): Promise<void> {
    const conn = this.conn!;
    this.dragging = true;
    const drag = (i: number | null): CursorFx['drag'] => ({ cardId, index: i });
    if (from) {
      await this.glide(from, this.between(500, 800), (p) => ({ zone: 'table', ...p, drag: null }));
    } else {
      conn.sendCursor({ zone: 'hand', x: 0, y: 0, drag: drag(null) });
      this.pos = { x: this.between(0.4, 0.6), y: 1.08 };
    }
    conn.sendActivity('dragging');
    await this.sleep(this.between(120, 250));
    const gap = rowEntries(base, [{ owner: me, index }]).find((e) => e.kind === 'gap');
    const target = { x: (gap?.x ?? FW / 2) / FW, y: ROW_Y / FH };
    await this.glide(target, this.between(1000, 1500), (p) => ({ zone: 'table', ...p, drag: drag(index) }));
    await this.sleep(60);
    const s = this.sorting();
    const ok = s && s.g.cards[cardId] && (from ? s.g.row.includes(cardId) : !s.g.row.includes(cardId));
    if (ok) {
      conn.sendAction({ type: 'place', cardId, index });
      this.round?.placedAt.set(cardId, Date.now());
    }
    conn.sendCursor({ zone: 'table', ...this.pos, drag: null });
    this.dragging = false;
  }

  private async becomeReady(): Promise<void> {
    const s = this.sorting();
    if (!s || !this.round || s.g.ready.includes(s.me)) return;
    const mine = Object.values(s.g.cards).filter((c) => c.owner === s.me);
    if (!mine.every((c) => s.g.row.includes(c.id))) return;
    this.conn!.sendAction({ type: 'ready', ready: true });
    this.round.wasReady = true;
    this.round.readySent = { at: Date.now(), row: s.g.row.join(',') };
  }

  // ---------- cursor ----------

  private async glide(to: Pt, ms: number, frame: (p: Pt) => CursorFx): Promise<boolean> {
    const from = this.pos;
    const bend = this.between(-0.35, 0.35);
    const steps = Math.max(2, Math.round(ms / FRAME_MS));
    const token = ++this.anim;
    for (let i = 1; i <= steps; i++) {
      await this.sleep(FRAME_MS);
      if (token !== this.anim) return false;
      const p = curvePoint(from, to, ease(i / steps), bend);
      this.pos = { x: Math.round(p.x * 1000) / 1000, y: Math.round(p.y * 1000) / 1000 };
      this.conn?.sendCursor(frame(this.pos));
    }
    return true;
  }

  private idleLoop(): void {
    this.later(this.between(2000, 4000), () => {
      void (async () => {
        // enquanto um arrasto está em curso, o cursor "ocioso" não compete com ele
        if (!this.dragging && this.game()) {
          const to = { x: this.between(0.1, 0.9), y: this.between(0.15, 0.85) };
          await this.glide(to, this.between(800, 1500), (p) => ({ zone: 'table', ...p, drag: null }));
        }
        this.idleLoop();
      })();
    });
  }
}

// ---------- registro (um por aba) ----------

const registry = new Set<BotPlayer>();
const listeners = new Set<() => void>();
let version = 0;
const emit = () => {
  version++;
  listeners.forEach((fn) => fn());
};

export function subscribeBots(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** Muda sempre que a lista de bots muda (para useSyncExternalStore). */
export const botsVersion = (): number => version;

export function botsIn(code: string): BotPlayer[] {
  return [...registry].filter((b) => b.code === code);
}

export function addBot(code: string): BotPlayer {
  const bot: BotPlayer = new BotPlayer({
    code,
    taken: () => {
      const others = botsIn(code).filter((b) => b !== bot);
      return {
        names: others.flatMap((b) => (b.name ? [b.name] : [])),
        colors: others.flatMap((b) => (b.color ? [b.color] : [])),
      };
    },
    onGone: (b) => {
      registry.delete(b);
      emit();
    },
  });
  registry.add(bot);
  emit();
  bot.start();
  return bot;
}

export function removeAllBots(): void {
  registry.forEach((b) => b.stop());
  registry.clear();
  emit();
}
