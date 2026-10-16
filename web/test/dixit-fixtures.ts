import {
  PLAYER_COLORS,
  createRoom,
  isDixitRoomView,
  joinRoom,
  mulberry32,
  roomAction,
  roomView,
  type DixitRoomView,
  type DixitState,
  type GameAction,
  type Room,
} from '@cartolina/shared';

/** Sala de Diquisti com `n` jogadores p0…: único lugar que chama `createRoom` (a estante muda a assinatura). */
export function dixitRoom(n: number): Room {
  let room = createRoom('ABCD', 0, null, 'dixit');
  for (let i = 0; i < n; i++) {
    const res = joinRoom(room, { token: `t${i}`, name: `P${i}`, color: PLAYER_COLORS[i]! }, `p${i}`, 0);
    if (!res.ok) throw new Error(res.error);
    room = res.room;
  }
  return room;
}

export function play(room: Room, id: string, action: GameAction, seed = 1): Room {
  const res = roomAction(room, id, action, mulberry32(seed), 0);
  if (!res.ok) throw new Error(`ação recusada: ${res.error}`);
  return res.room;
}

export const stateOf = (room: Room): DixitState => room.game as DixitState;

export function dixitView(room: Room, id: string | null): DixitRoomView {
  const v = roomView(room, id);
  if (!isDixitRoomView(v)) throw new Error('esperava sala de Diquisti');
  return v;
}

export const started = (n = 4): Room => play(dixitRoom(n), 'p0', { type: 'start' });

export function told(n = 4, clue = 'saudade'): Room {
  const room = started(n);
  const st = stateOf(room).storyteller!;
  return play(room, st, { type: 'tell', cardId: stateOf(room).hands[st]![0]!, clue });
}

export const othersOf = (room: Room): string[] => stateOf(room).inRound.filter((p) => p !== stateOf(room).storyteller);

export function voting(n = 4): Room {
  let room = told(n);
  const per = n === 3 ? 2 : 1;
  for (const p of othersOf(room)) {
    room = play(room, p, { type: 'submit', cardIds: stateOf(room).hands[p]!.slice(0, per) });
    room = play(room, p, { type: 'confirm' });
  }
  return room;
}

/** Todos votam na carta do narrador (todo mundo achou) ou com `choose`. */
export function revealed(n = 4, choose?: (room: Room, p: string) => string): Room {
  let room = voting(n);
  for (const p of othersOf(room)) {
    room = play(room, p, { type: 'vote', cardId: choose ? choose(room, p) : stateOf(room).storyCard! });
    room = play(room, p, { type: 'confirm' });
  }
  return room;
}
