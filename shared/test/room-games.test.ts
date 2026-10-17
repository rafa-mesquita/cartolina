import { describe, expect, it } from 'vitest';
import { GAMES, isGameId } from '../src/games/registry';
import { PICTURES_COUNTDOWN_MS, type PicturesState } from '../src/games/pictures/types';
import { PLAYER_COLORS } from '../src/players';
import { ERROR_CODES, errorMessage, parseClientMessage } from '../src/protocol';
import { mulberry32 } from '../src/rng';
import {
  createRoom,
  isDixitRoomView,
  isItoRoomView,
  isPicturesRoomView,
  itoStateOf,
  joinRoom,
  nextAlarmAt,
  restoreRoom,
  roomAction,
  roomSummary,
  roomView,
  tick,
  type Room,
} from '../src/room';
import { sampleWork } from './pictures-helpers';

const rng = mulberry32(3);

function dixitRoom(n: number): Room {
  let room = createRoom('ABCD', 0, 'dixit');
  for (let i = 0; i < n; i++) {
    const res = joinRoom(room, { token: `t${i}`, name: `P${i}`, color: PLAYER_COLORS[i]! }, `p${i}`, 0);
    if (!res.ok) throw new Error(res.error);
    room = res.room;
  }
  return room;
}

describe('registro de jogos', () => {
  it('conhece ITO, Dixit e Retratim', () => {
    expect(Object.keys(GAMES)).toEqual(['ito', 'dixit', 'pictures']);
    expect(GAMES.dixit.minPlayers).toBe(3);
    expect(GAMES.ito.liveCursors).toBe(true);
    expect(GAMES.dixit.liveCursors).toBe(false);
    expect(GAMES.pictures).toMatchObject({ minPlayers: 3, maxPlayers: 6, liveCursors: false, recordsHistory: false });
    expect(isGameId('dixit')).toBe(true);
    expect(isGameId('pictures')).toBe(true);
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
    const room = createRoom('ABCD', 0, 'dixit');
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
    const { gameId: _g, runStartedAt: _r, recordedRevealKey: _k, ...old } = createRoom('ABCD', 0);
    const room = restoreRoom(old);
    expect(room.gameId).toBe('ito');
    expect(room.runStartedAt).toBeNull();
    expect(room.recordedRevealKey).toBeNull();
  });

  it('sala gravada com grupo (formato antigo) volta sem o campo group', () => {
    const stored = { ...createRoom('ABCD', 0), group: { id: 'g', slug: 'abcdefghjk', name: 'X' } };
    const restored = restoreRoom(stored);
    expect('group' in restored).toBe(false);
    expect(restored.gameId).toBe('ito');
  });

  it('mantém o que já existe', () => {
    const room = createRoom('ABCD', 0, 'dixit');
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

function picturesRoom(n: number): Room {
  let room = createRoom('ABCD', 0, 'pictures');
  for (let i = 0; i < n; i++) {
    const res = joinRoom(room, { token: `t${i}`, name: `P${i}`, color: PLAYER_COLORS[i]! }, `p${i}`, 0);
    if (!res.ok) throw new Error(res.error);
    room = res.room;
  }
  return room;
}

function step(room: Room, playerId: string, action: unknown, now: number): Room {
  const res = roomAction(room, playerId, action, rng, now);
  if (!res.ok) throw new Error(res.error);
  return res.room;
}

describe('sala de Retratim', () => {
  it('é de Retratim, cabe 6 e recusa o 7º', () => {
    const room = picturesRoom(6);
    expect(isPicturesRoomView(roomView(room, null))).toBe(true);
    expect(roomSummary(room)).toMatchObject({ game: 'pictures', phase: 'lobby' });
    expect(joinRoom(room, { token: 't6', name: 'P6', color: PLAYER_COLORS[6]! }, 'p6', 0)).toEqual({ ok: false, error: 'room_full' });
  });

  it('o alarme acorda no fim da contagem e o tick fecha a montagem', () => {
    let room = picturesRoom(3);
    room = step(room, 'p0', { type: 'start' }, 10);
    const game = () => room.game as PicturesState;
    for (const p of ['p0', 'p1']) {
      room = step(room, p, { type: 'draft', work: sampleWork(game().kits[p]!) }, 10);
      room = step(room, p, { type: 'ready', on: true }, 10);
    }
    expect(game().countdownEndsAt).toBe(10 + PICTURES_COUNTDOWN_MS);
    expect(nextAlarmAt(room, 10)).toBe(10 + PICTURES_COUNTDOWN_MS);
    expect(tick(room, 10 + PICTURES_COUNTDOWN_MS - 1, rng).game.phase).toBe('building');
    room = tick(room, 10 + PICTURES_COUNTDOWN_MS, rng);
    expect(game().phase).toBe('guessing');
  });

  it('prazo vencido do jogo acorda a sala na hora', () => {
    let room = picturesRoom(3);
    room = step(room, 'p0', { type: 'start' }, 10);
    const game = () => room.game as PicturesState;
    for (const p of ['p0', 'p1']) {
      room = step(room, p, { type: 'draft', work: sampleWork(game().kits[p]!) }, 10);
      room = step(room, p, { type: 'ready', on: true }, 10);
    }
    const prazo = game().countdownEndsAt!;
    expect(nextAlarmAt(room, prazo + 1)).toBe(prazo + 1);
  });

  it('sala de ITO continua acordando só pela presença e expiração', () => {
    const room = createRoom('ABCD', 0);
    expect(nextAlarmAt(room, 0)).toBe(room.lastActivity + 6 * 60 * 60 * 1000);
  });

  it('erros do Retratim têm mensagem em português', () => {
    for (const code of ['wrong_kit', 'bad_work', 'empty_work', 'cubes_incomplete', 'icons_too_few', 'already_ready', 'own_work', 'no_work']) {
      expect(ERROR_CODES).toContain(code);
      expect(errorMessage(code)).not.toBe('Algo deu errado.');
    }
    expect(errorMessage('room_full')).toBe('A sala está cheia.');
  });
});
