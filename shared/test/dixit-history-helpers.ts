import type { GameContext } from '../src/game';
import { dixitPicksPerPlayer } from '../src/games/dixit/rules';
import type { DixitPerson, DixitRoundRecord } from '../src/games/dixit/record';
import type { DixitState, DixitTarget } from '../src/games/dixit/types';
import { PLAYER_COLORS } from '../src/players';
import { createRoom, joinRoom, type Room } from '../src/room';
import { act, ids, others } from './dixit-helpers';

/** Nome de cada id das salas de teste (p0…p3). */
export const NAMES: Record<string, string> = { p0: 'Ana', p1: 'Bia', p2: 'Caio', p3: 'Duda' };
export const colorOf = (id: string) => PLAYER_COLORS[Number(id.slice(1))]!;

/** Sala ABCD de Diquisti com Ana, Bia, Caio e Duda (p0…p3) sentados, o estado `game` e a sessão começada em 50. */
export function roomOf(game: DixitState, over: Partial<Room> = {}): Room {
  let room = createRoom('ABCD', 0, 'dixit');
  for (const [i, id] of ids(4).entries()) {
    const res = joinRoom(room, { token: `t${i}`, name: NAMES[id]!, color: PLAYER_COLORS[i]! }, id, 0);
    if (!res.ok) throw new Error(res.error);
    room = res.room;
  }
  return { ...room, game, runStartedAt: 50, ...over };
}

/** Da narração até a revelação: o narrador conta a 1ª carta, cada um joga as primeiras e vota na 1ª carta que não é sua. */
export function playToReveal(state: DixitState, ctx: GameContext, clue = 'eco'): DixitState {
  const st = state.storyteller!;
  let s = act(state, st, { type: 'tell', cardId: state.hands[st]![0]!, clue }, ctx);
  const per = dixitPicksPerPlayer(s.inRound.length);
  for (const p of others(s)) {
    s = act(s, p, { type: 'submit', cardIds: s.hands[p]!.slice(0, per) }, ctx);
    s = act(s, p, { type: 'confirm' }, ctx);
  }
  for (const p of others(s)) {
    const mine = s.picks[p] ?? [];
    const cardId = s.table.find((c) => !mine.includes(c))!;
    s = act(s, p, { type: 'vote', cardId }, ctx);
    s = act(s, p, { type: 'confirm' }, ctx);
  }
  return s;
}

export const PEOPLE = {
  Ana: { name: 'Ana', color: PLAYER_COLORS[0] },
  Bia: { name: 'Bia', color: PLAYER_COLORS[1] },
  Caio: { name: 'Caio', color: PLAYER_COLORS[2] },
  Duda: { name: 'Duda', color: PLAYER_COLORS[3] },
} satisfies Record<string, DixitPerson>;
export type Who = keyof typeof PEOPLE;

export interface RoundSpec {
  at: number;
  teller: Who;
  /** Carta do narrador (padrão `d001`). */
  story?: string;
  clue?: string;
  /** Outras cartas da mesa: carta → dono. */
  cards?: Record<string, Who>;
  /** Votante → carta. */
  votes?: Partial<Record<Who, string>>;
  /** Placar depois da rodada. */
  scores?: Partial<Record<Who, number>>;
  match?: string;
  target?: DixitTarget;
}

/** Rodada gravada de mentira, só com o que cada teste precisa. Id `r<at>`, partida padrão `ABCD-1-1`. */
export function dixitRound(s: RoundSpec): DixitRoundRecord {
  const story = s.story ?? 'd001';
  const votes = (Object.entries(s.votes ?? {}) as [Who, string][]).map(([voter, card]) => ({ voter: PEOPLE[voter], card }));
  const scores = (Object.entries(s.scores ?? {}) as [Who, number][]).map(([name, score]) => ({ ...PEOPLE[name], gained: 0, score }));
  return {
    id: `r${s.at}`,
    matchId: s.match ?? 'ABCD-1-1',
    roomCode: 'ABCD',
    playedAt: s.at,
    target: s.target ?? 30,
    round: 1,
    storyteller: PEOPLE[s.teller],
    clue: s.clue ?? '',
    storyCard: story,
    cards: [{ card: story, owner: PEOPLE[s.teller] }, ...Object.entries(s.cards ?? {}).map(([card, owner]) => ({ card, owner: PEOPLE[owner] }))],
    votes,
    scores,
  };
}
