import { DurableObject } from 'cloudflare:workers';
import {
  ERROR_MESSAGES,
  createRoom,
  disconnect,
  isExpired,
  joinRoom,
  nextAlarmAt,
  parseClientMessage,
  roomAction,
  roomView,
  tick,
  type Room,
  type ServerMessage,
} from '@cartolina/shared';

interface Attachment {
  playerId: string | null;
}

const CURSOR_MIN_INTERVAL_MS = 25;

export class RoomDO extends DurableObject<Env> {
  private room: Room | null = null;
  private lastCursor = new Map<string, number>();

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      this.room = (await ctx.storage.get<Room>('room')) ?? null;
      if (!this.room) return;
      // Após um restart do DO, `connected` pode estar obsoleto: quem não tem socket vivo está desconectado.
      const live = new Set(ctx.getWebSockets().map((s) => this.attachment(s).playerId));
      const now = Date.now();
      let changed = false;
      for (const seat of this.room.seats) {
        if (seat.connected && !live.has(seat.id)) {
          this.room = disconnect(this.room, seat.id, now);
          changed = true;
        }
      }
      if (changed) await ctx.storage.put('room', this.room);
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
      return Response.json({ exists: this.room !== null }, { status: this.room ? 200 : 404 });
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
    if (!this.room) {
      ws.close(4004, 'not_found');
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
        other.serializeAttachment({ playerId: null } satisfies Attachment);
        other.close(4000, 'replaced');
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
    try {
      ws.close(code === 1005 || code === 1006 ? 1000 : code, reason);
    } catch {
      // já fechado
    }
    await this.handleGone(ws);
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    await this.handleGone(ws);
  }

  async alarm(): Promise<void> {
    if (!this.room) return;
    const now = Date.now();
    if (isExpired(this.room, now)) {
      for (const ws of this.ctx.getWebSockets()) ws.close(4004, 'expired');
      this.room = null;
      await this.ctx.storage.deleteAll();
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
    this.send(ws, { t: 'error', code, message: ERROR_MESSAGES[code] ?? 'Algo deu errado.' });
  }
}
