import { describe, expect, it } from 'vitest';
import { kittensMatchId, pendingKittensRecord } from '../src/games/kittens/record';
import { applyKittensAction } from '../src/games/kittens/rules';
import type { KittensState } from '../src/games/kittens/types';
import { pendingHistoryRecord } from '../src/history';
import { PLAYER_COLORS } from '../src/players';
import { createRoom, joinRoom, type Room } from '../src/room';
import { ctxOf, ids, table } from './kittens-helpers';

const ANA = { name: 'Ana', color: PLAYER_COLORS[0] };
const BETO = { name: 'Beto', color: PLAYER_COLORS[1] };
const CAIO = { name: 'Caio', color: PLAYER_COLORS[2] };

/** Sala de Tatubum com Ana, Beto e Caio (p0…p2), já com o jogo no estado dado. */
function roomWith(game: KittensState, names = ['Ana', 'Beto', 'Caio']): Room {
  let room = createRoom('TATU', 0, 'kittens');
  names.forEach((name, i) => {
    const res = joinRoom(room, { token: `t${i}`, name, color: PLAYER_COLORS[i]! }, `p${i}`, 0);
    if (!res.ok) throw new Error(res.error);
    room = res.room;
  });
  return { ...room, runStartedAt: 500, game };
}

/** Fim de partida: Caio explodiu primeiro, Ana caiu depois; Beto venceu. */
function over(): KittensState {
  return {
    ...table({ hands: { p0: [], p1: ['mico-1'], p2: [] } }),
    phase: 'gameover',
    alive: ['p1'],
    current: null,
    owed: 0,
    winner: 'p1',
    match: 3,
    exits: [
      { player: 'p2', how: 'boom' },
      { player: 'p0', how: 'left' },
    ],
    stats: { p0: { nopes: 2, defuses: 0 }, p1: { nopes: 1, defuses: 2 } },
  };
}

describe('Tatubum: registro da partida pro histórico', () => {
  it('partida terminada vira registro com quem jogou, a ordem de saída, o vencedor e os contadores', () => {
    expect(pendingKittensRecord(roomWith(over()), 9000, 'r1')).toEqual({
      key: 'TATU-500-3',
      record: {
        id: 'r1',
        matchId: 'TATU-500-3',
        roomCode: 'TATU',
        playedAt: 9000,
        players: [ANA, BETO, CAIO],
        exits: [
          { who: CAIO, how: 'boom' },
          { who: ANA, how: 'left' },
        ],
        winner: BETO,
        // Quem não tem contador (Caio) entra com zero.
        perPlayer: [
          { who: ANA, nopes: 2, defuses: 0 },
          { who: BETO, nopes: 1, defuses: 2 },
          { who: CAIO, nopes: 0, defuses: 0 },
        ],
      },
    });
  });

  it('a mesma partida não grava duas vezes', () => {
    expect(pendingKittensRecord({ ...roomWith(over()), recordedRevealKey: 'TATU-500-3' }, 9000, 'r1')).toBeNull();
  });

  it('partida em andamento, lobby ou fim sem vencedor não gravam', () => {
    expect(pendingKittensRecord(roomWith(table({ hands: { p0: [], p1: [], p2: [] } })), 9000, 'r1')).toBeNull();
    expect(pendingKittensRecord(roomWith({ ...over(), phase: 'lobby' }), 9000, 'r1')).toBeNull();
    expect(pendingKittensRecord(roomWith({ ...over(), winner: null }), 9000, 'r1')).toBeNull();
  });

  it('partida com bot não grava', () => {
    expect(pendingKittensRecord(roomWith(over(), ['Ana', 'Bot Léo', 'Caio']), 9000, 'r1')).toBeNull();
  });

  it('jogador sem assento invalida o registro (não grava partida pela metade)', () => {
    const room = roomWith(over());
    expect(pendingKittensRecord({ ...room, seats: room.seats.filter((s) => s.id !== 'p2') }, 9000, 'r1')).toBeNull();
  });

  it('jogador desconectado há muito tempo continua no registro', () => {
    const room = roomWith(over());
    const seats = room.seats.map((s) => (s.id === 'p0' ? { ...s, connected: false, disconnectedAt: 1 } : s));
    expect(pendingKittensRecord({ ...room, seats }, 9_000_000, 'r1')?.record.players).toEqual([ANA, BETO, CAIO]);
  });

  it('o id muda a cada partida e a cada sessão; "jogar de novo" grava a próxima como outra', () => {
    const room = roomWith(over());
    expect(kittensMatchId(room, over())).toBe('TATU-500-3');
    expect(kittensMatchId({ ...room, runStartedAt: 700 }, { ...over(), match: 4 })).toBe('TATU-700-4');
    const res = applyKittensAction(over(), 'p0', { type: 'again' }, ctxOf(ids(3)));
    if (!res.ok) throw new Error(res.error);
    const running = { ...room, game: res.state, recordedRevealKey: 'TATU-500-3' };
    expect(pendingKittensRecord(running, 9100, 'r2')).toBeNull();
    expect(pendingKittensRecord({ ...running, game: { ...over(), match: res.state.match } }, 9200, 'r3')?.key).toBe('TATU-500-4');
  });

  it('sala salva antes do histórico (sem match/exits/stats) grava com as saídas refeitas pelo diário', () => {
    const { match: _m, exits: _e, stats: _s, ...rest } = over();
    void _m;
    void _e;
    void _s;
    const saved = { ...rest, log: [{ n: 9, ev: { t: 'left', by: 'p0' }, seenBy: null }] } as KittensState;
    const pending = pendingKittensRecord(roomWith(saved), 9000, 'r1');
    expect(pending?.key).toBe('TATU-500-0');
    expect(pending?.record.exits).toEqual([
      { who: CAIO, how: 'boom' },
      { who: ANA, how: 'left' },
    ]);
    expect(pending?.record.perPlayer.every((x) => x.nopes === 0 && x.defuses === 0)).toBe(true);
  });

  it('o registro geral do histórico manda a partida pro Tatubum', () => {
    expect(pendingHistoryRecord(roomWith(over()), 9000, 'r1')).toMatchObject({ game: 'kittens', key: 'TATU-500-3' });
  });
});
