import { mulberry32 } from '@cartolina/shared';
import { describe, expect, it } from 'vitest';
import { allKeys, assignLoose, playedKeys } from '../src/games/dixit/loose';

describe('cartas soltas na escolha', () => {
  const g = { inRound: ['p0', 'p1', 'p2', 'p3'], storyteller: 'p1', confirmed: ['p3'] };

  it('narrador (1) + quem confirmou; as suas pendentes só se você ainda não confirmou', () => {
    expect(playedKeys(g, 'p0', 0).map((k) => k.key)).toEqual(['p1:0', 'p3:0']);
    expect(playedKeys(g, 'p0', 1).map((k) => k.key)).toEqual(['p0:0', 'p1:0', 'p3:0']);
    expect(playedKeys({ ...g, confirmed: ['p0', 'p3'] }, 'p0', 0).map((k) => k.key)).toEqual(['p0:0', 'p1:0', 'p3:0']);
  });

  it('em 3 jogadores cada um joga 2', () => {
    const g3 = { inRound: ['p0', 'p1', 'p2'], storyteller: 'p0', confirmed: ['p2'] };
    expect(playedKeys(g3, 'p1', 1).map((k) => k.key)).toEqual(['p0:0', 'p1:0', 'p2:0', 'p2:1']);
    expect(allKeys(g3).map((k) => `${k.player}|${k.key}`)).toEqual(['p0|p0:0', 'p1|p1:0', 'p1|p1:1', 'p2|p2:0', 'p2|p2:1']);
  });
});

describe('arrumação das soltas', () => {
  const table = [
    { cardId: 'a', mine: false },
    { cardId: 'b', mine: true },
    { cardId: 'c', mine: false },
  ];

  it('a sua vai pra casa da sua carta; as outras sorteadas entre as que sobram', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const m = assignLoose(['p1:0', 'p0:0', 'p2:0'], table, 'p0', mulberry32(seed));
      expect(m.get('b')).toBe('p0:0');
      expect(new Set([m.get('a'), m.get('c')])).toEqual(new Set(['p1:0', 'p2:0']));
    }
  });

  it('sobrando carta sem solta, ela fica sem par', () => {
    const m = assignLoose(['p0:0', 'p1:0'], table, 'p0', mulberry32(1));
    expect(m.size).toBe(2);
    expect(m.get('b')).toBe('p0:0');
  });
});
