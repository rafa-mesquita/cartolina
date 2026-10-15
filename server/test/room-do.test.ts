import { env, runInDurableObject } from 'cloudflare:test';
import type { Room } from '@cartolina/shared';
import { describe, expect, it } from 'vitest';
import { COLORS, connect, joined, newRoomCode } from './helpers';

describe('RoomDO: entrada', () => {
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
    a!.client.send({ t: 'join', token: crypto.randomUUID(), name: 'Outro', color: COLORS[1] });
    const err = await a!.client.next('error');
    expect(err.code).toBe('already_joined');
    expect(err.message).toBe('Você já entrou nesta sala.');
    const room = await a!.client.state((r) => r.seats.length === 1);
    expect(room.seats[0]?.name).toBe('P0');
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
