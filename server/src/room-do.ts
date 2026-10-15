import { DurableObject } from 'cloudflare:workers';
import {
  CLOSE_GONE,
  CLOSE_REPLACED,
  createRoom,
  disconnect,
  errorMessage,
  isExpired,
  joinRoom,
  nextAlarmAt,
  parseClientMessage,
  reconcilePresence,
  roomAction,
  roomSummary,
  roomView,
  tick,
  type Room,
  type ServerMessage,
} from '@cartolina/shared';

interface Attachment {
  playerId: string | null;
  /** Socket substituído por uma reconexão: ignora tudo que ele ainda enviar. */
  replaced?: boolean;
}

const CURSOR_MIN_INTERVAL_MS = 33;

export class RoomDO extends DurableObject<Env> {
  private room: Room | null = null;
  private lastCursor = new Map<string, number>();

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      this.room = (await ctx.storage.get<Room>('room')) ?? null;
      if (!this.room) return;
      // Após um restart, `connected` pode estar obsoleto: quem não tem socket vivo está desconectado.
      const live = new Set(
        ctx.getWebSockets().map((s) => this.attachment(s).playerId).filter((id): id is string => id !== null),
      );
      const now = Date.now();
      const reconciled = reconcilePresence(this.room, live, now);
      if (reconciled !== this.room) {
        this.room = reconciled;
        await ctx.storage.put('room', this.room);
        await ctx.storage.setAlarm(nextAlarmAt(this.room, now));
      }
    });
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/init') {
      if (this.room) return new Response('taken', { status: 409 });
      this.room = createRoom(url.searchParams.get('code') ?? '', Date.now());
      await this.commit();
      return new Response('ok', { status: 201 });
    }

    if (url.pathname === '/exists') {
      if (!this.room) return Response.json({ exists: false }, { status: 404 });
      return Response.json({ exists: true, ...roomSummary(this.room) });
    }

    if (url.pathname.endsWith('/ws')) {
      if (!this.room) return new Response('not_found', { status: 404 });
      if (request.headers.get('Upgrade') !== 'websocket') return new Response('expected websocket', { status: 426 });
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair) as [WebSocket, WebSocket];
      this.ctx.acceptWebSocket(server);
      server.serializeAttachment({ playerId: null } satisfies Attachment);
      return new Response(null, { status: 101, webSocket: client });
    }

    return new Response('not_found', { status: 404 });
  }

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    if (this.attachment(ws).replaced) return;
    if (!this.room) {
      this.safeClose(ws, CLOSE_GONE, 'not_found');
      return;
    }
    const msg = parseClientMessage(typeof raw === 'string' ? raw : new TextDecoder().decode(raw));
    if (!msg) return this.sendError(ws, 'bad_message');
    const now = Date.now();

    if (msg.t === 'join') {
      if (this.attachment(ws).playerId) return this.sendError(ws, 'already_joined');
      const res = joinRoom(this.room, { token: msg.token, name: msg.name, color: msg.color }, crypto.randomUUID(), now);
      if (!res.ok) return this.sendError(ws, res.error);
      for (const other of this.socketsOf(res.playerId)) {
        if (other === ws) continue;
        other.serializeAttachment({ playerId: null, replaced: true } satisfies Attachment);
        this.safeClose(other, CLOSE_REPLACED, 'replaced');
      }
      ws.serializeAttachment({ playerId: res.playerId } satisfies Attachment);
      this.room = tick(res.room, now, Math.random);
      this.send(ws, { t: 'welcome', playerId: res.playerId, code: this.room.code });
      await this.commit();
      return;
    }

    const playerId = this.attachment(ws).playerId;
    if (!playerId) return this.sendError(ws, 'not_joined');

    switch (msg.t) {
      case 'action': {
        const res = roomAction(this.room, playerId, msg.action, Math.random, now);
        if (!res.ok) return this.sendError(ws, res.error);
        this.room = res.room;
        await this.commit();
        return;
      }
      case 'fx.cursor': {
        if (now - (this.lastCursor.get(playerId) ?? 0) < CURSOR_MIN_INTERVAL_MS) return;
        this.lastCursor.set(playerId, now);
        const { t: _t, ...cursor } = msg;
        this.broadcastFx({ t: 'fx.cursor', ...cursor, from: playerId }, playerId);
        return;
      }
      case 'fx.activity':
        this.broadcastFx({ t: 'fx.activity', from: playerId, activity: msg.activity }, playerId);
        return;
      case 'fx.ping':
        this.broadcastFx({ t: 'fx.ping', from: playerId, x: msg.x, y: msg.y }, null);
        return;
    }
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string): Promise<void> {
    this.safeClose(ws, code === 1005 || code === 1006 ? 1000 : code, reason);
    await this.handleGone(ws);
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    this.safeClose(ws, 1011, 'error');
    await this.handleGone(ws);
  }

  async alarm(): Promise<void> {
    if (!this.room) return;
    const now = Date.now();
    if (isExpired(this.room, now)) {
      for (const ws of this.ctx.getWebSockets()) this.safeClose(ws, CLOSE_GONE, 'expired');
      this.room = null;
      await this.ctx.storage.deleteAll();
      await this.ctx.storage.deleteAlarm();
      return;
    }
    this.room = tick(this.room, now, Math.random);
    await this.commit();
  }

  private async handleGone(ws: WebSocket): Promise<void> {
    const playerId = this.attachment(ws).playerId;
    if (!this.room || !playerId) return;
    ws.serializeAttachment({ playerId: null } satisfies Attachment);
    if (this.socketsOf(playerId).length > 0) return;
    this.room = disconnect(this.room, playerId, Date.now());
    await this.commit();
  }

  /** Fechar um socket já em CLOSING/CLOSED lança; isso não pode abortar o fluxo do chamador. */
  private safeClose(ws: WebSocket, code: number, reason: string): void {
    try {
      ws.close(code, reason);
    } catch {
      // já fechado
    }
  }

  private attachment(ws: WebSocket): Attachment {
    return (ws.deserializeAttachment() as Attachment | null) ?? { playerId: null };
  }

  private socketsOf(playerId: string): WebSocket[] {
    return this.ctx.getWebSockets().filter((s) => this.attachment(s).playerId === playerId);
  }

  private async commit(): Promise<void> {
    if (!this.room) return;
    // Aplica transições pendentes (host, fase) antes de gravar, agendar e transmitir, para o alarme não correr com o estado.
    this.room = tick(this.room, Date.now(), Math.random);
    await this.ctx.storage.put('room', this.room);
    await this.ctx.storage.setAlarm(nextAlarmAt(this.room, Date.now()));
    for (const ws of this.ctx.getWebSockets()) {
      const playerId = this.attachment(ws).playerId;
      if (playerId) this.send(ws, { t: 'state', room: roomView(this.room, playerId) });
    }
  }

  private broadcastFx(msg: ServerMessage, exclude: string | null): void {
    for (const ws of this.ctx.getWebSockets()) {
      const playerId = this.attachment(ws).playerId;
      if (playerId && playerId !== exclude) this.send(ws, msg);
    }
  }

  private send(ws: WebSocket, msg: ServerMessage): void {
    try {
      ws.send(JSON.stringify(msg));
    } catch {
      // socket fechando; o close handler cuida da presença
    }
  }

  private sendError(ws: WebSocket, code: string): void {
    this.send(ws, { t: 'error', code, message: errorMessage(code) });
  }
}
