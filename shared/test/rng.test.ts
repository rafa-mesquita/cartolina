import { describe, expect, it } from 'vitest';
import { mulberry32, randomInt, shuffle } from '../src/rng';

describe('rng', () => {
  it('é determinístico para a mesma seed', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });

  it('gera valores em [0, 1)', () => {
    const r = mulberry32(7);
    for (let i = 0; i < 1000; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('randomInt fica em [0, max)', () => {
    const r = mulberry32(1);
    for (let i = 0; i < 500; i++) {
      const v = randomInt(r, 5);
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(5);
    }
  });

  it('shuffle devolve uma permutação sem alterar a entrada', () => {
    const input = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const out = shuffle(mulberry32(3), input);
    expect(input).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect([...out].sort((a, b) => a - b)).toEqual(input);
    expect(shuffle(mulberry32(3), input)).toEqual(out);
    expect(out).not.toEqual(input);
  });
});
