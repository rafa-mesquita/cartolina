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

  it('createGroup lança erro com o status quando o servidor recusa', async () => {
    await expect(createGroup('', fakeFetch(400, { error: 'bad_name' }), 'http://s')).rejects.toThrow('group_create_failed_400');
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
  const slugOf = (i: number) => `abcdefgh${String.fromCharCode(97 + i)}${i % 2 ? 'k' : 'm'}`;

  it('guarda os mais recentes primeiro, sem repetir, no máximo 8', () => {
    for (let i = 0; i < 10; i++) rememberGroup({ slug: slugOf(i), name: `G${i}` });
    // o G0 já tinha saído da lista (só cabem 8): volta pro topo com o nome novo
    rememberGroup({ slug: slugOf(0), name: 'G0 de novo' });
    let groups = loadGroups();
    expect(groups).toHaveLength(8);
    expect(groups[0]).toEqual({ slug: 'abcdefgham', name: 'G0 de novo' });
    expect(new Set(groups.map((g) => g.slug)).size).toBe(8);
    // um que ainda está na lista sobe pro topo, com o nome atualizado, sem duplicar
    rememberGroup({ slug: slugOf(5), name: 'G5 renomeado' });
    groups = loadGroups();
    expect(groups).toHaveLength(8);
    expect(groups[0]).toEqual({ slug: slugOf(5), name: 'G5 renomeado' });
    expect(groups.filter((g) => g.slug === slugOf(5))).toHaveLength(1);
    expect(new Set(groups.map((g) => g.slug)).size).toBe(8);
  });

  it('ignora lixo no storage', () => {
    localStorage.setItem('cartolina.groups', '{"x":1}');
    expect(loadGroups()).toEqual([]);
  });

  it('descarta grupos com slug inválido', () => {
    localStorage.setItem(
      'cartolina.groups',
      JSON.stringify([{ slug: 'javascript:x', name: 'mal' }, { slug: 'abcdefghjk', name: 'Galera' }, null, { slug: 'abcdefghjm' }]),
    );
    expect(loadGroups()).toEqual([{ slug: 'abcdefghjk', name: 'Galera' }]);
  });
});
