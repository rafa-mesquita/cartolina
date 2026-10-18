import {
  PLAYER_COLORS,
  createRoom,
  joinRoom,
  mulberry32,
  roomAction,
  roomView,
  type ItoAction,
  type ItoRoomView,
  type ItoState,
  type Room,
} from '@cartolina/shared';

/** Sala de ITO: os testes da web só montam salas assim. */
export type ItoRoom = Room & { game: ItoState };

export function makeRoom(n: number): ItoRoom {
  let room = createRoom('ABCD', 0);
  for (let i = 0; i < n; i++) {
    const res = joinRoom(room, { token: `t${i}`, name: `P${i}`, color: PLAYER_COLORS[i]! }, `p${i}`, 0);
    if (!res.ok) throw new Error(res.error);
    room = res.room;
  }
  return room as ItoRoom;
}

export function act(room: Room, playerId: string, action: ItoAction, seed = 1): ItoRoom {
  const res = roomAction(room, playerId, action, mulberry32(seed), 0);
  if (!res.ok) throw new Error(`ação recusada: ${res.error}`);
  return res.room as ItoRoom;
}

export function sortingRoom(n: number): ItoRoom {
  return act(act(makeRoom(n), 'p0', { type: 'start' }), 'p0', { type: 'beginRound' });
}

export const viewOf = (room: Room, id: string | null): ItoRoomView => roomView(room, id) as ItoRoomView;

/**
 * Revelação de 2 cartas (com dicas "dica0"/"dica1"). `wrong` = procura um sorteio/ordem em que alguma carta
 * fique fora de ordem (true) ou toda certa (false); `undefined` aceita o primeiro.
 */
export function revealedItoView(wrong?: boolean): ItoRoomView {
  for (let seed = 1; seed < 60; seed++) {
    for (const order of [[0, 1], [1, 0]] as const) {
      let room = act(act(makeRoom(2), 'p0', { type: 'start' }, seed), 'p0', { type: 'beginRound' }, seed);
      for (const [slot, who] of order.entries()) {
        room = act(room, `p${who}`, { type: 'clue', cardId: `p${who}:0`, text: `dica${who}` }, seed);
        room = act(room, `p${who}`, { type: 'place', cardId: `p${who}:0`, index: slot }, seed);
      }
      room = act(room, 'p0', { type: 'forceReveal' }, seed);
      const view = viewOf(room, 'p0');
      if (wrong === undefined || (view.game.reveal ?? []).some((e) => e.error) === wrong) return view;
    }
  }
  throw new Error('sem sorteio com esse resultado');
}
