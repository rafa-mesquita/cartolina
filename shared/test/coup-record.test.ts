import { describe, expect, it } from 'vitest';
import { coupMatchId, pendingCoupRecord } from '../src/games/coup/record';
import { applyCoupAction } from '../src/games/coup/rules';
import type { CoupState } from '../src/games/coup/types';
import { pendingHistoryRecord } from '../src/history';
import { PLAYER_COLORS } from '../src/players';
import { createRoom, joinRoom, type Room } from '../src/room';
import { THREE, ctxOf, table, withLost } from './coup-helpers';

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

  it('jogador desconectado há mais de 30 s continua no registro', () => {
    const room = roomWith(over());
    const seats = room.seats.map((s) => (s.id === 'p2' ? { ...s, connected: false, disconnectedAt: 1 } : s));
    const pending = pendingCoupRecord({ ...room, seats }, 9_000_000, 'r1');
    expect(pending?.record.players.map((p) => p.name)).toEqual(['Ana', 'Beto', 'Caio']);
    expect(pending?.record.out[0]).toEqual({ name: 'Caio', color: PLAYER_COLORS[2] });
  });

  it('jogador sem assento invalida o registro (não grava partida pela metade)', () => {
    const room = roomWith(over());
    expect(pendingCoupRecord({ ...room, seats: room.seats.filter((s) => s.id !== 'p2') }, 9000, 'r1')).toBeNull();
  });

  it('restart de verdade muda a chave: a partida 2 grava como outra', () => {
    const first = { ...over(), match: 1 };
    const room = roomWith(first);
    expect(pendingCoupRecord(room, 9000, 'r1')?.key).toBe('CUPI-500-1');
    const res = applyCoupAction(first, 'p0', { type: 'restart' }, ctxOf(['p0', 'p1', 'p2']));
    if (!res.ok) throw new Error(res.error);
    expect(res.state.phase).toBe('turn');
    expect(res.state.match).toBe(2);
    // A chave da partida 1 já está gravada; a sala em andamento não tem nada pendente.
    const running = { ...room, game: res.state, recordedRevealKey: 'CUPI-500-1' };
    expect(pendingCoupRecord(running, 9100, 'r2')).toBeNull();
    // Quando a partida 2 acaba, a chave nova passa pelo portão.
    const second = { ...over(), match: res.state.match };
    expect(pendingCoupRecord({ ...running, game: second }, 9200, 'r3')?.key).toBe('CUPI-500-2');
  });

  it('o registro geral do histórico manda a partida pro Cúpi', () => {
    expect(pendingHistoryRecord(roomWith(over()), 9000, 'r1')).toMatchObject({ game: 'coup', key: 'CUPI-500-3' });
  });
});
