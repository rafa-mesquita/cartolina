import type { CamelioMatchRecord } from '@cartolina/shared';
import { STATS_ROUNDS_CAP } from './history-db';

/** Idempotente por (sala, partida): gravar a mesma partida de novo não duplica. */
export async function insertCamelioMatch(db: D1Database, r: CamelioMatchRecord): Promise<void> {
  await db
    .prepare(
      `INSERT INTO camelio_matches (id, match_id, room_code, played_at, record_json)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (room_code, match_id) DO NOTHING`,
    )
    .bind(r.id, r.matchId, r.roomCode, r.playedAt, JSON.stringify(r))
    .run();
}

/**
 * Partidas mais recentes primeiro (pelo fim); `before` pagina por esse fim (exclusivo). Mesma limitação do Tatubum: duas
 * partidas que terminam no mesmo ms bem na divisa de uma página fazem a segunda ser pulada (improvável).
 */
export async function listCamelioMatches(db: D1Database, before: number | null, limit: number): Promise<CamelioMatchRecord[]> {
  const order = 'ORDER BY played_at DESC, id DESC LIMIT ?';
  const stmt =
    before === null
      ? db.prepare(`SELECT record_json FROM camelio_matches ${order}`).bind(limit)
      : db.prepare(`SELECT record_json FROM camelio_matches WHERE played_at < ? ${order}`).bind(before, limit);
  const { results } = await stmt.all<{ record_json: string }>();
  return results.map((r) => JSON.parse(r.record_json) as CamelioMatchRecord);
}

/** As partidas mais recentes (até `cap`), pras estatísticas da galera. */
export async function allCamelioMatches(db: D1Database, cap = STATS_ROUNDS_CAP): Promise<CamelioMatchRecord[]> {
  return listCamelioMatches(db, null, cap);
}
