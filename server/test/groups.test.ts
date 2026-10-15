import { SELF, env, runDurableObjectAlarm, runInDurableObject } from 'cloudflare:test';
import type { GroupResponse, RoomView, RoundRecord } from '@cartolina/shared';
import { describe, expect, it } from 'vitest';
import { randomCode, randomSlug } from '../src/codes';
import { findGroup, insertRound } from '../src/history-db';
import { connect, newGroup, newGroupRoom, playRound } from './helpers';

const getGroup = async (slug: string, qs = '') => SELF.fetch(`https://x/groups/${slug}${qs}`);

describe('grupos: HTTP', () => {
  it('cria grupo com nome limpo e devolve o slug', async () => {
    const res = await SELF.fetch('https://x/groups', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: '  Galera   da call ' }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { slug: string; name: string };
    expect(body.name).toBe('Galera da call');
    expect(body.slug).toMatch(/^[a-z0-9]{10}$/);
  });

  it('recusa nome inválido', async () => {
    const res = await SELF.fetch('https://x/groups', { method: 'POST', body: JSON.stringify({ name: '   ' }) });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'bad_group_name' });
  });

  it('grupo novo vem vazio; slug desconhecido dá 404', async () => {
    const slug = await newGroup('Vazio');
    const res = await getGroup(slug);
    expect(res.status).toBe(200);
    const body = (await res.json()) as GroupResponse;
    expect(body.group).toMatchObject({ slug, name: 'Vazio' });
    expect(body.rounds).toEqual([]);
    expect(body.stats!.rounds).toBe(0);
    expect(body.nextBefore).toBeNull();
    expect((await getGroup('zzzzzzzzzz')).status).toBe(404);
  });

  it('cria sala do grupo, e a sala sabe do grupo', async () => {
    const { slug, code } = await newGroupRoom('Galera');
    const c = await connect(code);
    c.send({ t: 'join', token: crypto.randomUUID(), name: 'Ana', color: '#8EC5FF' });
    await c.next('welcome');
    const room: RoomView = await c.state(() => true);
    expect(room.group).toEqual({ slug, name: 'Galera' });
    expect((await SELF.fetch(`https://x/groups/zzzzzzzzzz/rooms`, { method: 'POST' })).status).toBe(404);
  });
});

describe('grupos: gravação na revelação', () => {
  it('grava a rodada revelada uma vez só', async () => {
    const { slug, code } = await newGroupRoom('Galera');
    const [a, b] = await playRound(code);
    const first = (await (await getGroup(slug)).json()) as GroupResponse;
    expect(first.rounds).toHaveLength(1);
    const r = first.rounds[0]!;
    expect(r.roomCode).toBe(code);
    expect(r.mode).toBe('livre');
    expect(r.players.map((p) => p.name)).toEqual(['P0', 'P1']);
    expect(r.cards).toHaveLength(2);
    expect(r.cards.find((c) => c.name === 'P0')!.clue).toBe('Paris');
    expect(first.stats!.rounds).toBe(1);

    // um novo commit (alguém sai da sala) não duplica a rodada
    b!.client.ws.close(1000, 'tchau');
    await a!.client.state((v) => v.seats.some((s) => !s.connected));
    const again = (await (await getGroup(slug)).json()) as GroupResponse;
    expect(again.rounds).toHaveLength(1);
  });

  it('sala avulsa não aparece em grupo nenhum', async () => {
    const slug = await newGroup('Outro');
    const res = await SELF.fetch('https://x/rooms', { method: 'POST' });
    const { code } = (await res.json()) as { code: string };
    await playRound(code);
    const body = (await (await getGroup(slug)).json()) as GroupResponse;
    expect(body.rounds).toEqual([]);
  });
});

function rec(playedAt: number): RoundRecord {
  return {
    id: crypto.randomUUID(),
    roomCode: 'ABCD',
    playedAt,
    mode: 'livre',
    level: 1,
    outcome: 'round_won',
    errors: 0,
    campaignId: null,
    theme: { titulo: 'Comidas', min: 'odeio', max: 'amo' },
    players: [{ name: 'Ana', color: '#8EC5FF' }],
    cards: [{ name: 'Ana', color: '#8EC5FF', value: 42, clue: 'pizza', error: false }],
  };
}

async function groupWithRounds(n: number): Promise<string> {
  const slug = await newGroup('Muitas');
  const g = (await findGroup(env.DB, slug))!;
  for (let t = 1; t <= n; t++) await insertRound(env.DB, g.id, rec(t), `k${t}`);
  return slug;
}

const range = (from: number, to: number) => Array.from({ length: from - to + 1 }, (_, i) => from - i);

describe('grupos: paginação e validação', () => {
  it('pagina de 20 em 20; estatísticas só na primeira página', async () => {
    const slug = await groupWithRounds(25);
    const p1 = (await (await getGroup(slug)).json()) as GroupResponse;
    expect(p1.rounds.map((r) => r.playedAt)).toEqual(range(25, 6));
    expect(p1.nextBefore).toBe(6);
    expect(p1.stats!.rounds).toBe(25);
    const p2 = (await (await getGroup(slug, '?before=6')).json()) as GroupResponse;
    expect(p2.rounds.map((r) => r.playedAt)).toEqual(range(5, 1));
    expect(p2.nextBefore).toBeNull();
    expect(p2.stats).toBeNull();
  });

  it('exatamente 20 rodadas: não há próxima página', async () => {
    const slug = await groupWithRounds(20);
    const p1 = (await (await getGroup(slug)).json()) as GroupResponse;
    expect(p1.rounds).toHaveLength(20);
    expect(p1.nextBefore).toBeNull();
  });

  it('recusa before que não é inteiro seguro', async () => {
    const slug = await newGroup('Cursor');
    for (const qs of ['?before=abc', '?before=-1', '?before=1.5', '?before=', '?before=99999999999999999999']) {
      const res = await getGroup(slug, qs);
      expect(res.status, qs).toBe(400);
      expect(await res.json()).toEqual({ error: 'bad_before' });
    }
    expect((await getGroup(slug, '?before=0')).status).toBe(200);
  });

  it('só GET lê o grupo e só POST cria sala', async () => {
    const slug = await newGroup('Métodos');
    for (const method of ['PUT', 'DELETE', 'POST']) {
      expect((await SELF.fetch(`https://x/groups/${slug}`, { method })).status, method).toBe(404);
    }
    expect((await SELF.fetch(`https://x/groups/${slug}/rooms`)).status).toBe(404);
  });
});

describe('grupos: falha no D1', () => {
  it('não perde a rodada: guarda no DO e o alarme grava de novo', async () => {
    // Sala de um grupo que ainda não existe no D1: o INSERT falha (chave estrangeira) até o grupo aparecer.
    const code = randomCode();
    const group = { id: crypto.randomUUID(), slug: randomSlug(), name: 'Pendente' };
    const stub = env.ROOMS.get(env.ROOMS.idFromName(code));
    const init = await stub.fetch(`https://room/init?code=${code}`, { method: 'POST', body: JSON.stringify({ group }) });
    expect(init.status).toBe(201);
    await playRound(code);

    await runInDurableObject(stub, async (instance, state) => {
      const pending = await state.storage.list({ prefix: 'pendingRound:' });
      expect(pending.size).toBe(1);
      // Mesmo sem ninguém na sala (sem a varredura de 20 s dos sockets), o DO acorda em até 30 s para tentar de novo.
      const self = instance as unknown as { liveSocketCount(): number; scheduleAlarm(): Promise<void> };
      self.liveSocketCount = () => 0;
      await self.scheduleAlarm();
      const alarm = await state.storage.getAlarm();
      expect(alarm).not.toBeNull();
      expect(alarm! - Date.now()).toBeLessThanOrEqual(30_000);
    });

    await env.DB.prepare('INSERT INTO groups (id, slug, name, created_at) VALUES (?, ?, ?, ?)')
      .bind(group.id, group.slug, group.name, 1)
      .run();
    expect(await runDurableObjectAlarm(stub)).toBe(true);

    const body = (await (await getGroup(group.slug)).json()) as GroupResponse;
    expect(body.rounds).toHaveLength(1);
    expect(body.rounds[0]!.roomCode).toBe(code);
    await runInDurableObject(stub, async (_instance, state) => {
      expect((await state.storage.list({ prefix: 'pendingRound:' })).size).toBe(0);
    });
  });
});
