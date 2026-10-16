import { SELF } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { newRoomCode } from './helpers';
import { ROOM_ALPHABET } from '../src/codes';

describe('HTTP', () => {
  it('POST /rooms cria sala com código de 4 letras do alfabeto', async () => {
    const res = await SELF.fetch('https://x/rooms', { method: 'POST' });
    expect(res.status).toBe(201);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull(); // sem Origin (fora do navegador): sem CORS
    const { code } = (await res.json()) as { code: string };
    expect(code).toHaveLength(4);
    for (const ch of code) expect(ROOM_ALPHABET).toContain(ch);
  });

  it('GET /rooms/:code diz se a sala existe (case-insensitive)', async () => {
    const { code } = (await (await SELF.fetch('https://x/rooms', { method: 'POST' })).json()) as { code: string };
    const ok = await SELF.fetch(`https://x/rooms/${code.toLowerCase()}`);
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ exists: true, phase: 'lobby', seats: [] });
  });

  it('sala inexistente ou código inválido dá 404', async () => {
    expect((await SELF.fetch('https://x/rooms/ZZZZ')).status).toBe(404);
    expect((await SELF.fetch('https://x/rooms/1111')).status).toBe(404);
    expect((await SELF.fetch('https://x/qualquer')).status).toBe(404);
  });

  it('OPTIONS responde CORS', async () => {
    const res = await SELF.fetch('https://x/rooms', { method: 'OPTIONS', headers: { Origin: 'http://localhost:5173' } });
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Methods')).toContain('POST');
  });

  it('GET /rooms/:code/ws sem Upgrade dá 426', async () => {
    const code = await newRoomCode();
    expect((await SELF.fetch(`https://x/rooms/${code}/ws`)).status).toBe(426);
  });

  it('upgrade de WebSocket para sala inexistente dá 404', async () => {
    const res = await SELF.fetch('https://x/rooms/ZZZZ/ws', { headers: { Upgrade: 'websocket' } });
    expect(res.status).toBe(404);
  });
  it('CORS: devolve a origem só se ela for permitida', async () => {
    const pages = await SELF.fetch('https://x/rooms/ZZZZ', { headers: { Origin: 'https://rafa-mesquita.github.io' } });
    expect(pages.headers.get('Access-Control-Allow-Origin')).toBe('https://rafa-mesquita.github.io');
    expect(pages.headers.get('Vary')).toContain('Origin');
    const local = await SELF.fetch('https://x/rooms', { method: 'OPTIONS', headers: { Origin: 'http://localhost:5173' } });
    expect(local.status).toBe(204);
    expect(local.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:5173');
    const evil = await SELF.fetch('https://x/rooms/ZZZZ', { headers: { Origin: 'https://evil.example' } });
    expect(evil.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });

  it('WebSocket: origem de fora dá 403; local e sem Origin entram', async () => {
    const code = await newRoomCode();
    const evil = await SELF.fetch(`https://x/rooms/${code}/ws`, { headers: { Upgrade: 'websocket', Origin: 'https://evil.example' } });
    expect(evil.status).toBe(403);
    const local = await SELF.fetch(`https://x/rooms/${code}/ws`, { headers: { Upgrade: 'websocket', Origin: 'http://localhost:5173' } });
    expect(local.status).toBe(101);
    local.webSocket?.accept();
    local.webSocket?.close();
  });
});
