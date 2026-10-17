import {
  PLAYER_COLORS,
  dixitMatches,
  summarizeDixitHistory,
  type DixitHistoryResponse,
  type DixitHistoryStats,
  type DixitPerson,
  type DixitRoundRecord,
} from '@cartolina/shared';

export const ANA: DixitPerson = { name: 'Ana', color: PLAYER_COLORS[0] };
export const BIA: DixitPerson = { name: 'Bia', color: PLAYER_COLORS[1] };
export const CAIO: DixitPerson = { name: 'Caio', color: PLAYER_COLORS[2] };

interface Spec {
  id: string;
  match: string;
  at: number;
  teller: DixitPerson;
  story: string;
  clue: string;
  cards: [string, DixitPerson][];
  votes: [DixitPerson, string][];
  scores: [DixitPerson, number][];
}

export function dxRound(s: Spec): DixitRoundRecord {
  return {
    id: s.id,
    matchId: s.match,
    roomCode: 'KXQ7',
    playedAt: s.at,
    target: 30,
    round: 1,
    storyteller: s.teller,
    clue: s.clue,
    storyCard: s.story,
    cards: [{ card: s.story, owner: s.teller }, ...s.cards.map(([card, owner]) => ({ card, owner }))],
    votes: s.votes.map(([voter, card]) => ({ voter, card })),
    scores: s.scores.map(([p, score]) => ({ ...p, gained: 0, score })),
  };
}

/**
 * Duas partidas. m1 (1ª rodada em 1000): Ana venceu com 31; a 2ª rodada, sem dica, ninguém achou.
 * m2 (5000): não terminou; a dica tem HTML (tem que aparecer como texto).
 */
export const SAMPLE: DixitRoundRecord[] = [
  dxRound({ id: 'r1', match: 'm1', at: 1_000, teller: ANA, story: 'd001', clue: 'luar', cards: [['d002', BIA], ['d003', CAIO]], votes: [[BIA, 'd001'], [CAIO, 'd002']], scores: [[ANA, 3], [BIA, 4], [CAIO, 0]] }),
  dxRound({ id: 'r2', match: 'm1', at: 2_000, teller: BIA, story: 'd005', clue: '', cards: [['d006', CAIO], ['d007', ANA]], votes: [[ANA, 'd006'], [CAIO, 'd007']], scores: [[ANA, 31], [BIA, 4], [CAIO, 2]] }),
  dxRound({ id: 'r3', match: 'm2', at: 5_000, teller: CAIO, story: 'd009', clue: '<b>oi</b>', cards: [['d010', ANA], ['d011', BIA]], votes: [[ANA, 'd009'], [BIA, 'd009']], scores: [[ANA, 2], [BIA, 2], [CAIO, 0]] }),
];

export function dixitResponse(rounds: DixitRoundRecord[], nextBefore: number | null = null, withStats = true): DixitHistoryResponse {
  return { game: 'dixit', matches: dixitMatches(rounds), stats: withStats ? summarizeDixitHistory(rounds) : null, nextBefore };
}

export const EMPTY_STATS: DixitHistoryStats = {
  mostWins: [],
  bestFinders: [],
  bestFoolers: [],
  bestTellers: [],
  favoriteCards: [],
  trickiestCards: [],
  clueWall: [],
  impossibleCards: [],
};
