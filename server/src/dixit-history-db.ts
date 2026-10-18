import type { DixitRoundRecord } from '@cartolina/shared';
import { STATS_ROUNDS_CAP } from './history-db';

/** Idempotente por (sala, chave da revelação): gravar a mesma revelação de novo não duplica. */
export async function insertDixitRound(db: D1Database, r: DixitRoundRecord, revealKey: string): Promise<void> {
  await db
    .prepare(
      `INSERT INTO dixit_rounds (id, match_id, room_code, reveal_key, played_at, target, round, story_card, clue, record_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (room_code, reveal_key) DO NOTHING`,
    )
    .bind(r.id, r.matchId, r.roomCode, revealKey, r.playedAt, r.target, r.round, r.storyCard, r.clue, JSON.stringify(r))
    .run();
}

export interface DixitMatchRef {
  matchId: string;
  /** Hora da 1ª rodada da partida. */
  startedAt: number;
}

/**
 * Partidas mais recentes primeiro, pela 1ª rodada; `before` pagina por esse início (exclusivo). Mesma limitação
 * do DITU: duas partidas com o mesmo início na divisa de uma página fazem a segunda ser pulada (improvável).
 */
export async function listDixitMatchIds(db: D1Database, before: number | null, limit: number): Promise<DixitMatchRef[]> {
  // Com `before`, filtrar as rodadas antes de agrupar dá o mesmo resultado que `HAVING MIN(played_at) < ?`
  // (a rodada mais antiga de uma partida que começou antes de `before` sempre passa no filtro) e usa o índice.
  const select = 'SELECT match_id, MIN(played_at) AS started_at FROM dixit_rounds';
  const order = 'GROUP BY match_id ORDER BY started_at DESC, match_id DESC LIMIT ?';
  const stmt =
    before === null
      ? db.prepare(`${select} ${order}`).bind(limit)
      : db.prepare(`${select} WHERE played_at < ? ${order}`).bind(before, limit);
  const { results } = await stmt.all<{ match_id: string; started_at: number }>();
  return results.map((r) => ({ matchId: r.match_id, startedAt: r.started_at }));
}

interface DixitRow {
  record_json: string;
}

const parse = (rows: DixitRow[]): DixitRoundRecord[] => rows.map((r) => JSON.parse(r.record_json) as DixitRoundRecord);

/** Todas as rodadas das partidas pedidas (uma página: até 20), em ordem cronológica. */
export async function dixitRoundsOfMatches(db: D1Database, matchIds: readonly string[]): Promise<DixitRoundRecord[]> {
  if (matchIds.length === 0) return [];
  const marks = matchIds.map(() => '?').join(', ');
  const { results } = await db
    .prepare(`SELECT record_json FROM dixit_rounds WHERE match_id IN (${marks}) ORDER BY played_at, round, id`)
    .bind(...matchIds)
    .all<DixitRow>();
  return parse(results);
}

/**
 * As `cap` rodadas mais recentes, em ordem cronológica, para estatísticas e cartas famosas. O teto pode cortar a
 * partida mais antiga ao meio (mesma limitação aceita no DITU).
 */
export async function allDixitRounds(db: D1Database, cap = STATS_ROUNDS_CAP): Promise<DixitRoundRecord[]> {
  const { results } = await db
    .prepare('SELECT record_json FROM dixit_rounds ORDER BY played_at DESC, id DESC LIMIT ?')
    .bind(cap)
    .all<DixitRow>();
  return parse(results).reverse();
}
