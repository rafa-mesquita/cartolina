import { describe, expect, it } from 'vitest';
import { parseHash } from '../src/lib/router';

describe('parseHash', () => {
  it('início', () => {
    expect(parseHash('')).toEqual({ name: 'home' });
    expect(parseHash('#/')).toEqual({ name: 'home' });
  });

  it('sala com código normalizado', () => {
    expect(parseHash('#/sala/kxq7')).toEqual({ name: 'room', code: 'KXQ7' });
  });

  it('qualquer outra coisa volta pro início', () => {
    expect(parseHash('#/sala/abc')).toEqual({ name: 'home' });
    expect(parseHash('#/marca')).toEqual({ name: 'home' });
  });
});
