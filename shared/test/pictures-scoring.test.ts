import { describe, expect, it } from 'vitest';
import { scorePicturesRound } from '../src/games/pictures/scoring';

const secrets = { a: 'A1', b: 'B2', c: 'C3' } as const;

describe('Retratim: pontuação (regra do original)', () => {
  it('ninguém acertou: zero pra todo mundo', () => {
    const r = scorePicturesRound({ artists: ['a', 'b', 'c'], guessers: ['a', 'b', 'c'], secrets, guesses: {} });
    expect(r.gained).toEqual({ a: 0, b: 0, c: 0 });
    expect(r.correct).toEqual({ a: [], b: [], c: [] });
  });

  it('+1 por acerto e +1 pro artista por cada um que acertou a dele', () => {
    const r = scorePicturesRound({
      artists: ['a', 'b', 'c'],
      guessers: ['a', 'b', 'c'],
      secrets,
      guesses: { b: { a: 'A1', c: 'D4' }, c: { a: 'A1', b: 'B2' } },
    });
    // a: 2 acertaram a obra dele. b: acertou a de a (+1) e c acertou a dele (+1). c: acertou a de a e a de b.
    expect(r.gained).toEqual({ a: 2, b: 2, c: 2 });
    expect(r.correct).toEqual({ a: ['b', 'c'], b: ['c'], c: [] });
  });

  it('todo mundo acertou tudo: cada um ganha 2 × (n - 1), sem penalidade', () => {
    const all = { a: { b: 'B2', c: 'C3' }, b: { a: 'A1', c: 'C3' }, c: { a: 'A1', b: 'B2' } } as const;
    const r = scorePicturesRound({ artists: ['a', 'b', 'c'], guessers: ['a', 'b', 'c'], secrets, guesses: all });
    expect(r.gained).toEqual({ a: 4, b: 4, c: 4 });
  });

  it('obra em branco (artista fora da lista) não pontua, mas o dono ainda palpita', () => {
    const r = scorePicturesRound({ artists: ['a', 'b'], guessers: ['a', 'b', 'c'], secrets, guesses: { c: { a: 'A1' } } });
    expect(r.gained).toEqual({ a: 1, b: 0, c: 1 });
    expect(r.correct).toEqual({ a: ['c'], b: [] });
  });

  it('palpite na própria obra é ignorado', () => {
    const r = scorePicturesRound({ artists: ['a'], guessers: ['a'], secrets, guesses: { a: { a: 'A1' } } });
    expect(r.gained).toEqual({ a: 0 });
  });
});
