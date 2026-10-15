import { SELF } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { ROOM_ALPHABET } from '../src/index';

describe('HTTP', () => {
  it('POST /rooms cria sala com código de 4 letras do alfabeto', async () => {
    const res = await SELF.fetch('https://x/rooms', { method: 'POST' });
    expect(res.status).toBe(201);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
    const { code } = (await res.json()) as { code: string };
    expect(code).toHaveLength(4);
    for (const ch of code) expect(ROOM_ALPHABET).toContain(ch);
  });

  it('GET /rooms/:code diz se a sala existe (case-insensitive)', async () => {
    const { code } = (await (await SELF.fetch('https://x/rooms', { method: 'POST' })).json()) as { code: string };
    const ok = await SELF.fetch(`https://x/rooms/${code.toLowerCase()}`);
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ exists: true });
  });

  it('sala inexistente ou código inválido dá 404', async () => {
    expect((await SELF.fetch('https://x/rooms/ZZZZ')).status).toBe(404);
    expect((await SELF.fetch('https://x/rooms/1111')).status).toBe(404);
    expect((await SELF.fetch('https://x/qualquer')).status).toBe(404);
  });

  it('OPTIONS responde CORS', async () => {
    const res = await SELF.fetch('https://x/rooms', { method: 'OPTIONS' });
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Methods')).toContain('POST');
  });
});
