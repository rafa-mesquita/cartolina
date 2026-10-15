import { describe, expect, it, vi } from 'vitest';
import { createRoom, getRoomInfo } from '../src/net/api';
import { wsUrl } from '../src/net/config';
import { getToken, loadProfile, loadTiltPref, markJoined, saveProfile, saveTiltPref, wasJoined } from '../src/net/identity';

function fakeFetch(status: number, body: unknown) {
  return vi.fn(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;
}

describe('config', () => {
  it('troca http por ws e https por wss', () => {
    expect(wsUrl('ABCD', 'http://127.0.0.1:8787')).toBe('ws://127.0.0.1:8787/rooms/ABCD/ws');
    expect(wsUrl('ABCD', 'https://x.workers.dev')).toBe('wss://x.workers.dev/rooms/ABCD/ws');
  });
});

describe('api', () => {
  it('createRoom devolve o código', async () => {
    const f = fakeFetch(201, { code: 'KXQ7' });
    await expect(createRoom(f, 'http://s')).resolves.toBe('KXQ7');
    expect(f).toHaveBeenCalledWith('http://s/rooms', { method: 'POST' });
  });

  it('createRoom falha com erro claro', async () => {
    await expect(createRoom(fakeFetch(503, { error: 'no_code' }), 'http://s')).rejects.toThrow('create_failed_503');
  });

  it('getRoomInfo devolve resumo ou null quando não existe', async () => {
    const info = { exists: true, phase: 'lobby', seats: [] };
    await expect(getRoomInfo('KXQ7', fakeFetch(200, info), 'http://s')).resolves.toEqual(info);
    await expect(getRoomInfo('ZZZZ', fakeFetch(404, { exists: false }), 'http://s')).resolves.toBeNull();
  });
});

describe('identity', () => {
  it('token é estável na aba', () => {
    const t = getToken();
    expect(t).toMatch(/^[0-9a-f-]{36}$/);
    expect(getToken()).toBe(t);
  });

  it('perfil válido é salvo e lido; inválido vira null', () => {
    expect(loadProfile()).toBeNull();
    saveProfile({ name: 'Ana', color: '#8EC5FF' });
    expect(loadProfile()).toEqual({ name: 'Ana', color: '#8EC5FF' });
    localStorage.setItem('cartolina.profile', JSON.stringify({ name: 'X', color: '#000000' }));
    expect(loadProfile()).toBeNull();
  });

  it('lembra em quais salas a aba já entrou', () => {
    expect(wasJoined('ABCD')).toBe(false);
    markJoined('ABCD');
    expect(wasJoined('ABCD')).toBe(true);
  });

  it('preferência de mesa 3D começa ligada', () => {
    expect(loadTiltPref()).toBe(true);
    saveTiltPref(false);
    expect(loadTiltPref()).toBe(false);
  });
});
