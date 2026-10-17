import { isBotName, type PlayerColor } from '../../players';
import { dixitStateOf, type Room } from '../../room';
import type { DixitState, DixitTarget } from './types';

/** Pessoa como estava na hora da rodada (trocar de nome depois não mexe no passado). */
export interface DixitPerson {
  name: string;
  color: PlayerColor;
}

/** Carta da mesa com o dono. */
export interface DixitTableEntry {
  card: string;
  owner: DixitPerson;
}

/** Voto de uma pessoa numa carta. */
export interface DixitVote {
  voter: DixitPerson;
  card: string;
}

/** Pontos de uma pessoa na rodada: ganhos nela e placar acumulado. */
export type DixitScore = DixitPerson & { gained: number; score: number };

/** Uma rodada revelada do Diquisti, como fica gravada no histórico. */
export interface DixitRoundRecord {
  id: string;
  /** `${sala}-${início da sessão}-${partida}`: muda a cada `start` e `again`. */
  matchId: string;
  roomCode: string;
  playedAt: number;
  target: DixitTarget;
  /** Narração da partida; pode pular números (narração refeita ou pulada também conta). */
  round: number;
  storyteller: DixitPerson;
  /** Vazia = dica falada na call. */
  clue: string;
  storyCard: string;
  /** Cartas da mesa, na ordem da votação, com o dono. */
  cards: DixitTableEntry[];
  votes: DixitVote[];
  /** Todos da partida depois da rodada: pontos ganhos nela e placar. */
  scores: DixitScore[];
}

/** Id da partida: muda a cada partida (`match`) e a cada sessão que sai do lobby (`runStartedAt`). */
export function dixitMatchId(room: Room, state: DixitState): string {
  return `${room.code}-${room.runStartedAt ?? 0}-${state.match}`;
}

/** Chave da revelação (anti-duplicata): a partida e a narração. Fora da revelação, null. */
export function dixitRevealKey(room: Room): string | null {
  const state = dixitStateOf(room);
  if (!state || state.phase !== 'reveal' || !state.result) return null;
  return `${dixitMatchId(room, state)}|${state.round}`;
}

/**
 * Registro a gravar se a sala do Diquisti está numa revelação ainda não gravada.
 * Não olha `GAMES.dixit.recordsHistory`: esse portão fica em `pendingHistoryRecord`.
 */
export function pendingDixitRecord(room: Room, now: number, id: string): { key: string; record: DixitRoundRecord } | null {
  const state = dixitStateOf(room);
  const key = dixitRevealKey(room);
  if (!state?.result || !key || key === room.recordedRevealKey) return null;
  const result = state.result;
  const person = (playerId: string | undefined): DixitPerson | null => {
    const seat = room.seats.find((s) => s.id === playerId);
    return seat ? { name: seat.name, color: seat.color } : null;
  };
  const storyteller = person(result.storyteller);
  // Defesa: o narrador sempre tem assento (assentos de quem jogou não são reaproveitados); hoje não acontece.
  if (!storyteller) return null;
  const cards = result.table.flatMap((card) => {
    const owner = person(result.owners[card]);
    return owner ? [{ card, owner }] : [];
  });
  const votes = Object.entries(result.votes).flatMap(([voterId, card]) => {
    const voter = person(voterId);
    return voter ? [{ voter, card }] : [];
  });
  // Quem já saiu continua na partida (os assentos dos jogadores da partida não são reaproveitados).
  const scores = state.players.flatMap((playerId) => {
    const p = person(playerId);
    return p ? [{ ...p, gained: result.gained[playerId] ?? 0, score: state.scores[playerId] ?? 0 }] : [];
  });
  // Rodada de teste com bot não suja o histórico (aberto a todos) nem as estatísticas da galera.
  const people = [storyteller, ...cards.map((c) => c.owner), ...votes.map((v) => v.voter), ...scores];
  if (people.some((p) => isBotName(p.name))) return null;
  return {
    key,
    record: {
      id,
      matchId: dixitMatchId(room, state),
      roomCode: room.code,
      playedAt: now,
      target: state.target,
      round: state.round,
      storyteller,
      clue: result.clue,
      storyCard: result.storyCard,
      cards,
      votes,
      scores,
    },
  };
}
