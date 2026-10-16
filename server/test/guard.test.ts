import { describe, expect, it } from 'vitest';
import { allowedOrigin } from '../src/guard';

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
