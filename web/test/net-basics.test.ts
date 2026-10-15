import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRoom, getRoomInfo } from '../src/net/api';
import { wsUrl } from '../src/net/config';
import {
  getToken,
  joinedProfile,
  loadProfile,
  loadSoundPref,
  loadTiltPref,
  markJoined,
  saveProfile,
  saveSoundPref,
  saveTiltPref,
  wasJoined,
} from '../src/net/identity';

function fakeFetch(status: number, body: unknown) {
  return vi.fn(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;
}

describe('config', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('SERVER_URL ignora barras finais e usa o padrão quando a variável é vazia', async () => {
    vi.stubEnv('VITE_SERVER_URL', 'https://x.workers.dev//');
    vi.resetModules();
    expect((await import('../src/net/config')).SERVER_URL).toBe('https://x.workers.dev');
    vi.stubEnv('VITE_SERVER_URL', '');
    vi.resetModules();
    expect((await import('../src/net/config')).SERVER_URL).toBe('http://127.0.0.1:8787');
  });

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

  it('token é gerado mesmo sem crypto.randomUUID (contexto não seguro)', () => {
    const original = crypto.randomUUID;
    Object.defineProperty(crypto, 'randomUUID', { value: undefined, configurable: true });
    try {
      const t = getToken();
      expect(t).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
      expect(getToken()).toBe(t);
    } finally {
      Object.defineProperty(crypto, 'randomUUID', { value: original, configurable: true, writable: true });
    }
  });

  it('não quebra quando o armazenamento recusa gravação', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    try {
      expect(() => saveProfile({ name: 'Ana', color: '#8EC5FF' })).not.toThrow();
      expect(() => markJoined('ABCD', { name: 'Ana', color: '#8EC5FF' })).not.toThrow();
      expect(() => saveTiltPref(false)).not.toThrow();
      expect(getToken()).toMatch(/^[0-9a-f-]{36}$/);
    } finally {
      spy.mockRestore();
    }
  });

  it('perfil válido é salvo e lido; inválido vira null', () => {
    expect(loadProfile()).toBeNull();
    saveProfile({ name: 'Ana', color: '#8EC5FF' });
    expect(loadProfile()).toEqual({ name: 'Ana', color: '#8EC5FF' });
    localStorage.setItem('cartolina.profile', JSON.stringify({ name: 'X', color: '#000000' }));
    expect(loadProfile()).toBeNull();
  });

  it('lembra com qual perfil esta aba entrou em cada sala', () => {
    expect(wasJoined('ABCD')).toBe(false);
    expect(joinedProfile('ABCD')).toBeNull();
    markJoined('ABCD', { name: 'Ana', color: '#8EC5FF' });
    expect(wasJoined('ABCD')).toBe(true);
    expect(joinedProfile('ABCD')).toEqual({ name: 'Ana', color: '#8EC5FF' });
    expect(joinedProfile('WXYZ')).toBeNull();
  });

  it('perfil da sala é por aba: não vaza do localStorage nem aceita lixo', () => {
    saveProfile({ name: 'Outra aba', color: '#FF8FAB' });
    expect(joinedProfile('ABCD')).toBeNull();
    sessionStorage.setItem('cartolina.joined.ABCD', '1');
    expect(joinedProfile('ABCD')).toBeNull();
    expect(wasJoined('ABCD')).toBe(false);
    sessionStorage.setItem('cartolina.joined.ABCD', JSON.stringify({ name: 'X', color: '#000000' }));
    expect(joinedProfile('ABCD')).toBeNull();
  });

  describe('armazenamento bloqueado (getters lançam)', () => {
    const block = (name: 'sessionStorage' | 'localStorage') => {
      const original = Object.getOwnPropertyDescriptor(window, name)!;
      Object.defineProperty(window, name, {
        configurable: true,
        get() {
          throw new DOMException('blocked', 'SecurityError');
        },
      });
      return () => Object.defineProperty(window, name, original);
    };

    it('leituras e gravações não lançam; token fica na memória', () => {
      const restoreS = block('sessionStorage');
      const restoreL = block('localStorage');
      try {
        expect(() => getToken()).not.toThrow();
        const t = getToken();
        expect(t).toMatch(/^[0-9a-f-]{36}$/);
        expect(getToken()).toBe(t);
        expect(loadProfile()).toBeNull();
        expect(() => saveProfile({ name: 'Ana', color: '#8EC5FF' })).not.toThrow();
        expect(joinedProfile('ABCD')).toBeNull();
        expect(wasJoined('ABCD')).toBe(false);
        expect(() => markJoined('ABCD', { name: 'Ana', color: '#8EC5FF' })).not.toThrow();
        expect(loadTiltPref()).toBe(true);
        expect(() => saveTiltPref(false)).not.toThrow();
      } finally {
        restoreS();
        restoreL();
      }
    });
  });

  it('preferência de mesa 3D começa ligada', () => {
    expect(loadTiltPref()).toBe(true);
    saveTiltPref(false);
    expect(loadTiltPref()).toBe(false);
  });

  it('preferência de som começa ligada e fica em cartolina.sound', () => {
    expect(loadSoundPref()).toBe(true);
    saveSoundPref(false);
    expect(loadSoundPref()).toBe(false);
    expect(localStorage.getItem('cartolina.sound')).toBe('off');
    saveSoundPref(true);
    expect(loadSoundPref()).toBe(true);
  });
});
