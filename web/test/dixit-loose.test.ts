import { mulberry32 } from '@cartolina/shared';
import { describe, expect, it } from 'vitest';
import { assignLoose, playedKeys, roundKeys } from '../src/games/dixit/loose';

describe('cartas soltas na escolha', () => {
  const g = { inRound: ['p0', 'p1', 'p2', 'p3'], storyteller: 'p1', confirmed: ['p3'], storyCard: null, myPicks: [] as string[] };

  it('narrador (1) + quem confirmou; as suas pelo id da carta', () => {
    expect(playedKeys(g, 'p0', []).map((k) => k.key)).toEqual(['p1:0', 'p3:0']);
    expect(playedKeys(g, 'p0', ['d007']).map((k) => k.key)).toEqual(['p0:d007', 'p1:0', 'p3:0']);
    expect(playedKeys({ ...g, confirmed: ['p0', 'p3'], myPicks: ['d009'] }, 'p0', []).map((k) => k.key)).toEqual(['p0:d009', 'p1:0', 'p3:0']);
    expect(playedKeys(g, 'p0', ['d007'])[0]).toEqual({ key: 'p0:d007', player: 'p0', cardId: 'd007' });
  });

  it('quem narra vê a própria carta pelo id', () => {
    expect(playedKeys({ ...g, storyCard: 'd042' }, 'p1', []).map((k) => k.key)).toEqual(['p1:d042', 'p3:0']);
  });

  it('em 3 jogadores cada um joga 2', () => {
    const g3 = { inRound: ['p0', 'p1', 'p2'], storyteller: 'p0', confirmed: ['p2'], storyCard: null, myPicks: [] as string[] };
    expect(playedKeys(g3, 'p1', ['d001']).map((k) => k.key)).toEqual(['p0:0', 'p1:d001', 'p2:0', 'p2:1']);
  });

  it('a rodada inteira na votação: as suas pelas cartas da mesa', () => {
    const table = [
      { cardId: 'a', mine: false },
      { cardId: 'b', mine: true },
      { cardId: 'c', mine: true },
      { cardId: 'd', mine: false },
      { cardId: 'e', mine: false },
    ];
    expect(roundKeys({ inRound: ['p0', 'p1', 'p2'], storyteller: 'p2', table }, 'p0').map((k) => k.key)).toEqual(['p0:b', 'p0:c', 'p1:0', 'p1:1', 'p2:0']);
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
      const m = assignLoose(['p1:0', 'p0:b', 'p2:0'], table, 'p0', mulberry32(seed));
      expect(m.get('b')).toBe('p0:b');
      expect(new Set([m.get('a'), m.get('c')])).toEqual(new Set(['p1:0', 'p2:0']));
    }
  });

  it('sobrando carta sem solta, ela fica sem par', () => {
    const m = assignLoose(['p0:b', 'p1:0'], table, 'p0', mulberry32(1));
    expect(m.size).toBe(2);
    expect(m.get('b')).toBe('p0:b');
  });
});
