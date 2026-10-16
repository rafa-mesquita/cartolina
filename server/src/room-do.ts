import { DurableObject } from 'cloudflare:workers';
import {
  CLOSE_GONE,
  CLOSE_REPLACED,
  CLOSE_TIMEOUT,
  createRoom,
  disconnect,
  errorMessage,
  GAMES,
  HEARTBEAT_PING,
  HEARTBEAT_PONG,
  isExpired,
  isGameId,
  joinRoom,
  nextAlarmAt,
  parseClientMessage,
  pendingRecord,
  reconcilePresence,
  restoreRoom,
  roomAction,
  roomSummary,
  roomView,
  tick,
  type GameId,
  type Room,
  type RoundRecord,
  type ServerMessage,
} from '@cartolina/shared';
import { insertRound } from './history-db';
import { isStale, nextWakeAt } from './liveness';

/**
 * Rodada revelada ainda não confirmada no D1 (fila durável no storage do DO, uma chave por rodada).
 * Entra no mesmo `put` que marca `recordedRevealKey`, então nem queda do DO nem falha do D1 perdem a rodada.
 */
interface PendingRound {
  /** Jogo do histórico. Pendentes deixados por um servidor antigo (antes da estante) têm `groupId` e eram do ITO. */
  game?: GameId;
  groupId?: string;
  key: string;
  record: RoundRecord;
}
/** Jogo de um pendente; os deixados por um servidor antigo (só `groupId`) eram do ITO. */
export function pendingGame(round: { game?: GameId }): GameId {
  return round.game ?? 'ito';
}

const PENDING_ROUND_PREFIX = 'pendingRound:';
/** Com rodada pendente, o DO acorda pelo menos neste intervalo para tentar de novo (mesmo sem ninguém na sala). */
const PENDING_ROUND_RETRY_MS = 30_000;

interface Attachment {
  playerId: string | null;
  /** Socket descartado (substituído por reconexão ou sem heartbeat): ignora tudo que ele ainda enviar. */
  replaced?: boolean;
  /** Quando o socket foi aceito; base do heartbeat enquanto não houve nenhum ping. */
  acceptedAt?: number;
}

const CURSOR_MIN_INTERVAL_MS = 33;

export class RoomDO extends DurableObject<Env> {
  private room: Room | null = null;
  private lastCursor = new Map<string, number>();

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair(HEARTBEAT_PING, HEARTBEAT_PONG));
    ctx.blockConcurrencyWhile(async () => {
      const stored = (await ctx.storage.get<Room>('room')) ?? null;
      if (!stored) return;
      // Salas antigas não têm gameId (eram todas ITO) nem os campos do histórico.
      this.room = restoreRoom(stored);
      // Após um restart, `connected` pode estar obsoleto: quem não tem socket vivo está desconectado.
      const live = new Set(
        ctx.getWebSockets().map((s) => this.attachment(s).playerId).filter((id): id is string => id !== null),
      );
      const now = Date.now();
      const reconciled = reconcilePresence(this.room, live, now);
      if (reconciled !== this.room) {
        this.room = reconciled;
        await ctx.storage.put('room', this.room);
        await this.scheduleAlarm();
      }
    });
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/init') {
      if (this.room) return new Response('taken', { status: 409 });
      const body = ((await request.json().catch(() => null)) ?? {}) as { game?: unknown };
      const game = isGameId(body.game) ? body.game : 'ito';
      this.room = createRoom(url.searchParams.get('code') ?? '', Date.now(), game);
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
      server.serializeAttachment({ playerId: null, acceptedAt: Date.now() } satisfies Attachment);
      await this.scheduleAlarm();
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
      ws.serializeAttachment({ playerId: res.playerId, acceptedAt: this.attachment(ws).acceptedAt } satisfies Attachment);
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
        if (!GAMES[this.room.gameId].liveCursors) return;
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
        if (!GAMES[this.room.gameId].liveCursors) return;
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
    // Antes da expiração: uma sala que expira com rodada ainda pendente teria a fila apagada no deleteAll.
    await this.flushPendingRounds();
    const now = Date.now();
    if (isExpired(this.room, now)) {
      // D1 falhou a sala inteira: as rodadas que sobraram somem com o deleteAll. Fica registrado no log.
      const lost = await this.ctx.storage.list({ prefix: PENDING_ROUND_PREFIX });
      if (lost.size > 0) console.error(`sala ${this.room.code} expirou com ${lost.size} rodada(s) sem gravar no histórico`);
      for (const ws of this.ctx.getWebSockets()) this.safeClose(ws, CLOSE_GONE, 'expired');
      this.room = null;
      await this.ctx.storage.deleteAll();
      await this.ctx.storage.deleteAlarm();
      return;
    }
    const before = this.room;
    const swept = this.sweepStaleSockets(now);
    this.room = tick(this.room, now, Math.random);
    if (swept || this.room.hostId !== before.hostId || this.room.game !== before.game) await this.commit();
    else await this.scheduleAlarm();
  }

  private async handleGone(ws: WebSocket): Promise<void> {
    const playerId = this.attachment(ws).playerId;
    if (!this.room || !playerId) return;
    ws.serializeAttachment({ playerId: null } satisfies Attachment);
    if (this.socketsOf(playerId).length > 0) return;
    this.room = disconnect(this.room, playerId, Date.now());
    await this.commit();
  }

  private async scheduleAlarm(): Promise<void> {
    if (!this.room) return;
    const now = Date.now();
    let at = nextWakeAt(nextAlarmAt(this.room, now), this.liveSocketCount(), now);
    if (await this.hasPendingRounds()) at = Math.min(at, now + PENDING_ROUND_RETRY_MS);
    await this.ctx.storage.setAlarm(at);
  }

  private async hasPendingRounds(): Promise<boolean> {
    return (await this.ctx.storage.list({ prefix: PENDING_ROUND_PREFIX, limit: 1 })).size > 0;
  }

  /** Tenta gravar uma rodada pendente no D1; sai da fila só se deu certo (o UNIQUE do D1 absorve repetições). */
  private async flushRound(storageKey: string, round: PendingRound): Promise<void> {
    try {
      await insertRound(this.env.DB, pendingGame(round), round.record, round.key);
      await this.ctx.storage.delete(storageKey);
    } catch (err) {
      console.error('falha ao gravar rodada no histórico (tenta de novo no alarme)', err);
    }
  }

  private async flushPendingRounds(): Promise<void> {
    const pending = await this.ctx.storage.list<PendingRound>({ prefix: PENDING_ROUND_PREFIX });
    for (const [storageKey, round] of pending) await this.flushRound(storageKey, round);
  }

  private liveSocketCount(): number {
    return this.ctx.getWebSockets().filter((ws) => !this.attachment(ws).replaced).length;
  }

  /** Fecha sockets sem heartbeat e desconecta o jogador se não sobrou outro socket dele. Devolve true se desconectou alguém. */
  private sweepStaleSockets(now: number): boolean {
    let changed = false;
    for (const ws of this.ctx.getWebSockets()) {
      const att = this.attachment(ws);
      const lastPing = this.ctx.getWebSocketAutoResponseTimestamp(ws)?.getTime() ?? null;
      if (!isStale(lastPing, att.acceptedAt ?? now, now)) continue;
      ws.serializeAttachment({ playerId: null, replaced: true } satisfies Attachment);
      this.safeClose(ws, CLOSE_TIMEOUT, 'timeout');
      if (att.playerId && this.room && this.socketsOf(att.playerId).length === 0) {
        this.room = disconnect(this.room, att.playerId, now);
        changed = true;
      }
    }
    return changed;
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
    // Sala de um jogo que grava histórico entrou numa revelação nova: marca como gravada e põe a rodada na fila durável no MESMO put
    // (síncrono até aqui, então outro evento que intercale depois já vê a marca e não enfileira de novo).
    const pending = pendingRecord(this.room, Date.now(), crypto.randomUUID());
    let queued: [string, PendingRound] | null = null;
    if (pending) {
      this.room = { ...this.room, recordedRevealKey: pending.key };
      queued = [PENDING_ROUND_PREFIX + pending.record.id, { game: this.room.gameId, key: pending.key, record: pending.record }];
      await this.ctx.storage.put<unknown>({ room: this.room, [queued[0]]: queued[1] });
    } else {
      await this.ctx.storage.put('room', this.room);
    }
    await this.scheduleAlarm();
    for (const ws of this.ctx.getWebSockets()) {
      const playerId = this.attachment(ws).playerId;
      if (playerId) this.send(ws, { t: 'state', room: roomView(this.room, playerId) });
    }
    // Só depois de todos verem a revelação: grava no D1. Se falhar, fica na fila e o alarme tenta de novo.
    if (queued) await this.flushRound(...queued);
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
