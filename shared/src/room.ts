import { GAMES, type GameAction, type GameId, type GameState, type GameView } from './games/registry';
import { withDixitCounters } from './games/dixit/rules';
import type { DixitState, DixitView } from './games/dixit/types';
import type { CoupState, CoupView } from './games/coup/types';
import type { PicturesView } from './games/pictures/types';
import type { ItoState, ItoView } from './games/ito/types';
import { cleanName, isPlayerColor, type PlayerColor } from './players';
import type { Rng } from './rng';

export const DISCONNECT_GRACE_MS = 30_000;
export const ROOM_TTL_MS = 6 * 60 * 60 * 1000;

export interface Seat {
  id: string;
  name: string;
  color: PlayerColor;
  connected: boolean;
  disconnectedAt: number | null;
}

export interface Room {
  code: string;
  hostId: string | null;
  seats: Seat[];
  /** token secreto → playerId público. Nunca sai do servidor. */
  tokens: Record<string, string>;
  /** Jogo da sala, fixo desde a criação. */
  gameId: GameId;
  game: GameState;
  lastActivity: number;
  /** Quando o host começou a partida (saiu do lobby); identifica a campanha do ITO e a sessão (partida) do Diquisti. */
  runStartedAt: number | null;
  /** Chave da última revelação (ITO ou Diquisti) já gravada no histórico (evita duplicar). */
  recordedRevealKey: string | null;
}

export interface SeatView {
  id: string;
  name: string;
  color: PlayerColor;
  connected: boolean;
}

export interface RoomView<G extends GameView = GameView> {
  code: string;
  hostId: string | null;
  you: string | null;
  seats: SeatView[];
  gameId: GameId;
  game: G;
}

export type ItoRoomView = RoomView<ItoView> & { gameId: 'ito' };
export type DixitRoomView = RoomView<DixitView> & { gameId: 'dixit' };

export function isItoRoomView(view: RoomView): view is ItoRoomView {
  return view.gameId === 'ito';
}

export function isDixitRoomView(view: RoomView): view is DixitRoomView {
  return view.gameId === 'dixit';
}

export type PicturesRoomView = RoomView<PicturesView> & { gameId: 'pictures' };

export function isPicturesRoomView(view: RoomView): view is PicturesRoomView {
  return view.gameId === 'pictures';
}

export type CoupRoomView = RoomView<CoupView> & { gameId: 'coup' };

export function isCoupRoomView(view: RoomView): view is CoupRoomView {
  return view.gameId === 'coup';
}

export interface RoomSummary {
  game: GameId;
  phase: GameState['phase'];
  seats: SeatView[];
}

function seatView({ id, name, color, connected }: Seat): SeatView {
  return { id, name, color, connected };
}

/** Estado do ITO, ou null se a sala é de outro jogo. */
export function itoStateOf(room: Room): ItoState | null {
  return room.gameId === 'ito' ? (room.game as ItoState) : null;
}

/** Estado do Diquisti, ou null se a sala é de outro jogo. */
export function dixitStateOf(room: Room): DixitState | null {
  return room.gameId === 'dixit' ? (room.game as DixitState) : null;
}

/** Estado do Cúpi, ou null se a sala é de outro jogo. */
export function coupStateOf(room: Room): CoupState | null {
  return room.gameId === 'coup' ? (room.game as CoupState) : null;
}

type StoredRoom = Omit<Room, 'gameId' | 'runStartedAt' | 'recordedRevealKey'> &
  Partial<Pick<Room, 'gameId' | 'runStartedAt' | 'recordedRevealKey'>> & {
    /** Salas gravadas antes da estante de jogos tinham grupo; o campo é ignorado. */
    group?: unknown;
  };

/** Sala lida do storage: salas antigas não têm `gameId` (eram todas ITO) e podem ter `group` (ignorado). */
export function restoreRoom(stored: StoredRoom): Room {
  const { group: _legacyGroup, ...rest } = stored;
  const gameId = stored.gameId ?? 'ito';
  return {
    ...rest,
    gameId,
    // Diquisti gravado antes do histórico não tem `match`/`round`.
    game: gameId === 'dixit' ? withDixitCounters(rest.game as DixitState) : rest.game,
    runStartedAt: stored.runStartedAt ?? null,
    recordedRevealKey: stored.recordedRevealKey ?? null,
  };
}

/** Resumo público da sala para quem ainda não entrou: jogo, fase e assentos (cores ocupadas). */
export function roomSummary(room: Room): RoomSummary {
  return { game: room.gameId, phase: room.game.phase, seats: room.seats.map(seatView) };
}

export type JoinError = 'room_full' | 'bad_name' | 'bad_color' | 'color_taken';
export type JoinResult = { ok: true; room: Room; playerId: string } | { ok: false; error: JoinError };
export type RoomActionResult = { ok: true; room: Room } | { ok: false; error: string };

export function createRoom(code: string, now: number, gameId: GameId = 'ito'): Room {
  return {
    code,
    hostId: null,
    seats: [],
    tokens: {},
    gameId,
    game: GAMES[gameId].module.initialState(),
    lastActivity: now,
    runStartedAt: null,
    recordedRevealKey: null,
  };
}

function isActive(seat: Seat, now: number): boolean {
  return seat.connected || (seat.disconnectedAt !== null && now - seat.disconnectedAt < DISCONNECT_GRACE_MS);
}

export function activePlayers(room: Room, now: number): string[] {
  return room.seats.filter((s) => isActive(s, now)).map((s) => s.id);
}

export function joinRoom(
  room: Room,
  input: { token: string; name: string; color: string },
  newId: string,
  now: number,
): JoinResult {
  const name = cleanName(input.name);
  if (!name) return { ok: false, error: 'bad_name' };
  if (!isPlayerColor(input.color)) return { ok: false, error: 'bad_color' };
  const color = input.color;
  // Object.hasOwn: tokens como '__proto__' ou 'toString' não podem resolver para o protótipo.
  const known = Object.hasOwn(room.tokens, input.token) ? room.tokens[input.token] : undefined;
  const id = typeof known === 'string' ? known : newId;

  let seats = room.seats;
  let tokens = room.tokens;
  const existing = seats.find((s) => s.id === id);
  if (!existing && seats.length >= GAMES[room.gameId].maxPlayers) {
    const ghost = seats.find((s) => !isActive(s, now) && !room.game.players.includes(s.id));
    if (!ghost) return { ok: false, error: 'room_full' };
    seats = seats.filter((s) => s.id !== ghost.id);
    tokens = Object.fromEntries(Object.entries(tokens).filter(([, v]) => v !== ghost.id));
  }
  if (seats.some((s) => s.id !== id && s.color === color)) return { ok: false, error: 'color_taken' };

  const seat: Seat = { id, name, color, connected: true, disconnectedAt: null };
  seats = existing ? seats.map((s) => (s.id === id ? seat : s)) : [...seats, seat];
  const hostId = room.hostId !== null && seats.some((s) => s.id === room.hostId) ? room.hostId : id;
  return {
    ok: true,
    playerId: id,
    room: { ...room, seats, hostId, tokens: { ...tokens, [input.token]: id }, lastActivity: now },
  };
}

export function disconnect(room: Room, playerId: string, now: number): Room {
  return {
    ...room,
    seats: room.seats.map((s) => (s.id === playerId ? { ...s, connected: false, disconnectedAt: now } : s)),
    lastActivity: now,
  };
}

/** Reavalia host e regras dependentes de presença (ex.: revelação automática). */
export function tick(room: Room, now: number, rng: Rng): Room {
  const active = activePlayers(room, now);
  let hostId = room.hostId;
  if (hostId === null || !active.includes(hostId)) {
    const order = room.seats.map((s) => s.id);
    const start = hostId === null ? 0 : order.indexOf(hostId) + 1;
    const rotated = [...order.slice(start), ...order.slice(0, start)];
    const connected = new Set(room.seats.filter((s) => s.connected).map((s) => s.id));
    hostId =
      rotated.find((id) => connected.has(id)) ?? rotated.find((id) => active.includes(id)) ?? hostId;
  }
  const game = GAMES[room.gameId].module.onPresenceChange(room.game, { hostId, active, rng, now });
  return { ...room, hostId, game };
}

/** `action` chega do WebSocket só com `type` garantido: aqui é validada pelo schema do jogo da sala. */
export function roomAction(room: Room, playerId: string, action: unknown, rng: Rng, now: number): RoomActionResult {
  if (!room.seats.some((s) => s.id === playerId)) return { ok: false, error: 'not_member' };
  const entry = GAMES[room.gameId];
  const parsed = entry.actionSchema.safeParse(action);
  if (!parsed.success) return { ok: false, error: 'bad_action' };
  const res = entry.module.applyAction(room.game, playerId, parsed.data as GameAction, {
    hostId: room.hostId,
    active: activePlayers(room, now),
    rng,
    now,
  });
  if (!res.ok) return res;
  const startedRun = room.game.phase === 'lobby' && res.state.phase !== 'lobby';
  return {
    ok: true,
    room: { ...room, game: res.state, lastActivity: now, runStartedAt: startedRun ? now : (room.runStartedAt ?? null) },
  };
}

export function roomView(room: Room, viewerId: string | null): RoomView {
  return {
    code: room.code,
    hostId: room.hostId,
    you: viewerId,
    seats: room.seats.map(seatView),
    gameId: room.gameId,
    game: GAMES[room.gameId].module.viewFor(room.game, viewerId),
  };
}

export function isExpired(room: Room, now: number): boolean {
  return now - room.lastActivity >= ROOM_TTL_MS;
}

/** Próximo momento em que o servidor precisa acordar: fim de uma tolerância de desconexão, prazo do jogo ou expiração. */
export function nextAlarmAt(room: Room, now: number): number {
  const pending = room.seats
    .filter((s) => !s.connected && s.disconnectedAt !== null)
    .map((s) => s.disconnectedAt! + DISCONNECT_GRACE_MS + 1000)
    .filter((at) => at > now);
  const deadline = GAMES[room.gameId].module.nextDeadline?.(room.game) ?? null;
  // Prazo vencido acorda na hora. Não entra em loop: o tick fecha a fase e zera o prazo.
  if (deadline !== null) pending.push(Math.max(deadline, now));
  return Math.min(room.lastActivity + ROOM_TTL_MS, ...pending);
}

/**
 * Após um reinício do servidor, quem consta como conectado mas não tem socket vivo
 * passa a desconectado. Não é atividade: `lastActivity` não muda.
 */
export function reconcilePresence(room: Room, liveIds: ReadonlySet<string>, now: number): Room {
  const stale = room.seats.filter((s) => s.connected && !liveIds.has(s.id));
  if (stale.length === 0) return room;
  return {
    ...room,
    seats: room.seats.map((s) => (stale.includes(s) ? { ...s, connected: false, disconnectedAt: now } : s)),
  };
}
