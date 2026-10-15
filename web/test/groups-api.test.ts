import { describe, expect, it, vi } from 'vitest';
import { parseHash } from '../src/lib/router';
import { createGroup, createGroupRoom, getGroup } from '../src/net/api';
import { loadGroups, rememberGroup } from '../src/net/identity';

const fakeFetch = (status: number, body: unknown) =>
  vi.fn(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

describe('rota do grupo', () => {
  it('reconhece #/g/<slug>', () => {
    expect(parseHash('#/g/abcdefghjk')).toEqual({ name: 'group', slug: 'abcdefghjk' });
    expect(parseHash('#/g/ABC')).toEqual({ name: 'home' });
  });
});

describe('api de grupos', () => {
  it('createGroup manda o nome e devolve slug', async () => {
    const f = fakeFetch(201, { slug: 'abcdefghjk', name: 'Galera' });
    await expect(createGroup('Galera', f, 'http://s')).resolves.toEqual({ slug: 'abcdefghjk', name: 'Galera' });
    expect(f).toHaveBeenCalledWith('http://s/groups', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Galera' }),
    });
  });

  it('getGroup pagina com before e devolve null quando não existe', async () => {
    const f = fakeFetch(200, { group: {}, rounds: [], stats: {}, nextBefore: null });
    await getGroup('abcdefghjk', 123, f, 'http://s');
    expect(f).toHaveBeenCalledWith('http://s/groups/abcdefghjk?before=123');
    await expect(getGroup('abcdefghjk', null, fakeFetch(404, {}), 'http://s')).resolves.toBeNull();
  });

  it('createGroupRoom devolve o código', async () => {
    await expect(createGroupRoom('abcdefghjk', fakeFetch(201, { code: 'KXQ7' }), 'http://s')).resolves.toBe('KXQ7');
  });
});

describe('grupos lembrados', () => {
  it('guarda os mais recentes primeiro, sem repetir, no máximo 8', () => {
    for (let i = 0; i < 10; i++) rememberGroup({ slug: `abcdefgh${String.fromCharCode(97 + i)}${i % 2 ? 'k' : 'm'}`, name: `G${i}` });
    rememberGroup({ slug: 'abcdefghak', name: 'G0 de novo' });
    const groups = loadGroups();
    expect(groups).toHaveLength(8);
    expect(groups[0]).toEqual({ slug: 'abcdefghak', name: 'G0 de novo' });
    expect(new Set(groups.map((g) => g.slug)).size).toBe(8);
  });

  it('ignora lixo no storage', () => {
    localStorage.setItem('cartolina.groups', '{"x":1}');
    expect(loadGroups()).toEqual([]);
  });
});
