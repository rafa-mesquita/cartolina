import { describe, expect, it } from 'vitest';
import { coupMatchId, pendingCoupRecord } from '../src/games/coup/record';
import type { CoupState } from '../src/games/coup/types';
import { pendingHistoryRecord } from '../src/history';
import { PLAYER_COLORS } from '../src/players';
import { createRoom, joinRoom, type Room } from '../src/room';
import { THREE, table, withLost } from './coup-helpers';

/** Sala de Cúpi com Ana, Beto e Caio (p0…p2), já com o jogo no estado dado. */
function roomWith(game: CoupState, names = ['Ana', 'Beto', 'Caio']): Room {
  let room = createRoom('CUPI', 0, 'coup');
  names.forEach((name, i) => {
    const res = joinRoom(room, { token: `t${i}`, name, color: PLAYER_COLORS[i]! }, `p${i}`, 0);
    if (!res.ok) throw new Error(res.error);
    room = res.room;
  });
  return { ...room, runStartedAt: 500, game };
}

/** Fim de partida: Caio saiu primeiro, depois Ana; Beto venceu com o Assassino. */
function over(): CoupState {
  let s = table(THREE);
  s = withLost(withLost(s, 'p2', 0), 'p2', 1);
  s = withLost(withLost(s, 'p0', 0), 'p0', 1);
  s = withLost(s, 'p1', 0);
  return { ...s, phase: 'over', turn: null, winner: 'p1', out: ['p2', 'p0'], match: 3 };
}

describe('Cúpi: registro da partida pro histórico', () => {
  it('partida terminada vira registro com quem jogou, ordem de saída, vencedor e as cartas dele', () => {
    const pending = pendingCoupRecord(roomWith(over()), 9000, 'r1');
    expect(pending).toEqual({
      key: 'CUPI-500-3',
      record: {
        id: 'r1',
        matchId: 'CUPI-500-3',
        roomCode: 'CUPI',
        playedAt: 9000,
        players: [
          { name: 'Ana', color: PLAYER_COLORS[0] },
          { name: 'Beto', color: PLAYER_COLORS[1] },
          { name: 'Caio', color: PLAYER_COLORS[2] },
        ],
        out: [
          { name: 'Caio', color: PLAYER_COLORS[2] },
          { name: 'Ana', color: PLAYER_COLORS[0] },
        ],
        winner: { name: 'Beto', color: PLAYER_COLORS[1] },
        winnerCards: ['assassin'],
      },
    });
  });

  it('a mesma partida não grava duas vezes', () => {
    const room = roomWith(over());
    expect(pendingCoupRecord({ ...room, recordedRevealKey: 'CUPI-500-3' }, 9000, 'r1')).toBeNull();
  });

  it('partida em andamento não grava', () => {
    expect(pendingCoupRecord(roomWith(table(THREE)), 9000, 'r1')).toBeNull();
  });

  it('partida com bot não grava', () => {
    expect(pendingCoupRecord(roomWith(over(), ['Ana', 'Bot Léo', 'Caio']), 9000, 'r1')).toBeNull();
  });

  it('o id muda a cada partida e a cada sessão', () => {
    const room = roomWith(over());
    expect(coupMatchId(room, over())).toBe('CUPI-500-3');
    expect(coupMatchId({ ...room, runStartedAt: 700 }, { ...over(), match: 4 })).toBe('CUPI-700-4');
  });

  it('o registro geral do histórico manda a partida pro Cúpi', () => {
    expect(pendingHistoryRecord(roomWith(over()), 9000, 'r1')).toMatchObject({ game: 'coup', key: 'CUPI-500-3' });
  });
});
