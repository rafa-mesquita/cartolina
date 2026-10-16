import { SELF, env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { newGroup, newRoomCode } from './helpers';
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
    expect(await ok.json()).toEqual({ exists: true, game: 'ito', phase: 'lobby', seats: [] });
  });

  it('POST /rooms sem corpo cria sala de ITO', async () => {
    const { code } = (await (await SELF.fetch('https://x/rooms', { method: 'POST' })).json()) as { code: string };
    expect(await (await SELF.fetch(`https://x/rooms/${code}`)).json()).toMatchObject({ game: 'ito' });
  });

  it('POST /rooms { game: "dixit" } cria sala de Dixit', async () => {
    const res = await SELF.fetch('https://x/rooms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ game: 'dixit' }),
    });
    expect(res.status).toBe(201);
    const { code } = (await res.json()) as { code: string };
    expect(await (await SELF.fetch(`https://x/rooms/${code}`)).json()).toMatchObject({ game: 'dixit', phase: 'lobby' });
  });

  it('jogo desconhecido dá 400', async () => {
    const res = await SELF.fetch('https://x/rooms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ game: 'xadrez' }),
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'bad_game' });
  });

  it('sala de grupo também escolhe o jogo', async () => {
    const slug = await newGroup();
    const res = await SELF.fetch(`https://x/groups/${slug}/rooms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ game: 'dixit' }),
    });
    expect(res.status).toBe(201);
    const { code } = (await res.json()) as { code: string };
    expect(await (await SELF.fetch(`https://x/rooms/${code}`)).json()).toMatchObject({ game: 'dixit' });
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
    expect(res.headers.get('Access-Control-Max-Age')).toBe('86400');
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

  it('POST de origem de fora dá 403 (não cria nada); local entra', async () => {
    const evil = await SELF.fetch('https://x/rooms', { method: 'POST', headers: { Origin: 'https://evil.example' } });
    expect(evil.status).toBe(403);
    expect(await evil.json()).toEqual({ error: 'forbidden_origin' });
    const local = await SELF.fetch('https://x/rooms', { method: 'POST', headers: { Origin: 'http://localhost:5173' } });
    expect(local.status).toBe(201);
  });

  it('WebSocket: origem de fora dá 403; local e sem Origin entram', async () => {
    const code = await newRoomCode();
    const evil = await SELF.fetch(`https://x/rooms/${code}/ws`, { headers: { Upgrade: 'websocket', Origin: 'https://evil.example' } });
    expect(evil.status).toBe(403);
    const local = await SELF.fetch(`https://x/rooms/${code}/ws`, { headers: { Upgrade: 'websocket', Origin: 'http://localhost:5173' } });
    expect(local.status).toBe(101);
    local.webSocket?.accept();
    local.webSocket?.close();
    const bare = await SELF.fetch(`https://x/rooms/${code}/ws`, { headers: { Upgrade: 'websocket' } });
    expect(bare.status).toBe(101);
    bare.webSocket?.accept();
    bare.webSocket?.close();
  });

  it('corpo grande demais dá 413', async () => {
    const res = await SELF.fetch('https://x/groups', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'x'.repeat(2000) }),
    });
    expect(res.status).toBe(413);
    expect(await res.json()).toEqual({ error: 'too_large' });
  });

  // Sem o bloco `ratelimits` no wrangler.jsonc (fallback do docs/deploy.md) não há limitador: pula.
  it.skipIf(!('GROUP_LIMITER' in env))('criar grupo: o 6º pedido do mesmo IP no minuto dá 429', async () => {
    const ip = `test-${crypto.randomUUID()}`; // chave única: não depende do estado de outros testes
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) { // 5 é o limite do GROUP_LIMITER no wrangler.jsonc
      const res = await SELF.fetch('https://x/groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': ip },
        body: JSON.stringify({ name: `Galera ${i}` }),
      });
      statuses.push(res.status);
    }
    expect(statuses).toEqual([201, 201, 201, 201, 201, 429]);
  });
});
