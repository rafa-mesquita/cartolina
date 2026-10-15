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
  reconcilePresence,
  roomAction,
  roomSummary,
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

describe('joinRoom (segurança e limites)', () => {
  it('tokens com nome de protótipo criam assento normal', () => {
    for (const token of ['__proto__', 'toString', 'constructor', 'hasOwnProperty']) {
      const res = join(createRoom('ABCD', T0), token, 'Ana', 0);
      expect(res.playerId).toBe(`id-${token}`);
      expect(res.room.seats).toHaveLength(1);
      expect(res.room.seats[0]!.id).toBe(`id-${token}`);
    }
  });

  it('reconexão com token existente funciona em sala cheia', () => {
    let room = roomWith(10);
    room = disconnect(room, 'id-tok4', T0);
    const res = join(room, 'tok4', 'Volta', 4, T0 + DISCONNECT_GRACE_MS + 5);
    expect(res.playerId).toBe('id-tok4');
    expect(res.room.seats).toHaveLength(10);
    expect(res.room.seats.find((s) => s.id === 'id-tok4')).toMatchObject({ name: 'Volta', connected: true });
  });

  it('sala cheia cujo único assento inativo está no jogo continua cheia', () => {
    let room = roomWith(10);
    room = { ...room, game: { ...room.game, players: ['id-tok3'] } };
    room = disconnect(room, 'id-tok3', T0);
    const later = T0 + DISCONNECT_GRACE_MS + 1;
    expect(joinRoom(room, { token: 'novo', name: 'X', color: PLAYER_COLORS[3] }, 'id-novo', later)).toEqual({
      ok: false,
      error: 'room_full',
    });
  });

  it('ao reaproveitar assento, remove os tokens do jogador removido', () => {
    let room = roomWith(10);
    room = disconnect(room, 'id-tok3', T0);
    const res = joinRoom(room, { token: 'novo', name: 'X', color: PLAYER_COLORS[3] }, 'id-novo', T0 + DISCONNECT_GRACE_MS + 1);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(Object.values(res.room.tokens)).not.toContain('id-tok3');
      expect(Object.hasOwn(res.room.tokens, 'tok3')).toBe(false);
      expect(res.room.tokens['novo']).toBe('id-novo');
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

  it('host passa para o próximo conectado, pulando quem só está em tolerância', () => {
    let room = roomWith(3);
    room = disconnect(room, 'id-tok0', T0);
    room = disconnect(room, 'id-tok1', T0 + DISCONNECT_GRACE_MS - 10);
    const next = tick(room, T0 + DISCONNECT_GRACE_MS, rng);
    expect(next.hostId).toBe('id-tok2');
  });

  it('host passa adiante com volta ao início quando o host é o último assento', () => {
    let room = roomWith(3);
    room = { ...room, hostId: 'id-tok2' };
    room = disconnect(room, 'id-tok2', T0);
    expect(tick(room, T0 + DISCONNECT_GRACE_MS, rng).hostId).toBe('id-tok0');
  });

  it('sem ninguém conectado, cai para um assento ativo em tolerância', () => {
    let room = roomWith(2);
    room = disconnect(room, 'id-tok0', T0);
    room = disconnect(room, 'id-tok1', T0 + DISCONNECT_GRACE_MS - 10);
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

  it('o alarme ainda inclui a desconexão enquanto a janela de +1 s não passou', () => {
    const room = disconnect(roomWith(2), 'id-tok1', T0);
    expect(nextAlarmAt(room, T0 + DISCONNECT_GRACE_MS + 500)).toBe(T0 + DISCONNECT_GRACE_MS + 1000);
  });

  it('com duas desconexões pendentes, usa a mais próxima', () => {
    let room = disconnect(roomWith(3), 'id-tok1', T0 + 500);
    room = disconnect(room, 'id-tok2', T0 + 100);
    expect(nextAlarmAt(room, T0 + 600)).toBe(T0 + 100 + DISCONNECT_GRACE_MS + 1000);
  });

  it('desconexão cuja janela já passou volta ao TTL', () => {
    const room = disconnect(roomWith(2), 'id-tok1', T0);
    expect(nextAlarmAt(room, T0 + DISCONNECT_GRACE_MS + 1000)).toBe(T0 + ROOM_TTL_MS);
  });

  it('expira após 6 h sem atividade', () => {
    const room = roomWith(1);
    expect(isExpired(room, T0 + ROOM_TTL_MS - 1)).toBe(false);
    expect(isExpired(room, T0 + ROOM_TTL_MS)).toBe(true);
  });
});

describe('roomSummary', () => {
  it('expõe fase e assentos públicos, sem tokens', () => {
    const summary = roomSummary(roomWith(2));
    expect(summary).toEqual({
      phase: 'lobby',
      seats: [
        { id: 'id-tok0', name: 'P0', color: PLAYER_COLORS[0], connected: true },
        { id: 'id-tok1', name: 'P1', color: PLAYER_COLORS[1], connected: true },
      ],
    });
    expect(JSON.stringify(summary)).not.toContain('"tok0"');
  });
});

describe('reconcilePresence', () => {
  it('não muda nada quando todos os conectados têm socket', () => {
    const room = roomWith(2);
    expect(reconcilePresence(room, new Set(['id-tok0', 'id-tok1']), T0 + 5)).toBe(room);
  });

  it('marca como desconectado quem não tem socket vivo, sem contar como atividade', () => {
    const room = roomWith(2);
    const next = reconcilePresence(room, new Set(['id-tok0']), T0 + 5);
    expect(next.seats[1]).toMatchObject({ id: 'id-tok1', connected: false, disconnectedAt: T0 + 5 });
    expect(next.seats[0]?.connected).toBe(true);
    expect(next.lastActivity).toBe(room.lastActivity);
  });
});

describe('grupo e início da partida', () => {
  const group = { id: 'g-1', slug: 'abcdefghjk', name: 'Galera' };

  it('sala avulsa não tem grupo; sala de grupo expõe só slug e nome na visão', () => {
    expect(createRoom('ABCD', T0).group).toBeNull();
    const joined = joinRoom(createRoom('ABCD', T0, group), { token: 't0', name: 'Ana', color: PLAYER_COLORS[0] }, 'p0', T0);
    if (!joined.ok) throw new Error(joined.error);
    const room = joined.room;
    expect(roomView(room, 'p0').group).toEqual({ slug: 'abcdefghjk', name: 'Galera' });
    expect(JSON.stringify(roomView(room, 'p0'))).not.toContain('g-1');
  });

  it('marca runStartedAt quando o host começa (lobby → tema) e mantém nas rodadas seguintes', () => {
    let room = roomWith(2);
    expect(room.runStartedAt).toBeNull();
    const started = roomAction(room, 'id-tok0', { type: 'start' }, rng, T0 + 50);
    if (!started.ok) throw new Error(started.error);
    room = started.room;
    expect(room.runStartedAt).toBe(T0 + 50);
    const dealt = roomAction(room, 'id-tok0', { type: 'beginRound' }, rng, T0 + 90);
    if (!dealt.ok) throw new Error(dealt.error);
    expect(dealt.room.runStartedAt).toBe(T0 + 50);
  });
});
