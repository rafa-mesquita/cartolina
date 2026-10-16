import { describe, expect, it } from 'vitest';
import { gameHash, parseHash } from '../src/lib/router';

describe('parseHash', () => {
  it('início', () => {
    expect(parseHash('')).toEqual({ name: 'home' });
    expect(parseHash('#/')).toEqual({ name: 'home' });
  });

  it('sala com código normalizado', () => {
    expect(parseHash('#/sala/kxq7')).toEqual({ name: 'room', code: 'KXQ7' });
  });

  it('rotas da estante, do jogo e das abas', () => {
    expect(parseHash('#/ito')).toEqual({ name: 'game', game: 'ito', tab: 'jogar' });
    expect(parseHash('#/ito/historico')).toEqual({ name: 'game', game: 'ito', tab: 'historico' });
    expect(parseHash('#/dixit')).toEqual({ name: 'game', game: 'dixit', tab: 'jogar' });
    expect(parseHash('#/xyz')).toEqual({ name: 'home' });
    expect(parseHash('#/sala/abcd')).toEqual({ name: 'room', code: 'ABCD' });
  });

  it('link antigo de grupo vai pro histórico do ITO', () => {
    expect(parseHash('#/g/abcdefghjk')).toEqual({ name: 'game', game: 'ito', tab: 'historico', legacy: true });
    expect(parseHash('#/g/qualquercoisa')).toEqual({ name: 'game', game: 'ito', tab: 'historico', legacy: true });
  });

  it('qualquer outra coisa volta pro início', () => {
    expect(parseHash('#/sala/abc')).toEqual({ name: 'home' });
    expect(parseHash('#/marca')).toEqual({ name: 'home' });
    expect(parseHash('#/ito/outra')).toEqual({ name: 'home' });
  });

  it('gameHash monta o link de cada aba', () => {
    expect(gameHash('ito')).toBe('#/ito');
    expect(gameHash('ito', 'historico')).toBe('#/ito/historico');
  });
});
