import { describe, expect, it } from 'vitest';
import { GAMES, isGameId } from '../src/games/registry';
import { PLAYER_COLORS } from '../src/players';
import { parseClientMessage } from '../src/protocol';
import { mulberry32 } from '../src/rng';
import {
  createRoom,
  isDixitRoomView,
  isItoRoomView,
  itoStateOf,
  joinRoom,
  restoreRoom,
  roomAction,
  roomSummary,
  roomView,
  tick,
  type Room,
} from '../src/room';

const rng = mulberry32(3);

function dixitRoom(n: number): Room {
  let room = createRoom('ABCD', 0, null, 'dixit');
  for (let i = 0; i < n; i++) {
    const res = joinRoom(room, { token: `t${i}`, name: `P${i}`, color: PLAYER_COLORS[i]! }, `p${i}`, 0);
    if (!res.ok) throw new Error(res.error);
    room = res.room;
  }
  return room;
}

describe('registro de jogos', () => {
  it('conhece ITO e Dixit', () => {
    expect(Object.keys(GAMES)).toEqual(['ito', 'dixit']);
    expect(GAMES.dixit.minPlayers).toBe(3);
    expect(GAMES.ito.liveCursors).toBe(true);
    expect(GAMES.dixit.liveCursors).toBe(false);
    expect(isGameId('dixit')).toBe(true);
    expect(isGameId('xadrez')).toBe(false);
    expect(isGameId(undefined)).toBe(false);
  });
});

describe('sala com jogo', () => {
  it('sala nova é de ITO por padrão', () => {
    const room = createRoom('ABCD', 0);
    expect(room.gameId).toBe('ito');
    expect(itoStateOf(room)).not.toBeNull();
    expect(isItoRoomView(roomView(room, null))).toBe(true);
  });

  it('sala de Dixit começa no lobby do Dixit', () => {
    const room = createRoom('ABCD', 0, null, 'dixit');
    expect(room.gameId).toBe('dixit');
    expect(room.game.phase).toBe('lobby');
    expect(itoStateOf(room)).toBeNull();
    const view = roomView(room, null);
    expect(isDixitRoomView(view)).toBe(true);
    expect(view.gameId).toBe('dixit');
    expect(roomSummary(room)).toEqual({ game: 'dixit', phase: 'lobby', seats: [] });
  });

  it('ação é validada pelo jogo da sala', () => {
    const room = dixitRoom(3);
    expect(roomAction(room, 'p0', { type: 'beginRound' }, rng, 1)).toEqual({ ok: false, error: 'bad_action' });
    expect(roomAction(room, 'p0', { type: 'setTarget', target: 99 }, rng, 1)).toEqual({ ok: false, error: 'bad_action' });
    const res = roomAction(room, 'p0', { type: 'start' }, rng, 1);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.room.game.phase).toBe('storytelling');
      expect(res.room.runStartedAt).toBe(1);
    }
  });

  it('ação do Dixit em sala de ITO dá bad_action', () => {
    let room = createRoom('ABCD', 0);
    const res = joinRoom(room, { token: 't0', name: 'Ana', color: PLAYER_COLORS[0] }, 'p0', 0);
    if (!res.ok) throw new Error(res.error);
    room = res.room;
    expect(roomAction(room, 'p0', { type: 'tell', cardId: 'd001', clue: '' }, rng, 1)).toEqual({ ok: false, error: 'bad_action' });
  });

  it('tick usa a presença do jogo da sala', () => {
    const started = roomAction(dixitRoom(4), 'p0', { type: 'start' }, rng, 1);
    if (!started.ok) throw new Error(started.error);
    const room = started.room;
    expect(tick(room, 2, rng).game).toBe(room.game);
  });

  it('visão do Dixit esconde a mão dos outros', () => {
    const started = roomAction(dixitRoom(3), 'p0', { type: 'start' }, rng, 1);
    if (!started.ok) throw new Error(started.error);
    const view = roomView(started.room, 'p1');
    if (!isDixitRoomView(view)) throw new Error('esperava Dixit');
    expect(view.game.hand).toHaveLength(7);
    expect(view.game.handCounts.p2).toBe(7);
  });
});

describe('restoreRoom', () => {
  it('sala antiga sem gameId (e sem campos do histórico) abre como ITO', () => {
    const { gameId: _g, group: _gr, runStartedAt: _r, recordedRevealKey: _k, ...old } = createRoom('ABCD', 0);
    const room = restoreRoom(old);
    expect(room.gameId).toBe('ito');
    expect(room.group).toBeNull();
    expect(room.runStartedAt).toBeNull();
    expect(room.recordedRevealKey).toBeNull();
  });

  it('mantém o que já existe', () => {
    const room = createRoom('ABCD', 0, null, 'dixit');
    expect(restoreRoom(room)).toEqual(room);
  });
});

describe('envelope de ação', () => {
  it('aceita qualquer ação com type; sem type é mensagem inválida', () => {
    expect(parseClientMessage(JSON.stringify({ t: 'action', action: { type: 'tell', cardId: 'd001', clue: 'x' } }))).not.toBeNull();
    expect(parseClientMessage(JSON.stringify({ t: 'action', action: { cardId: 'd001' } }))).toBeNull();
    expect(parseClientMessage(JSON.stringify({ t: 'action', action: 'start' }))).toBeNull();
  });
});

describe('ação do ITO validada pela sala', () => {
  it('índice negativo vira bad_action (o envelope não valida mais o corpo)', () => {
    let room = createRoom('ABCD', 0);
    const res = joinRoom(room, { token: 't0', name: 'Ana', color: PLAYER_COLORS[0] }, 'p0', 0);
    if (!res.ok) throw new Error(res.error);
    room = res.room;
    expect(roomAction(room, 'p0', { type: 'place', cardId: 'a:0', index: -1 }, rng, 1)).toEqual({ ok: false, error: 'bad_action' });
  });
});
