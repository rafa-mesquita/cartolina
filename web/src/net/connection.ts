import {
  CLOSE_GONE,
  CLOSE_REPLACED,
  HEARTBEAT_INTERVAL_MS,
  HEARTBEAT_PING,
  HEARTBEAT_PONG,
  type Activity,
  type ClientMessage,
  type CursorFx,
  type ItoAction,
  type RoomView,
  type ServerMessage,
} from '@cartolina/shared';

export type ConnStatus = 'connecting' | 'joining' | 'joined' | 'reconnecting' | 'join_failed' | 'replaced' | 'gone';

export interface ConnSnapshot {
  status: ConnStatus;
  playerId: string | null;
  view: RoomView | null;
  joinError: string | null;
}

export type FxEvent = Extract<ServerMessage, { t: 'fx.cursor' | 'fx.activity' | 'fx.ping' }>;

export interface SocketLike {
  readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  onopen: ((ev: unknown) => void) | null;
  onmessage: ((ev: { data: unknown }) => void) | null;
  onclose: ((ev: { code: number }) => void) | null;
}

export interface ConnOptions {
  url: string;
  token: string;
  name: string;
  color: string;
  createSocket?: (url: string) => SocketLike;
}

/** Erros que só acontecem ao entrar; com eles o socket fica aberto esperando nova tentativa. */
export const JOIN_ERRORS: ReadonlySet<string> = new Set(['room_full', 'bad_name', 'bad_color', 'color_taken']);
/** Cota grátis da Cloudflare: cada ~20 mensagens recebidas contam 1 requisição. Cursor solto ~12/s, arrastando 20/s. */
export const CURSOR_IDLE_INTERVAL_MS = 84;
export const CURSOR_DRAG_INTERVAL_MS = 50;
/** Parado, reenvia a última posição de tempos em tempos (os outros escondem cursor sem notícia há 6 s). */
export const CURSOR_KEEPALIVE_MS = 2000;
const OPEN = 1;
const MAX_BACKOFF_MS = 10_000;
/** Tempo que o servidor tem para responder ao ping de verificação feito ao voltar para a aba. */
const PONG_DEADLINE_MS = 5_000;

/** O que a mesa precisa da conexão (facilita testar componentes com um objeto falso). */
export type GameConn = Pick<RoomConnection, 'sendAction' | 'sendActivity' | 'sendCursor' | 'sendPing' | 'onFx' | 'onError'>;

const sameCursor = (a: CursorFx, b: CursorFx): boolean =>
  a.zone === b.zone && a.x === b.x && a.y === b.y && a.drag?.cardId === b.drag?.cardId && a.drag?.index === b.drag?.index;

/** Aba visível e janela com foco (sem `document`, como em testes de Node, conta como ativa). */
const windowActive = (): boolean =>
  typeof document === 'undefined' || (document.visibilityState !== 'hidden' && document.hasFocus());

const defaultSocket = (url: string): SocketLike => new WebSocket(url) as unknown as SocketLike;

export class RoomConnection {
  private ws: SocketLike | null = null;
  private snap: ConnSnapshot = { status: 'connecting', playerId: null, view: null, joinError: null };
  private listeners = new Set<() => void>();
  private fxListeners = new Set<(fx: FxEvent) => void>();
  private errorListeners = new Set<(code: string, message: string) => void>();
  private attempt = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeat: ReturnType<typeof setInterval> | null = null;
  private stopped = false;
  private started = false;
  private pongTimer: ReturnType<typeof setTimeout> | null = null;
  private lastCursorAt = -Infinity;
  private pendingCursor: CursorFx | null = null;
  private cursorTimer: ReturnType<typeof setTimeout> | null = null;
  private lastCursor: CursorFx | null = null;
  private keepaliveTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private opts: ConnOptions) {}

  start(): void {
    if (this.started && !this.stopped) return;
    this.started = true;
    this.stopped = false;
    this.attempt = 0;
    this.setSnap({ status: 'connecting', joinError: null });
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', this.onVisible);
    this.open();
  }

  stop(): void {
    this.stopped = true;
    this.started = false;
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', this.onVisible);
    this.clearTimers();
    const ws = this.ws;
    this.ws = null;
    ws?.close(1000, 'bye');
  }

  getSnapshot = (): ConnSnapshot => this.snap;

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };

  onFx(fn: (fx: FxEvent) => void): () => void {
    this.fxListeners.add(fn);
    return () => {
      this.fxListeners.delete(fn);
    };
  }

  onError(fn: (code: string, message: string) => void): () => void {
    this.errorListeners.add(fn);
    return () => {
      this.errorListeners.delete(fn);
    };
  }

  sendAction(action: ItoAction): void {
    this.send({ t: 'action', action });
  }

  sendActivity(activity: Activity): void {
    this.send({ t: 'fx.activity', activity });
  }

  sendPing(x: number, y: number): void {
    this.send({ t: 'fx.ping', x, y });
  }

  /**
   * Cursor com ritmo: ~12/s solto, 20/s arrastando, com o valor mais recente no fim do intervalo.
   * Posição repetida não sai; parado, `keepalive` reenvia. Sem foco, só mudanças de arrasto saem.
   */
  sendCursor(cursor: CursorFx): void {
    const latest = this.pendingCursor ?? this.lastCursor;
    if (latest && sameCursor(cursor, latest)) return;
    const dragChanged = Boolean(cursor.drag) !== Boolean(this.lastCursor?.drag);
    if (!dragChanged && !cursor.drag && !windowActive()) return;
    const interval = cursor.drag ? CURSOR_DRAG_INTERVAL_MS : CURSOR_IDLE_INTERVAL_MS;
    const wait = this.lastCursorAt + interval - Date.now();
    if (wait <= 0 && !this.cursorTimer) {
      this.flushCursor(cursor);
      return;
    }
    this.pendingCursor = cursor;
    if (this.cursorTimer) return;
    this.cursorTimer = setTimeout(() => {
      this.cursorTimer = null;
      const next = this.pendingCursor;
      this.pendingCursor = null;
      if (next) this.flushCursor(next);
    }, Math.max(0, wait));
  }

  private flushCursor(cursor: CursorFx): void {
    this.lastCursorAt = Date.now();
    this.lastCursor = cursor;
    this.send({ t: 'fx.cursor', ...cursor });
    if (this.keepaliveTimer) clearTimeout(this.keepaliveTimer);
    this.keepaliveTimer = setTimeout(() => {
      this.keepaliveTimer = null;
      const c = this.lastCursor;
      if (c && !this.stopped && windowActive()) this.flushCursor(c);
    }, CURSOR_KEEPALIVE_MS);
  }

  retryJoin(name: string, color: string): void {
    this.opts = { ...this.opts, name, color };
    this.setSnap({ status: 'joining', joinError: null });
    if (this.ws && this.ws.readyState === OPEN) {
      this.sendJoin();
      return;
    }
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    this.open();
  }

  /**
   * Celular e aba em segundo plano atrasam timers: o ping pode ter deixado de sair e o backoff pode estar
   * vencendo só tarde. Ao voltar para a aba, recupera na hora (o servidor derruba sockets após 90 s sem ping).
   */
  private onVisible = (): void => {
    if (document.visibilityState !== 'visible' || this.stopped) return;
    if (this.ws && this.ws.readyState === OPEN) {
      this.ws.send(HEARTBEAT_PING);
      this.armPongDeadline();
      return;
    }
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
      this.attempt = 0;
      this.open();
    }
  };

  /** Sem nenhuma mensagem (nem pong) no prazo, o socket é meio-aberto: larga e reconecta. */
  private armPongDeadline(): void {
    if (this.pongTimer) return;
    this.pongTimer = setTimeout(() => {
      this.pongTimer = null;
      if (this.stopped) return;
      const ws = this.ws;
      this.ws = null;
      ws?.close();
      this.handleClose(1006);
    }, PONG_DEADLINE_MS);
  }

  private clearPongDeadline(): void {
    if (this.pongTimer) clearTimeout(this.pongTimer);
    this.pongTimer = null;
  }

  private open(): void {
    if (this.stopped) return;
    this.clearPongDeadline();
    const old = this.ws;
    this.ws = null;
    old?.close(1000);
    const ws = (this.opts.createSocket ?? defaultSocket)(this.opts.url);
    this.ws = ws;
    ws.onopen = () => {
      if (this.ws !== ws) return;
      this.attempt = 0;
      this.setSnap({ status: 'joining' });
      this.sendJoin();
      this.startHeartbeat();
    };
    ws.onmessage = (ev) => {
      if (this.ws === ws) this.handle(ev.data);
    };
    ws.onclose = (ev) => {
      if (this.ws === ws) this.handleClose(ev.code);
    };
  }

  private sendJoin(): void {
    this.send({ t: 'join', token: this.opts.token, name: this.opts.name, color: this.opts.color });
  }

  private handle(data: unknown): void {
    if (typeof data !== 'string') return;
    this.clearPongDeadline();
    if (data === HEARTBEAT_PONG) return;
    let msg: ServerMessage;
    try {
      msg = JSON.parse(data) as ServerMessage;
    } catch {
      return;
    }
    if (!msg || typeof msg !== 'object') return;
    switch (msg.t) {
      case 'welcome':
        this.setSnap({ status: 'joined', playerId: msg.playerId, joinError: null });
        return;
      case 'state':
        this.setSnap({ view: msg.room });
        return;
      case 'error':
        if (this.snap.status === 'joining' && JOIN_ERRORS.has(msg.code)) {
          this.setSnap({ status: 'join_failed', joinError: msg.code });
          return;
        }
        this.errorListeners.forEach((fn) => fn(msg.code, msg.message));
        return;
      default:
        if (typeof msg.t === 'string' && msg.t.startsWith('fx.')) this.fxListeners.forEach((fn) => fn(msg));
    }
  }

  private handleClose(code: number): void {
    this.stopHeartbeat();
    this.clearPongDeadline();
    this.ws = null;
    if (this.stopped) return;
    if (code === CLOSE_REPLACED) return this.setSnap({ status: 'replaced' });
    if (code === CLOSE_GONE) return this.setSnap({ status: 'gone' });
    const delay = Math.min(MAX_BACKOFF_MS, 1000 * 2 ** this.attempt);
    this.attempt++;
    this.setSnap({ status: 'reconnecting' });
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.open();
    }, delay);
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeat = setInterval(() => {
      if (this.ws && this.ws.readyState === OPEN) this.ws.send(HEARTBEAT_PING);
    }, HEARTBEAT_INTERVAL_MS);
  }

  private stopHeartbeat(): void {
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.heartbeat = null;
  }

  private clearTimers(): void {
    this.stopHeartbeat();
    this.clearPongDeadline();
    if (this.retryTimer) clearTimeout(this.retryTimer);
    if (this.cursorTimer) clearTimeout(this.cursorTimer);
    if (this.keepaliveTimer) clearTimeout(this.keepaliveTimer);
    this.keepaliveTimer = null;
    this.retryTimer = null;
    this.cursorTimer = null;
  }

  private send(msg: ClientMessage): void {
    if (this.ws && this.ws.readyState === OPEN) this.ws.send(JSON.stringify(msg));
  }

  private setSnap(patch: Partial<ConnSnapshot>): void {
    this.snap = { ...this.snap, ...patch };
    this.listeners.forEach((fn) => fn());
  }
}
