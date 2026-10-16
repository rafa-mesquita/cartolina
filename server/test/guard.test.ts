import { describe, expect, it } from 'vitest';
import { MAX_BODY_BYTES, TOO_LARGE, allowedOrigin, readSmallJson, underLimit, type Limiter } from '../src/guard';

const PAGES = 'https://rafa-mesquita.github.io';

describe('allowedOrigin', () => {
  it('aceita a origem do Pages e as locais (qualquer porta)', () => {
    expect(allowedOrigin(PAGES, PAGES)).toBe(PAGES);
    expect(allowedOrigin('http://localhost:5173', PAGES)).toBe('http://localhost:5173');
    expect(allowedOrigin('http://127.0.0.1:4173', PAGES)).toBe('http://127.0.0.1:4173');
    expect(allowedOrigin('http://localhost', PAGES)).toBe('http://localhost');
  });

  it('lista separada por vírgula, com espaços', () => {
    expect(allowedOrigin('https://b.example', `${PAGES}, https://b.example`)).toBe('https://b.example');
  });

  it('recusa o resto (inclusive parecidos)', () => {
    expect(allowedOrigin(null, PAGES)).toBeNull();
    expect(allowedOrigin('https://evil.example', PAGES)).toBeNull();
    expect(allowedOrigin('https://rafa-mesquita.github.io.evil.example', PAGES)).toBeNull();
    expect(allowedOrigin('http://localhost.evil.example', PAGES)).toBeNull();
    expect(allowedOrigin('https://localhost:5173', PAGES)).toBeNull();
  });
});

describe('underLimit', () => {
  const limiter = (success: boolean): Limiter & { keys: string[] } => {
    const keys: string[] = [];
    return { keys, limit: async ({ key }) => (keys.push(key), { success }) };
  };

  it('sem binding ou sem IP: sempre pode', async () => {
    expect(await underLimit(undefined, '203.0.113.7')).toBe(true);
    const l = limiter(false);
    expect(await underLimit(l, null)).toBe(true);
    expect(l.keys).toEqual([]);
  });

  it('se o limitador falhar, deixa passar', async () => {
    const broken: Limiter = { limit: async () => { throw new Error('indisponível'); } };
    expect(await underLimit(broken, '203.0.113.7')).toBe(true);
  });

  it('com binding e IP: pergunta ao limitador usando o IP como chave', async () => {
    const ok = limiter(true);
    expect(await underLimit(ok, '203.0.113.7')).toBe(true);
    expect(ok.keys).toEqual(['203.0.113.7']);
    expect(await underLimit(limiter(false), '203.0.113.7')).toBe(false);
  });
});

describe('readSmallJson', () => {
  const req = (body: string, headers: Record<string, string> = {}) =>
    new Request('https://x/rooms', { method: 'POST', body, headers });

  it('lê JSON pequeno; JSON inválido vira null', async () => {
    expect(await readSmallJson(req('{"name":"Galera"}'))).toEqual({ name: 'Galera' });
    expect(await readSmallJson(req('{oops'))).toBeNull();
  });

  it('corpo acima do limite é recusado', async () => {
    const big = JSON.stringify({ name: 'x'.repeat(MAX_BODY_BYTES) });
    expect(await readSmallJson(req(big))).toBe(TOO_LARGE);
  });
});
