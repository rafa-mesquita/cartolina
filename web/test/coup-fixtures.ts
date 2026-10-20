import {
  PLAYER_COLORS,
  createRoom,
  isCoupRoomView,
  joinRoom,
  mulberry32,
  roomAction,
  roomView,
  type CoupRoomView,
  type Room,
} from '@cartolina/shared';

export const NAMES = ['Ana', 'Beto', 'Caio', 'Duda', 'Eva', 'Fabi'];
export const T0 = 1_000_000;

/** Sala de Cúpi no lobby com `n` pessoas (p0 é o anfitrião), ainda sem começar. */
export function coupLobbyRoom(n: number): Room {
  let room = createRoom('CUPI', 0, 'coup');
  for (let i = 0; i < n; i++) {
    const res = joinRoom(room, { token: `t${i}`, name: NAMES[i]!, color: PLAYER_COLORS[i]! }, `p${i}`, 0);
    if (!res.ok) throw new Error(res.error);
    room = res.room;
  }
  return room;
}

/** Sala de Cúpi com `n` pessoas (p0 é o anfitrião), começada com a semente dada. */
export function coupRoom(n: number, seed = 1): Room {
  return step(coupLobbyRoom(n), 'p0', { type: 'start' }, T0, seed);
}

/** Aplica uma ação pela sala (schema + regras, como o servidor). */
export function step(room: Room, playerId: string, action: unknown, now = T0, seed = 1): Room {
  const res = roomAction(room, playerId, action, mulberry32(seed), now);
  if (!res.ok) throw new Error(`ação recusada: ${res.error}`);
  return res.room;
}

/** Visão da sala pra `playerId` (null = quem assiste). */
export function viewOf(room: Room, playerId: string | null): CoupRoomView {
  const v = roomView(room, playerId);
  if (!isCoupRoomView(v)) throw new Error('não é sala de Cúpi');
  return v;
}

/** Quem é a vez agora. */
export const turnOf = (room: Room): string => viewOf(room, null).game.turn!;
