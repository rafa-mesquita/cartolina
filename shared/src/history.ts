import { pendingCoupRecord, type CoupMatchRecord } from './games/coup/record';
import { pendingDixitRecord, type DixitRoundRecord } from './games/dixit/record';
import type { DixitHistoryStats, DixitMatch } from './games/dixit/summary';
import { GAMES, type GameId } from './games/registry';
import type { ItoMode, ItoOutcome, ItoState, Theme } from './games/ito/types';
import { isBotName, type PlayerColor } from './players';
import { itoStateOf, type Room } from './room';

export const SHARPEST_MIN_CARDS = 3;

export interface RoundPlayer {
  name: string;
  color: PlayerColor;
}

export interface RoundCard {
  name: string;
  color: PlayerColor;
  value: number;
  clue: string;
  error: boolean;
}

/** Uma rodada revelada, como fica gravada no histórico do jogo. */
export interface RoundRecord {
  id: string;
  roomCode: string;
  playedAt: number;
  mode: ItoMode;
  level: number;
  outcome: ItoOutcome;
  errors: number;
  campaignId: string | null;
  theme: Theme;
  players: RoundPlayer[];
  /** Na ordem da fila revelada. */
  cards: RoundCard[];
}

export interface PlayerStat {
  name: string;
  color: PlayerColor;
  cards: number;
  correct: number;
  accuracy: number;
}

export interface HistoryStats {
  rounds: number;
  livreRounds: number;
  livreWins: number;
  campaigns: number;
  campaignsWon: number;
  /** Maior sequência de rodadas seguidas sem nenhum erro. */
  bestStreak: number;
  /** Quem mais acerta a posição (mín. 3 cartas). */
  sharpest: PlayerStat | null;
  topThemes: { titulo: string; count: number }[];
}

/** Resposta de `GET /history/ito` (o DITU). */
export interface HistoryResponse {
  game: 'ito';
  rounds: RoundRecord[];
  /** Só na primeira página (sem `before`); nas seguintes vem `null`. */
  stats: HistoryStats | null;
  nextBefore: number | null;
}

/** Resposta de `GET /history/dixit`: 20 partidas por página; estatísticas e cartas famosas só na primeira. */
export interface DixitHistoryResponse {
  game: 'dixit';
  matches: DixitMatch[];
  /** Só na primeira página (sem `before`); nas seguintes vem `null`. */
  stats: DixitHistoryStats | null;
  /** Início da última partida da página (exclusivo na próxima), ou null se acabou. */
  nextBefore: number | null;
}

/** Resposta de `GET /history/coup`: 20 partidas por página, da mais nova pra mais velha (sem estatísticas por enquanto). */
export interface CoupHistoryResponse {
  game: 'coup';
  matches: CoupMatchRecord[];
  stats: null;
  /** Fim da última partida da página (exclusivo na próxima), ou null se acabou. */
  nextBefore: number | null;
}

/** Resposta de `GET /history/:game`, por jogo (todo jogo do registro precisa estar aqui). */
export interface HistoryResponses {
  ito: HistoryResponse;
  dixit: DixitHistoryResponse;
  /** O Retratim ainda não grava histórico (vem no R4, com o museu): a rota responde 404 antes de chegar aqui. */
  pictures: never;
  /** O Tatubum também não grava histórico por enquanto (plano próprio): a rota responde 404 antes de chegar aqui. */
  kittens: never;
  coup: CoupHistoryResponse;
  /** O Cama-Leão ainda não grava histórico (vem no C4): a rota responde 404 antes de chegar aqui. */
  camelio: never;
}
export type HistoryResponseOf<G extends GameId> = HistoryResponses[G];

/** Identifica uma revelação (ids das cartas se repetem entre rodadas: entram nível, vidas, tema e valores). */
export function revealKey(game: ItoState): string | null {
  if (game.phase !== 'reveal' || !game.reveal) return null;
  const head = `${game.level}|${game.lives}|${game.theme?.titulo ?? ''}|`;
  return head + game.reveal.map((e) => `${e.cardId}=${e.value}`).join('|');
}

/** Registro a gravar se o jogo da sala grava histórico e ela está numa revelação ainda não gravada. */
export function pendingRecord(room: Room, now: number, id: string): { key: string; record: RoundRecord } | null {
  // Só jogos que gravam histórico; aqui só o DITU monta registro (o Diquisti é `pendingDixitRecord`).
  if (!GAMES[room.gameId].recordsHistory) return null;
  const game = itoStateOf(room);
  if (!game) return null;
  const key = revealKey(game);
  if (!key || key === room.recordedRevealKey || !game.outcome || !game.theme || !game.reveal) return null;
  const seatOf = (playerId: string) => room.seats.find((s) => s.id === playerId);
  const players = game.players.flatMap((playerId) => {
    const seat = seatOf(playerId);
    return seat ? [{ name: seat.name, color: seat.color }] : [];
  });
  // Rodada de teste com bot não suja o histórico (aberto a todos) nem as estatísticas da galera.
  if (players.some((p) => isBotName(p.name))) return null;
  const cards = game.reveal.flatMap((entry) => {
    const seat = seatOf(entry.owner);
    if (!seat) return [];
    const clue = game.cards[entry.cardId]?.clue.trim() ?? '';
    return [{ name: seat.name, color: seat.color, value: entry.value, clue, error: entry.error }];
  });
  return {
    key,
    record: {
      id,
      roomCode: room.code,
      playedAt: now,
      mode: game.mode,
      level: game.level,
      outcome: game.outcome,
      errors: cards.filter((c) => c.error).length,
      campaignId: game.mode === 'campanha' && room.runStartedAt != null ? `${room.code}-${room.runStartedAt}` : null,
      theme: game.theme,
      players,
      cards,
    },
  };
}

export function summarizeHistory(rounds: readonly RoundRecord[]): HistoryStats {
  const ordered = [...rounds].sort((a, b) => a.playedAt - b.playedAt);
  let streak = 0;
  let bestStreak = 0;
  let livreRounds = 0;
  let livreWins = 0;
  let campaigns = 0;
  let campaignsWon = 0;
  const players = new Map<string, PlayerStat>();
  const themes = new Map<string, number>();
  for (const r of ordered) {
    streak = r.errors === 0 ? streak + 1 : 0;
    bestStreak = Math.max(bestStreak, streak);
    if (r.mode === 'livre') {
      livreRounds++;
      if (r.outcome === 'round_won') livreWins++;
    }
    if (r.outcome === 'won' || r.outcome === 'lost') {
      campaigns++;
      if (r.outcome === 'won') campaignsWon++;
    }
    themes.set(r.theme.titulo, (themes.get(r.theme.titulo) ?? 0) + 1);
    for (const c of r.cards) {
      const p = players.get(c.name) ?? { name: c.name, color: c.color, cards: 0, correct: 0, accuracy: 0 };
      p.cards++;
      if (!c.error) p.correct++;
      p.color = c.color;
      p.accuracy = p.correct / p.cards;
      players.set(c.name, p);
    }
  }
  const sharpest =
    [...players.values()]
      .filter((p) => p.cards >= SHARPEST_MIN_CARDS)
      .sort((a, b) => b.accuracy - a.accuracy || b.cards - a.cards || a.name.localeCompare(b.name, 'pt-BR'))[0] ?? null;
  const topThemes = [...themes.entries()]
    .map(([titulo, count]) => ({ titulo, count }))
    .sort((a, b) => b.count - a.count || a.titulo.localeCompare(b.titulo, 'pt-BR'))
    .slice(0, 5);
  return { rounds: ordered.length, livreRounds, livreWins, campaigns, campaignsWon, bestStreak, sharpest, topThemes };
}

/** Rodada a gravar, já com o jogo: o servidor escolhe a tabela por ele. */
export type PendingHistoryRecord =
  | { game: 'ito'; key: string; record: RoundRecord }
  | { game: 'dixit'; key: string; record: DixitRoundRecord }
  | { game: 'coup'; key: string; record: CoupMatchRecord };

/** Registro pendente da sala, se o jogo dela grava histórico (`GAMES[jogo].recordsHistory`) e há revelação ou partida nova. */
export function pendingHistoryRecord(room: Room, now: number, id: string): PendingHistoryRecord | null {
  if (!GAMES[room.gameId].recordsHistory) return null;
  switch (room.gameId) {
    case 'dixit': {
      const pending = pendingDixitRecord(room, now, id);
      return pending ? { game: 'dixit', ...pending } : null;
    }
    case 'ito': {
      const pending = pendingRecord(room, now, id);
      return pending ? { game: 'ito', ...pending } : null;
    }
    case 'pictures':
      return null; // histórico e museu do Retratim vêm no R4
    case 'kittens':
      return null; // o histórico do Tatubum vem num plano próprio
    case 'coup': {
      const pending = pendingCoupRecord(room, now, id);
      return pending ? { game: 'coup', ...pending } : null;
    }
    case 'camelio':
      return null; // histórico do Cama-Leão vem no C4
    default: {
      const _never: never = room.gameId;
      return _never;
    }
  }
}
