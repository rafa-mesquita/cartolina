import { describe, expect, it } from 'vitest';
import { clueText, joinNames, matchMeta, matchOutcome, percent, plural } from '../src/games/dixit/history/format';
import { ANA, BIA, CAIO } from './dixit-history-fixtures';

describe('textos do histórico do Diquisti', () => {
  it('junta nomes com vírgula e "e"', () => {
    expect(joinNames([])).toBe('');
    expect(joinNames(['Ana'])).toBe('Ana');
    expect(joinNames(['Ana', 'Bia'])).toBe('Ana e Bia');
    expect(joinNames(['Ana', 'Bia', 'Caio'])).toBe('Ana, Bia e Caio');
  });

  it('resultado da partida: "X venceu", "X e Y venceram" ou "não terminou"', () => {
    expect(matchOutcome({ finished: true, winners: [ANA] })).toBe('Ana venceu');
    expect(matchOutcome({ finished: true, winners: [ANA, BIA, CAIO] })).toBe('Ana, Bia e Caio venceram');
    expect(matchOutcome({ finished: false, winners: [] })).toBe('não terminou');
  });

  it('meta e rodadas da partida', () => {
    expect(matchMeta({ target: 30, rounds: [{}, {}] })).toBe('meta 30 · 2 rodadas');
    expect(matchMeta({ target: 15, rounds: [{}] })).toBe('meta 15 · 1 rodada');
  });

  it('plural, porcentagem e dica', () => {
    expect(plural(1, 'voto', 'votos')).toBe('1 voto');
    expect(plural(0, 'voto', 'votos')).toBe('0 votos');
    expect(percent(2 / 3)).toBe('67%');
    expect(clueText('luar')).toBe('“luar”');
    expect(clueText('')).toBe('falada na call');
  });
});
