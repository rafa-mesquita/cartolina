import { describe, expect, it } from 'vitest';
import { PLAYER_COLORS } from '../src/players';
import { mulberry32 } from '../src/rng';
import {
  DISCONNECT_GRACE_MS,
  ROOM_TTL_MS,
  activePlayers,
  createRoom,
  disconnect,
  isExpired,
  joinRoom,
  nextAlarmAt,
  roomAction,
  roomView,
  tick,
  type Room,
} from '../src/room';

const T0 = 1_000_000;
const rng = mulberry32(1);

function join(room: Room, token: string, name: string, colorIndex: number, now = T0) {
  const res = joinRoom(room, { token, name, color: PLAYER_COLORS[colorIndex]! }, `id-${token}`, now);
  if (!res.ok) throw new Error(res.error);
  return res;
}

function roomWith(n: number): Room {
  let room = createRoom('ABCD', T0);
  for (let i = 0; i < n; i++) room = join(room, `tok${i}`, `P${i}`, i).room;
  return room;
}

describe('joinRoom', () => {
  it('primeiro a entrar vira host', () => {
    const res = join(createRoom('ABCD', T0), 'tok0', 'Ana', 0);
    expect(res.playerId).toBe('id-tok0');
    expect(res.room.hostId).toBe('id-tok0');
    expect(res.room.seats).toHaveLength(1);
  });

  it('mesmo token reconecta no mesmo assento', () => {
    let room = roomWith(2);
    room = disconnect(room, 'id-tok0', T0 + 10);
    const res = join(room, 'tok0', 'Ana 2', 0, T0 + 20);
    expect(res.playerId).toBe('id-tok0');
    expect(res.room.seats).toHaveLength(2);
    expect(res.room.seats[0]).toMatchObject({ name: 'Ana 2', connected: true, disconnectedAt: null });
  });

  it('valida nome e cor', () => {
    const room = createRoom('ABCD', T0);
    expect(joinRoom(room, { token: 't', name: '  ', color: PLAYER_COLORS[0] }, 'x', T0)).toEqual({ ok: false, error: 'bad_name' });
    expect(joinRoom(room, { token: 't', name: 'A', color: '#000000' }, 'x', T0)).toEqual({ ok: false, error: 'bad_color' });
  });

  it('recusa cor já usada por outro jogador', () => {
    const room = roomWith(1);
    expect(joinRoom(room, { token: 'novo', name: 'B', color: PLAYER_COLORS[0] }, 'x', T0)).toEqual({ ok: false, error: 'color_taken' });
  });

  it('recusa o 11º jogador', () => {
    const room = roomWith(10);
    expect(joinRoom(room, { token: 'novo', name: 'X', color: PLAYER_COLORS[0] }, 'x', T0)).toEqual({ ok: false, error: 'room_full' });
  });

  it('com sala cheia, reaproveita assento de quem saiu há mais de 30 s e não está jogando', () => {
    let room = roomWith(10);
    room = disconnect(room, 'id-tok3', T0);
    const later = T0 + DISCONNECT_GRACE_MS + 1;
    const res = joinRoom(room, { token: 'novo', name: 'X', color: PLAYER_COLORS[3] }, 'id-novo', later);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.room.seats).toHaveLength(10);
      expect(res.room.seats.some((s) => s.id === 'id-tok3')).toBe(false);
    }
  });
});

describe('presença e host', () => {
  it('desconectado continua ativo durante a tolerância', () => {
    let room = roomWith(2);
    room = disconnect(room, 'id-tok1', T0);
    expect(activePlayers(room, T0 + DISCONNECT_GRACE_MS - 1)).toEqual(['id-tok0', 'id-tok1']);
    expect(activePlayers(room, T0 + DISCONNECT_GRACE_MS)).toEqual(['id-tok0']);
  });

  it('host passa para o próximo ativo depois da tolerância', () => {
    let room = roomWith(3);
    room = disconnect(room, 'id-tok0', T0);
    expect(tick(room, T0 + 1000, rng).hostId).toBe('id-tok0');
    expect(tick(room, T0 + DISCONNECT_GRACE_MS, rng).hostId).toBe('id-tok1');
  });

  it('host volta a existir quando alguém entra numa sala sem host ativo', () => {
    let room = roomWith(1);
    room = disconnect(room, 'id-tok0', T0);
    room = tick(room, T0 + DISCONNECT_GRACE_MS, rng);
    const res = join(room, 'tokX', 'X', 5, T0 + DISCONNECT_GRACE_MS + 1);
    expect(tick(res.room, T0 + DISCONNECT_GRACE_MS + 1, rng).hostId).toBe('id-tokX');
  });
});

describe('roomAction e roomView', () => {
  it('aplica ação do jogo com os ativos', () => {
    const room = roomWith(2);
    const res = roomAction(room, 'id-tok0', { type: 'start' }, rng, T0 + 5);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.room.game.phase).toBe('theme');
      expect(res.room.game.players).toEqual(['id-tok0', 'id-tok1']);
      expect(res.room.lastActivity).toBe(T0 + 5);
    }
  });

  it('recusa quem não está na sala e repassa erro do jogo', () => {
    const room = roomWith(2);
    expect(roomAction(room, 'intruso', { type: 'start' }, rng, T0)).toEqual({ ok: false, error: 'not_member' });
    expect(roomAction(room, 'id-tok1', { type: 'start' }, rng, T0)).toEqual({ ok: false, error: 'not_host' });
  });

  it('visão não vaza tokens e marca quem está vendo', () => {
    const room = roomWith(2);
    const view = roomView(room, 'id-tok1');
    expect(view.you).toBe('id-tok1');
    expect(view).not.toHaveProperty('tokens');
    expect(JSON.stringify(view)).not.toContain('"tok0"');
    expect(view.seats[0]).toEqual({ id: 'id-tok0', name: 'P0', color: PLAYER_COLORS[0], connected: true });
  });
});

describe('alarmes', () => {
  it('sem desconexões, o alarme é a expiração', () => {
    const room = roomWith(2);
    expect(nextAlarmAt(room, T0)).toBe(T0 + ROOM_TTL_MS);
  });

  it('com desconexão recente, o alarme é logo após a tolerância', () => {
    const room = disconnect(roomWith(2), 'id-tok1', T0 + 100);
    expect(nextAlarmAt(room, T0 + 200)).toBe(T0 + 100 + DISCONNECT_GRACE_MS + 1000);
  });

  it('expira após 6 h sem atividade', () => {
    const room = roomWith(1);
    expect(isExpired(room, T0 + ROOM_TTL_MS - 1)).toBe(false);
    expect(isExpired(room, T0 + ROOM_TTL_MS)).toBe(true);
  });
});
