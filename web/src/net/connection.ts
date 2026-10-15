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
export const CURSOR_INTERVAL_MS = 34;
const OPEN = 1;
const MAX_BACKOFF_MS = 10_000;
/** Tempo que o servidor tem para responder ao ping de verificação feito ao voltar para a aba. */
const PONG_DEADLINE_MS = 5_000;

/** O que a mesa precisa da conexão (facilita testar componentes com um objeto falso). */
export type GameConn = Pick<RoomConnection, 'sendAction' | 'sendActivity' | 'sendCursor' | 'sendPing' | 'onFx' | 'onError'>;

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

  /** Limita a ~30 Hz; se chegar no meio do intervalo, envia o mais recente quando o intervalo acabar. */
  sendCursor(cursor: CursorFx): void {
    const now = Date.now();
    const wait = this.lastCursorAt + CURSOR_INTERVAL_MS - now;
    if (wait <= 0 && !this.cursorTimer) {
      this.lastCursorAt = now;
      this.send({ t: 'fx.cursor', ...cursor });
      return;
    }
    this.pendingCursor = cursor;
    if (this.cursorTimer) return;
    this.cursorTimer = setTimeout(() => {
      this.cursorTimer = null;
      const next = this.pendingCursor;
      this.pendingCursor = null;
      if (next) {
        this.lastCursorAt = Date.now();
        this.send({ t: 'fx.cursor', ...next });
      }
    }, Math.max(0, wait));
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
