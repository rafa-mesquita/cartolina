import { describe, expect, it } from 'vitest';
import { scoreRound } from '../src/games/dixit/scoring';

const four = {
  storyteller: 'n',
  storyCard: 'c0',
  inRound: ['n', 'a', 'b', 'c'],
  owners: { c0: 'n', ca: 'a', cb: 'b', cc: 'c' },
};

describe('scoreRound', () => {
  it('todos acharam: narrador 0, os outros 2', () => {
    const r = scoreRound({ ...four, votes: { a: 'c0', b: 'c0', c: 'c0' } });
    expect(r.gained).toEqual({ n: 0, a: 2, b: 2, c: 2 });
    expect(r.found).toEqual(['a', 'b', 'c']);
  });

  it('ninguém achou: narrador 0, os outros 2 + bônus por voto', () => {
    const r = scoreRound({ ...four, votes: { a: 'cb', b: 'ca', c: 'ca' } });
    expect(r.gained).toEqual({ n: 0, a: 4, b: 3, c: 2 });
    expect(r.found).toEqual([]);
  });

  it('alguns acharam: narrador e quem achou fazem 3, + bônus', () => {
    const r = scoreRound({ ...four, votes: { a: 'c0', b: 'ca', c: 'c0' } });
    expect(r.gained).toEqual({ n: 3, a: 4, b: 0, c: 3 });
    expect(r.found).toEqual(['a', 'c']);
  });

  it('3 jogadores com 2 cartas cada: bônus conta nas duas', () => {
    const r = scoreRound({
      storyteller: 'n',
      storyCard: 'c0',
      inRound: ['n', 'a', 'b'],
      owners: { c0: 'n', a1: 'a', a2: 'a', b1: 'b', b2: 'b' },
      votes: { a: 'b1', b: 'a2' },
    });
    expect(r.gained).toEqual({ n: 0, a: 3, b: 3 });
  });

  it('quem não votou não ganha os 2, mas leva o bônus', () => {
    const r = scoreRound({ ...four, votes: { a: 'cc', b: 'cc' } });
    expect(r.gained).toEqual({ n: 0, a: 2, b: 2, c: 2 });
  });

  it('sem votos ninguém pontua', () => {
    expect(scoreRound({ ...four, votes: {} }).gained).toEqual({ n: 0, a: 0, b: 0, c: 0 });
  });
});
