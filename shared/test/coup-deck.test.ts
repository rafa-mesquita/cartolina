import { describe, expect, it } from 'vitest';
import { fullDeck, shuffledDeck } from '../src/games/coup/deck';
import {
  COUP_ACTION_KINDS,
  COUP_BLOCKERS,
  COUP_CHARACTERS,
  COUP_CLAIM,
  COUP_COST,
  COUP_GAIN,
  COUP_TARGETED,
} from '../src/games/coup/types';
import { mulberry32 } from '../src/rng';

describe('Cúpi: baralho e tabelas', () => {
  it('15 cartas: 3 de cada um dos 5 personagens', () => {
    const deck = fullDeck();
    expect(deck).toHaveLength(15);
    for (const c of COUP_CHARACTERS) expect(deck.filter((d) => d === c)).toHaveLength(3);
  });

  it('o baralho embaralhado tem as mesmas cartas e depende só do sorteio', () => {
    const a = shuffledDeck(mulberry32(1));
    expect([...a].sort()).toEqual([...fullDeck()].sort());
    expect(shuffledDeck(mulberry32(1))).toEqual(a);
    expect(shuffledDeck(mulberry32(2))).not.toEqual(a);
  });

  it('tabelas das ações seguem o Coup básico', () => {
    expect(COUP_ACTION_KINDS).toEqual(['income', 'foreignAid', 'coup', 'tax', 'assassinate', 'steal', 'exchange']);
    expect(COUP_CLAIM).toEqual({
      income: null,
      foreignAid: null,
      coup: null,
      tax: 'duke',
      assassinate: 'assassin',
      steal: 'captain',
      exchange: 'ambassador',
    });
    expect(COUP_COST.coup).toBe(7);
    expect(COUP_COST.assassinate).toBe(3);
    expect(COUP_GAIN).toEqual({ income: 1, foreignAid: 2, tax: 3, steal: 2 });
    expect(COUP_ACTION_KINDS.filter((k) => COUP_TARGETED[k])).toEqual(['coup', 'assassinate', 'steal']);
    expect(COUP_BLOCKERS.foreignAid).toEqual(['duke']);
    expect(COUP_BLOCKERS.assassinate).toEqual(['contessa']);
    expect(COUP_BLOCKERS.steal).toEqual(['captain', 'ambassador']);
    expect(COUP_BLOCKERS.tax).toEqual([]);
  });
});
