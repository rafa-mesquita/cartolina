import { describe, expect, it } from 'vitest';
import { GAMES, PLAYER_COLORS, createRoom, joinRoom, mulberry32, pendingRecord, roomAction, type ItoAction, type Room } from '../src/index';

function play(room: Room, id: string, action: ItoAction): Room {
  const res = roomAction(room, id, action, mulberry32(7), 100);
  if (!res.ok) throw new Error(res.error);
  return res.room;
}

/** Sala de ITO sem grupo, com 2 jogadores, até a revelação. */
function revealedRoom(): Room {
  let room = createRoom('ABCD', 0);
  for (const [i, name] of ['Ana', 'Bia'].entries()) {
    const res = joinRoom(room, { token: `t${i}`, name, color: PLAYER_COLORS[i]! }, `p${i}`, 0);
    if (!res.ok) throw new Error(res.error);
    room = res.room;
  }
  room = play(room, 'p0', { type: 'start' });
  room = play(room, 'p0', { type: 'beginRound' });
  room = play(room, 'p0', { type: 'place', cardId: 'p0:0', index: 0 });
  room = play(room, 'p1', { type: 'place', cardId: 'p1:0', index: 1 });
  return play(room, 'p0', { type: 'forceReveal' });
}

describe('histórico por jogo', () => {
  it('o registro diz quem grava histórico', () => {
    expect(GAMES.ito.recordsHistory).toBe(true);
    expect(GAMES.dixit.recordsHistory).toBe(false);
  });

  it('sala de ITO sem grupo grava a revelação', () => {
    const pending = pendingRecord(revealedRoom(), 1000, 'r1');
    expect(pending?.record.id).toBe('r1');
    expect(pending?.record.cards).toHaveLength(2);
  });

  it('sala de Dixit não grava', () => {
    const room = createRoom('ABCD', 0, 'dixit');
    expect(pendingRecord(room, 1000, 'r1')).toBeNull();
  });

  it('a sala não tem mais grupo', () => {
    const room = createRoom('ABCD', 0);
    expect('group' in room).toBe(false);
  });
});
