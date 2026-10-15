import { PLAYER_COLORS, createRoom, joinRoom, mulberry32, roomAction, roomView, type ItoAction, type Room, type RoomView } from '@cartolina/shared';

export function makeRoom(n: number): Room {
  let room = createRoom('ABCD', 0);
  for (let i = 0; i < n; i++) {
    const res = joinRoom(room, { token: `t${i}`, name: `P${i}`, color: PLAYER_COLORS[i]! }, `p${i}`, 0);
    if (!res.ok) throw new Error(res.error);
    room = res.room;
  }
  return room;
}

export function act(room: Room, playerId: string, action: ItoAction, seed = 1): Room {
  const res = roomAction(room, playerId, action, mulberry32(seed), 0);
  if (!res.ok) throw new Error(`ação recusada: ${res.error}`);
  return res.room;
}

export function sortingRoom(n: number): Room {
  return act(act(makeRoom(n), 'p0', { type: 'start' }), 'p0', { type: 'beginRound' });
}

export const viewOf = (room: Room, id: string | null): RoomView => roomView(room, id);
