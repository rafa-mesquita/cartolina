import { isBotName, type PlayerColor } from '../../players';
import { coupStateOf, type Room } from '../../room';
import { hiddenOf } from './table';
import type { CoupCharacter, CoupState } from './types';

/** Pessoa como estava na hora da partida (trocar de nome depois não mexe no passado). */
export interface CoupPerson {
  name: string;
  color: PlayerColor;
}

/** Uma partida terminada do Cúpi, como fica gravada no histórico. */
export interface CoupMatchRecord {
  id: string;
  /** `${sala}-${início da sessão}-${partida}`: muda a cada "começar" e "jogar de novo". */
  matchId: string;
  roomCode: string;
  /** Quando a partida acabou. */
  playedAt: number;
  /** Quem jogou, na ordem dos assentos. */
  players: CoupPerson[];
  /** Na ordem em que saíram. */
  out: CoupPerson[];
  winner: CoupPerson;
  /** As cartas com que o vencedor terminou (as viradas pra baixo). */
  winnerCards: CoupCharacter[];
}

/** Id da partida: muda a cada partida (`match`) e a cada sessão que sai do lobby (`runStartedAt`). */
export function coupMatchId(room: Room, state: CoupState): string {
  return `${room.code}-${room.runStartedAt ?? 0}-${state.match}`;
}

/**
 * Registro a gravar se a sala do Cúpi terminou uma partida ainda não gravada (a chave é o id da partida).
 * Não olha `GAMES.coup.recordsHistory`: esse portão fica em `pendingHistoryRecord`.
 */
export function pendingCoupRecord(room: Room, now: number, id: string): { key: string; record: CoupMatchRecord } | null {
  const state = coupStateOf(room);
  if (!state || state.phase !== 'over' || state.winner === null) return null;
  const key = coupMatchId(room, state);
  if (key === room.recordedRevealKey) return null;
  const person = (playerId: string): CoupPerson | null => {
    const seat = room.seats.find((s) => s.id === playerId);
    return seat ? { name: seat.name, color: seat.color } : null;
  };
  const people = (ids: readonly string[]) => ids.flatMap((p) => {
    const x = person(p);
    return x ? [x] : [];
  });
  const winner = person(state.winner);
  // Defesa: quem jogou sempre tem assento (assentos de quem jogou não são reaproveitados); hoje não acontece.
  if (!winner) return null;
  const players = people(state.players);
  // Partida de teste com bot não suja o histórico (aberto a todos).
  if (players.some((p) => isBotName(p.name))) return null;
  return {
    key,
    record: {
      id,
      matchId: key,
      roomCode: room.code,
      playedAt: now,
      players,
      out: people(state.out),
      winner,
      winnerCards: hiddenOf(state, state.winner),
    },
  };
}
