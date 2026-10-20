import {
  PLAYER_COLORS,
  createRoom,
  isCamelioRoomView,
  joinRoom,
  mulberry32,
  roomAction,
  roomView,
  type CamelioRoomView,
  type CamelioState,
  type GameAction,
  type Room,
} from '@cartolina/shared';

/** Sala de Cama-Leão com `n` jogadores p0…: único lugar das fixtures do Cama-Leão que chama `createRoom`. */
export function camelioRoom(n: number): Room {
  let room = createRoom('ABCD', 0, 'camelio');
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

export function stateOf(room: Room): CamelioState {
  if (room.gameId !== 'camelio') throw new Error('esperava sala de Cama-Leão');
  return room.game as CamelioState;
}

export function camelioView(room: Room, viewer: string | null): CamelioRoomView {
  const v = roomView(room, viewer);
  if (!isCamelioRoomView(v)) throw new Error('esperava sala de Cama-Leão');
  return v;
}

/** Partida começada com `n` jogadores (o host p0 começa; o rng fixo decide quem tem a vez). */
export const started = (n = 2): Room => play(camelioRoom(n), 'p0', { type: 'start' });

/** Quem tem a vez pega a carta aberta e fica com ela. */
export function playTurn(room: Room): Room {
  const turn = stateOf(room).turn;
  if (!turn) throw new Error('ninguém tem a vez');
  return play(room, turn, { type: 'play', from: 'open', to: turn });
}

/**
 * Sala com o estado do jogo trocado em parte, pra montar fim de partida, mesas e áreas de pontos sem jogar até lá.
 * Ids do baralho: 22 = vermelho 3, 20 = vermelho 2, 23 = vermelho 4, 32/34 = azul 2/3, 8/10 = amarelo 2/3, 0 = verde 1.
 */
export function patchGame(room: Room, patch: Partial<CamelioState>): Room {
  return { ...room, game: { ...stateOf(room), ...patch } };
}
