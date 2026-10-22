import { isBotName, type PlayerColor } from '../../players';
import { camelioStateOf, type Room } from '../../room';
import { camelioCard } from './deck';
import { camelioScoredColors, camelioSpheresInPlay } from './scoring';
import type { CamelioColor, CamelioEndReason, CamelioFrom, CamelioKind, CamelioOutcome, CamelioState } from './types';

/** Pessoa como estava na hora da partida (trocar de nome depois não mexe no passado). */
export interface CamelioPerson {
  name: string;
  color: PlayerColor;
}

/** A frente da carta, sem id (o histórico não depende do baralho de hoje). */
export interface CamelioRecordCard {
  color: CamelioColor;
  spheres: number;
  kind: CamelioKind;
}

/** Uma jogada gravada. `by` e `to` são posições em `players`. */
export interface CamelioRecordPlay {
  by: number;
  to: number;
  from: CamelioFrom;
  card: CamelioRecordCard;
  outcome: CamelioOutcome;
  /** Esferas da cor na mesa de `to` logo depois da carta. */
  sum: number;
}

/** Como cada um terminou: cores pontuadas e esferas na mesa (em cores não pontuadas, o desempate). */
export interface CamelioFinal {
  colors: CamelioColor[];
  spheres: number;
}

/** Uma partida terminada do Cama-Leão, como fica gravada no histórico. */
export interface CamelioMatchRecord {
  id: string;
  /** `${sala}-${início da sessão}-${partida}`: muda a cada "começar" e "jogar de novo". */
  matchId: string;
  roomCode: string;
  /** Quando a partida acabou. */
  playedAt: number;
  /** Pontos (cores) pra ganhar nessa partida. */
  target: number;
  endReason: CamelioEndReason;
  /** Quem jogou, na ordem dos assentos. */
  players: CamelioPerson[];
  /** Posições em `players` de quem ganhou (mais de uma = vitória dividida). */
  winners: number[];
  /** Placar final, na mesma ordem de `players`. */
  final: CamelioFinal[];
  /** Todas as jogadas, na ordem. */
  plays: CamelioRecordPlay[];
}

/** Id da partida: muda a cada partida (`match`) e a cada sessão que sai do lobby (`runStartedAt`). */
export function camelioMatchId(room: Room, state: CamelioState): string {
  return `${room.code}-${room.runStartedAt ?? 0}-${state.match}`;
}

/**
 * Registro a gravar se a sala do Cama-Leão terminou uma partida ainda não gravada (a chave é o id da partida). Partida
 * que volta pro lobby antes do fim não chega a `over`: não grava. Não olha `GAMES.camelio.recordsHistory`: esse portão
 * fica em `pendingHistoryRecord`.
 */
export function pendingCamelioRecord(room: Room, now: number, id: string): { key: string; record: CamelioMatchRecord } | null {
  const state = camelioStateOf(room);
  if (!state || state.phase !== 'over' || state.endReason === null) return null;
  const key = camelioMatchId(room, state);
  if (key === room.recordedRevealKey) return null;
  const people = state.players.flatMap((p) => {
    const seat = room.seats.find((s) => s.id === p);
    return seat ? [{ name: seat.name, color: seat.color }] : [];
  });
  // Defesa: jogador sem assento sumiria em silêncio do registro (e da checagem de bot); melhor não gravar.
  if (people.length !== state.players.length) return null;
  // Partida de teste com bot não suja o histórico (aberto a todos).
  if (people.some((p) => isBotName(p.name))) return null;
  const pos = new Map(state.players.map((p, i) => [p, i]));
  return {
    key,
    record: {
      id,
      matchId: key,
      roomCode: room.code,
      playedAt: now,
      target: state.target,
      endReason: state.endReason,
      players: people,
      winners: state.winners.flatMap((w) => (pos.has(w) ? [pos.get(w)!] : [])),
      final: state.players.map((p) => {
        // `?? []`: defesa pra sala salva antes (o `Record` pode não ter o jogador).
        const table = state.table[p] ?? [];
        const scored = state.scored[p] ?? [];
        return { colors: camelioScoredColors(scored), spheres: camelioSpheresInPlay(table, scored) };
      }),
      plays: state.log.map((x) => {
        const card = camelioCard(x.card);
        return {
          by: pos.get(x.by) ?? -1,
          to: pos.get(x.to) ?? -1,
          from: x.from,
          card: { color: card.color, spheres: card.spheres, kind: card.kind },
          outcome: x.outcome,
          sum: x.sum,
        };
      }),
    },
  };
}
