import {
  PLAYER_COLORS,
  createRoom,
  isPicturesRoomView,
  joinRoom,
  mulberry32,
  roomAction,
  roomView,
  type GameAction,
  type PicturesRoomView,
  type PicturesState,
  type Room,
} from '@cartolina/shared';
import { randomWork } from '../src/games/pictures/random';

/** Sala de Retratim com `n` jogadores p0…: único lugar das fixtures do Retratim que chama `createRoom`. */
export function picturesRoom(n: number): Room {
  let room = createRoom('ABCD', 0, 'pictures');
  for (let i = 0; i < n; i++) {
    const res = joinRoom(room, { token: `t${i}`, name: `P${i}`, color: PLAYER_COLORS[i]! }, `p${i}`, 0);
    if (!res.ok) throw new Error(res.error);
    room = res.room;
  }
  return room;
}

export function play(room: Room, id: string, action: GameAction, now = 0): Room {
  const res = roomAction(room, id, action, mulberry32(1), now);
  if (!res.ok) throw new Error(`ação recusada: ${res.error}`);
  return res.room;
}

export function stateOf(room: Room): PicturesState {
  if (room.gameId !== 'pictures') throw new Error('esperava sala de Retratim');
  return room.game as PicturesState;
}

export function picturesView(room: Room, viewer: string | null): PicturesRoomView {
  const v = roomView(room, viewer);
  if (!isPicturesRoomView(v)) throw new Error('esperava sala de Retratim');
  return v;
}

export const started = (n = 3): Room => play(picturesRoom(n), 'p0', { type: 'start' });

/** Todos mandam "pronto" com uma obra aleatória do próprio kit: a mesa vai pro palpite. */
export function guessing(n = 3): Room {
  let room = started(n);
  for (const p of stateOf(room).inRound) {
    room = play(room, p, { type: 'ready', on: true, work: randomWork(stateOf(room).kits[p]!) });
  }
  return room;
}

/** Todos palpitam a coordenada certa de cada obra alheia e confirmam: a mesa vai pra revelação. */
export function revealed(n = 3): Room {
  let room = guessing(n);
  const st = stateOf(room);
  for (const p of st.inRound) {
    for (const artist of st.inRound) {
      if (artist === p || !Object.hasOwn(st.works, artist)) continue;
      room = play(room, p, { type: 'guess', artist, coord: st.secrets[artist]! });
    }
    room = play(room, p, { type: 'confirm' });
  }
  return room;
}
