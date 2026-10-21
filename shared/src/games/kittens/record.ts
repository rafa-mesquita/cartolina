import { isBotName, type PlayerColor } from '../../players';
import { kittensStateOf, type Room } from '../../room';
import { kittensWithNewFields } from './compat';
import type { KittensExitHow, KittensState } from './types';

/** Pessoa como estava na hora da partida (trocar de nome depois não mexe no passado). */
export interface KittensPerson {
  name: string;
  color: PlayerColor;
}

/** Uma partida terminada do Tatubum, como fica gravada no histórico. */
export interface KittensMatchRecord {
  id: string;
  /** `${sala}-${início da sessão}-${partida}`: muda a cada "começar" e "jogar de novo". */
  matchId: string;
  roomCode: string;
  /** Quando a partida acabou. */
  playedAt: number;
  /** Quem jogou, na ordem dos assentos. */
  players: KittensPerson[];
  /** Quem saiu, na ordem (1º, 2º…): explodiu (`boom`) ou caiu e não voltou (`left`). O vencedor não entra. */
  exits: { who: KittensPerson; how: KittensExitHow }[];
  winner: KittensPerson;
  /** Nem vem! dados e Desarmes usados por cada um, na ordem dos assentos. */
  perPlayer: { who: KittensPerson; nopes: number; defuses: number }[];
}

/** Id da partida: muda a cada partida (`match`) e a cada sessão que sai do lobby (`runStartedAt`). */
export function kittensMatchId(room: Room, state: KittensState): string {
  return `${room.code}-${room.runStartedAt ?? 0}-${state.match}`;
}

/**
 * Registro a gravar se a sala do Tatubum terminou uma partida ainda não gravada (a chave é o id da partida). Partida que
 * volta pro lobby antes do fim não chega a `gameover`: não grava. Não olha `GAMES.kittens.recordsHistory`: esse portão
 * fica em `pendingHistoryRecord`.
 */
export function pendingKittensRecord(room: Room, now: number, id: string): { key: string; record: KittensMatchRecord } | null {
  const saved = kittensStateOf(room);
  if (!saved || saved.phase !== 'gameover' || saved.winner === null) return null;
  // Sala salva antes do histórico: `match`, `exits` e `stats` completados como no motor.
  const state = kittensWithNewFields(saved);
  const key = kittensMatchId(room, state);
  if (key === room.recordedRevealKey) return null;
  const person = (playerId: string): KittensPerson | null => {
    const seat = room.seats.find((s) => s.id === playerId);
    return seat ? { name: seat.name, color: seat.color } : null;
  };
  const winner = person(state.winner!);
  // Defesa: quem jogou sempre tem assento (assentos de quem jogou não são reaproveitados); hoje não acontece.
  if (!winner) return null;
  const players = state.players.flatMap((p) => {
    const x = person(p);
    return x ? [{ id: p, who: x }] : [];
  });
  // Defesa: jogador sem assento sumiria em silêncio do registro (e da checagem de bot); melhor não gravar.
  if (players.length !== state.players.length) return null;
  // Partida de teste com bot não suja o histórico (aberto a todos).
  if (players.some((p) => isBotName(p.who.name))) return null;
  const byId = new Map(players.map((p) => [p.id, p.who]));
  return {
    key,
    record: {
      id,
      matchId: key,
      roomCode: room.code,
      playedAt: now,
      players: players.map((p) => p.who),
      exits: state.exits.flatMap((e) => {
        const who = byId.get(e.player);
        return who ? [{ who, how: e.how }] : [];
      }),
      winner,
      perPlayer: players.map(({ id: p, who }) => {
        const mine = Object.hasOwn(state.stats, p) ? state.stats[p]! : { nopes: 0, defuses: 0 };
        return { who, nopes: mine.nopes, defuses: mine.defuses };
      }),
    },
  };
}
