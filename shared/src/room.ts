import { ito } from './games/ito/rules';
import type { ItoAction, ItoPhase, ItoState, ItoView } from './games/ito/types';
import { MAX_PLAYERS, cleanName, isPlayerColor, type PlayerColor } from './players';
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
  game: ItoState;
  lastActivity: number;
}

export interface SeatView {
  id: string;
  name: string;
  color: PlayerColor;
  connected: boolean;
}

export interface RoomView {
  code: string;
  hostId: string | null;
  you: string | null;
  seats: SeatView[];
  game: ItoView;
}

export interface RoomSummary {
  phase: ItoPhase;
  seats: SeatView[];
}

function seatView({ id, name, color, connected }: Seat): SeatView {
  return { id, name, color, connected };
}

/** Resumo público da sala para quem ainda não entrou: fase e assentos (cores ocupadas). */
export function roomSummary(room: Room): RoomSummary {
  return { phase: room.game.phase, seats: room.seats.map(seatView) };
}

export type JoinError = 'room_full' | 'bad_name' | 'bad_color' | 'color_taken';
export type JoinResult = { ok: true; room: Room; playerId: string } | { ok: false; error: JoinError };
export type RoomActionResult = { ok: true; room: Room } | { ok: false; error: string };

export function createRoom(code: string, now: number): Room {
  return { code, hostId: null, seats: [], tokens: {}, game: ito.initialState(), lastActivity: now };
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
  if (!existing && seats.length >= MAX_PLAYERS) {
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
  const game = ito.onPresenceChange(room.game, { hostId, active, rng });
  return { ...room, hostId, game };
}

export function roomAction(room: Room, playerId: string, action: ItoAction, rng: Rng, now: number): RoomActionResult {
  if (!room.seats.some((s) => s.id === playerId)) return { ok: false, error: 'not_member' };
  const res = ito.applyAction(room.game, playerId, action, {
    hostId: room.hostId,
    active: activePlayers(room, now),
    rng,
  });
  if (!res.ok) return res;
  return { ok: true, room: { ...room, game: res.state, lastActivity: now } };
}

export function roomView(room: Room, viewerId: string | null): RoomView {
  return {
    code: room.code,
    hostId: room.hostId,
    you: viewerId,
    seats: room.seats.map(seatView),
    game: ito.viewFor(room.game, viewerId),
  };
}

export function isExpired(room: Room, now: number): boolean {
  return now - room.lastActivity >= ROOM_TTL_MS;
}

/** Próximo momento em que o servidor precisa acordar: fim de uma tolerância de desconexão ou expiração. */
export function nextAlarmAt(room: Room, now: number): number {
  const pending = room.seats
    .filter((s) => !s.connected && s.disconnectedAt !== null)
    .map((s) => s.disconnectedAt! + DISCONNECT_GRACE_MS + 1000)
    .filter((at) => at > now);
  return Math.min(room.lastActivity + ROOM_TTL_MS, ...pending);
}
