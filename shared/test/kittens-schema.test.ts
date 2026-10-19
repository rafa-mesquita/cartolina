import { describe, expect, it } from 'vitest';
import { kittensActionSchema } from '../src/games/kittens/schema';

const valid = (a: unknown) => kittensActionSchema.safeParse(a).success;

describe('schema das ações do Tatubum', () => {
  it('aceita as ações do jogo', () => {
    for (const a of [
      { type: 'start' },
      { type: 'play', cards: ['ataque-0'] },
      { type: 'play', cards: ['capivara-0', 'capivara-1', 'capivara-2'], target: 'p1', ask: 'favor' },
      { type: 'nope' },
      { type: 'draw' },
      { type: 'choose', position: 'random' },
      { type: 'choose', position: 3 },
      { type: 'choose', card: 'mico-0' },
      { type: 'again' },
      { type: 'lobby' },
    ]) {
      expect(valid(a)).toBe(true);
    }
  });

  it('recusa o que não é ação do Tatubum', () => {
    for (const a of [
      { type: 'play', cards: [] },
      { type: 'play', cards: ['a-0', 'a-1', 'a-2', 'a-3', 'a-4', 'a-5'] },
      { type: 'play', cards: ['ataque-0'], ask: 'xadrez' },
      { type: 'choose', position: -1 },
      { type: 'choose', position: 1.5 },
      { type: 'boom' },
    ]) {
      expect(valid(a)).toBe(false);
    }
  });
});
