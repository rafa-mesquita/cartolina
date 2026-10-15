import { SELF } from 'cloudflare:test';
import type { GroupResponse, RoomView } from '@cartolina/shared';
import { describe, expect, it } from 'vitest';
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
    expect(body.stats.rounds).toBe(0);
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
    expect(first.stats.rounds).toBe(1);

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
