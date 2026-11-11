import {
  PLAYER_COLORS,
  createRoom,
  isMandacaruRoomView,
  joinRoom,
  mandacaruStateOf,
  mulberry32,
  roomAction,
  roomView,
  type MandacaruRoomView,
  type MandacaruState,
  type Room,
} from '@cartolina/shared';

export const NAMES = ['Ana', 'Beto', 'Caio', 'Duda', 'Eva', 'Fabi'];
export const T0 = 1_000_000;

/** Sala de Mandacaru no lobby com `n` pessoas (p0 é o anfitrião). */
export function mandacaruLobbyRoom(n: number): Room {
  let room = createRoom('MAND', 0, 'mandacaru');
  for (let i = 0; i < n; i++) {
    const res = joinRoom(room, { token: `t${i}`, name: NAMES[i]!, color: PLAYER_COLORS[i]! }, `p${i}`, 0);
    if (!res.ok) throw new Error(res.error);
    room = res.room;
  }
  return room;
}

export function step(room: Room, playerId: string, action: unknown, now = T0, seed = 1): Room {
  const res = roomAction(room, playerId, action, mulberry32(seed), now);
  if (!res.ok) throw new Error(`ação recusada: ${res.error}`);
  return res.room;
}

/** Sala começada (preparação) com a semente dada. */
export function mandacaruRoom(n = 3, seed = 1): Room {
  return step(mandacaruLobbyRoom(n), 'p0', { type: 'start' }, T0, seed);
}

export function viewOf(room: Room, playerId: string | null): MandacaruRoomView {
  const v = roomView(room, playerId);
  if (!isMandacaruRoomView(v)) throw new Error('não é sala de Mandacaru');
  return v;
}

/** Troca o estado do jogo da sala (pra montar situações nos testes). */
export function withGame(room: Room, edit: (s: MandacaruState) => MandacaruState): Room {
  return { ...room, game: edit(mandacaruStateOf(room)!) };
}

/** Faz a preparação toda pelo primeiro lugar de cada `can` (sala pronta pra rolar). */
export function afterSetup(room: Room): Room {
  let r = room;
  for (let i = 0; i < 20; i++) {
    const s = mandacaruStateOf(r)!;
    if (s.phase !== 'setup') return r;
    const p = s.turn!;
    const can = viewOf(r, p).game.can;
    if (can.placeHouse.length) r = step(r, p, { type: 'place_house', vertex: can.placeHouse[0]! });
    else r = step(r, p, { type: 'place_road', edge: can.placeRoad[0]! });
  }
  return r;
}
