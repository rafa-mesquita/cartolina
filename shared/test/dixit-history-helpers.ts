import type { GameContext } from '../src/game';
import { dixitPicksPerPlayer } from '../src/games/dixit/rules';
import type { DixitState } from '../src/games/dixit/types';
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
