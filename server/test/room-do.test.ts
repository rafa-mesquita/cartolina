import { SELF, env, runDurableObjectAlarm, runInDurableObject } from 'cloudflare:test';
import type { Room } from '@cartolina/shared';
import { describe, expect, it } from 'vitest';
import { COLORS, barrier, connect, joined, newRoomCode } from './helpers';

describe('RoomDO: entrada', () => {
  it('GET /rooms/:code lista quem já está na sala', async () => {
    const code = await newRoomCode();
    await joined(code, 2);
    const res = await SELF.fetch(`https://x/rooms/${code}`);
    const body = (await res.json()) as { exists: boolean; phase: string; seats: { name: string; color: string }[] };
    expect(body.exists).toBe(true);
    expect(body.phase).toBe('lobby');
    expect(body.seats.map((s) => s.name)).toEqual(['P0', 'P1']);
    expect(body.seats.map((s) => s.color)).toEqual([COLORS[0], COLORS[1]]);
  });

  it('join devolve welcome e estado com o assento', async () => {
    const code = await newRoomCode();
    const a = await connect(code);
    a.send({ t: 'join', token: crypto.randomUUID(), name: 'Ana', color: COLORS[0] });
    const welcome = await a.next('welcome');
    expect(welcome.code).toBe(code);
    const room = await a.state((r) => r.seats.length === 1);
    expect(room.you).toBe(welcome.playerId);
    expect(room.hostId).toBe(welcome.playerId);
    expect(room.game.phase).toBe('lobby');
  });

  it('outros jogadores recebem o novo estado', async () => {
    const code = await newRoomCode();
    const [a] = await joined(code, 1);
    const b = await connect(code);
    b.send({ t: 'join', token: crypto.randomUUID(), name: 'Bia', color: COLORS[1] });
    await b.next('welcome');
    const room = await a!.client.state((r) => r.seats.length === 2);
    expect(room.seats.map((s) => s.name)).toEqual(['P0', 'Bia']);
  });

  it('reconectar com o mesmo token mantém o playerId', async () => {
    const code = await newRoomCode();
    const token = crypto.randomUUID();
    const first = await connect(code);
    first.send({ t: 'join', token, name: 'Ana', color: COLORS[0] });
    const w1 = await first.next('welcome');
    const second = await connect(code);
    second.send({ t: 'join', token, name: 'Ana', color: COLORS[0] });
    const w2 = await second.next('welcome');
    expect(w2.playerId).toBe(w1.playerId);
    const room = await second.state((r) => r.seats.length === 1);
    expect(room.seats[0]?.connected).toBe(true);
  });

  it('segundo join no mesmo socket dá already_joined', async () => {
    const code = await newRoomCode();
    const [a] = await joined(code, 1);
    await barrier(a!.client); // drena states do join antes de limpar
    a!.client.inbox.length = 0;
    a!.client.send({ t: 'join', token: crypto.randomUUID(), name: 'Outro', color: COLORS[1] });
    const err = await a!.client.next('error');
    expect(err.code).toBe('already_joined');
    expect(err.message).toBe('Você já entrou nesta sala.');
    await barrier(a!.client);
    // a sala não mudou: nenhum state foi transmitido depois do segundo join
    expect(a!.client.inbox.some((m) => m.t === 'state')).toBe(false);
  });

  it('mensagem inválida ou ação antes do join dá erro', async () => {
    const code = await newRoomCode();
    const a = await connect(code);
    a.ws.send('lixo');
    expect((await a.next('error')).code).toBe('bad_message');
    a.send({ t: 'action', action: { type: 'start' } });
    expect((await a.next('error')).code).toBe('not_joined');
  });

  it('erro de entrada é reportado (cor repetida)', async () => {
    const code = await newRoomCode();
    await joined(code, 1);
    const b = await connect(code);
    b.send({ t: 'join', token: crypto.randomUUID(), name: 'B', color: COLORS[0] });
    const err = await b.next('error');
    expect(err.code).toBe('color_taken');
    expect(err.message).toBe('Essa cor já foi escolhida.');
  });

  it('persiste a sala no storage', async () => {
    const code = await newRoomCode();
    await joined(code, 2);
    const stub = env.ROOMS.get(env.ROOMS.idFromName(code));
    await runInDurableObject(stub, async (_instance, state) => {
      const room = await state.storage.get<Room>('room');
      expect(room?.seats).toHaveLength(2);
      expect(Object.keys(room?.tokens ?? {})).toHaveLength(2);
    });
  });
});

describe('RoomDO: jogo', () => {
  it('joga uma rodada livre completa', async () => {
    const code = await newRoomCode();
    const [a, b] = await joined(code, 2);
    a!.client.send({ t: 'action', action: { type: 'start' } });
    await a!.client.state((r) => r.game.phase === 'theme');
    a!.client.send({ t: 'action', action: { type: 'beginRound' } });
    const roomA = await a!.client.state((r) => r.game.phase === 'sorting');
    const roomB = await b!.client.state((r) => r.game.phase === 'sorting');

    const cardA = Object.values(roomA.game.cards).find((c) => c.owner === a!.id)!;
    const cardB = Object.values(roomB.game.cards).find((c) => c.owner === b!.id)!;
    expect(cardA.value).not.toBeNull();
    expect(roomA.game.cards[cardB.id]?.value).toBeNull();

    a!.client.send({ t: 'action', action: { type: 'clue', cardId: cardA.id, text: 'Paris' } });
    a!.client.send({ t: 'action', action: { type: 'place', cardId: cardA.id, index: 0 } });
    await b!.client.state((r) => r.game.row.length === 1 && r.game.cards[cardA.id]?.clue === 'Paris');
    b!.client.send({ t: 'action', action: { type: 'place', cardId: cardB.id, index: 1 } });
    a!.client.send({ t: 'action', action: { type: 'ready', ready: true } });
    b!.client.send({ t: 'action', action: { type: 'ready', ready: true } });

    const done = await a!.client.state((r) => r.game.phase === 'reveal');
    const values = done.game.reveal!.map((e) => e.value);
    expect(values).toHaveLength(2);
    expect(done.game.outcome).toBe(values[0]! < values[1]! ? 'round_won' : 'round_lost');
    expect(done.game.cards[cardB.id]?.value).toBe(values[1]);
  });

  it('erros de regra voltam só para quem errou', async () => {
    const code = await newRoomCode();
    const [, b] = await joined(code, 2);
    b!.client.send({ t: 'action', action: { type: 'start' } });
    expect((await b!.client.next('error')).code).toBe('not_host');
  });
});

describe('RoomDO: fx', () => {
  it('cursor vai para os outros e não volta para quem enviou', async () => {
    const code = await newRoomCode();
    const [a, b] = await joined(code, 2);
    a!.client.send({ t: 'fx.cursor', zone: 'table', x: 0.25, y: 0.5, drag: { cardId: 'x:0', index: 1 } });
    const got = await b!.client.next('fx.cursor');
    expect(got).toEqual({ t: 'fx.cursor', from: a!.id, zone: 'table', x: 0.25, y: 0.5, drag: { cardId: 'x:0', index: 1 } });
    await barrier(a!.client);
    expect(a!.client.inbox.some((m) => m.t === 'fx.cursor')).toBe(false);
  });

  it('ping vai para todos, inclusive quem enviou', async () => {
    const code = await newRoomCode();
    const [a, b] = await joined(code, 2);
    a!.client.send({ t: 'fx.ping', x: 0.5, y: 0.5 });
    expect((await a!.client.next('fx.ping')).from).toBe(a!.id);
    expect((await b!.client.next('fx.ping')).from).toBe(a!.id);
  });

  it('atividade é repassada', async () => {
    const code = await newRoomCode();
    const [a, b] = await joined(code, 2);
    a!.client.send({ t: 'fx.activity', activity: 'writing' });
    expect(await b!.client.next('fx.activity')).toEqual({ t: 'fx.activity', from: a!.id, activity: 'writing' });
  });
});

describe('RoomDO: desconexão', () => {
  it('fechar o socket marca o jogador como desconectado para os outros', async () => {
    const code = await newRoomCode();
    const [a, b] = await joined(code, 2);
    b!.client.ws.close(1000, 'tchau');
    const room = await a!.client.state((r) => r.seats.find((s) => s.id === b!.id)?.connected === false);
    expect(room.seats).toHaveLength(2);
  });

  it('socket substituído por reconexão não derruba o jogador', async () => {
    const code = await newRoomCode();
    const [a, b] = await joined(code, 2);
    await barrier(a!.client); // drena states do join antes de limpar
    a!.client.inbox.length = 0;
    const again = await connect(code);
    again.send({ t: 'join', token: b!.token, name: 'P1', color: COLORS[1] });
    await again.next('welcome');
    expect((await b!.client.closed).code).toBe(4000);
    await barrier(a!.client);
    const states = a!.client.inbox.flatMap((m) => (m.t === 'state' ? [m.room] : []));
    expect(states.length).toBeGreaterThan(0);
    for (const room of states) expect(room.seats.every((s) => s.connected)).toBe(true);
  });
});

describe('RoomDO: expiração', () => {
  it('o alarme apaga a sala inativa, fecha os sockets e limpa o storage', async () => {
    const code = await newRoomCode();
    const [a] = await joined(code, 1);
    const stub = env.ROOMS.get(env.ROOMS.idFromName(code));
    await runInDurableObject(stub, async (instance, state) => {
      const self = instance as unknown as { room: Room };
      self.room = { ...self.room, lastActivity: 0 };
      await state.storage.put('room', self.room);
    });
    expect(await runDurableObjectAlarm(stub)).toBe(true);
    expect((await a!.client.closed).code).toBe(4004);
    await runInDurableObject(stub, async (_instance, state) => {
      expect(await state.storage.get('room')).toBeUndefined();
      expect(await state.storage.getAlarm()).toBeNull();
    });
    expect((await SELF.fetch(`https://x/rooms/${code}`)).status).toBe(404);
  });
});
