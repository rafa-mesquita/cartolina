import type { KittensMatchRecord } from '@cartolina/shared';
import { STATS_ROUNDS_CAP } from './history-db';

/** Idempotente por (sala, partida): gravar a mesma partida de novo não duplica. */
export async function insertKittensMatch(db: D1Database, r: KittensMatchRecord): Promise<void> {
  await db
    .prepare(
      `INSERT INTO kittens_matches (id, match_id, room_code, played_at, record_json)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (room_code, match_id) DO NOTHING`,
    )
    .bind(r.id, r.matchId, r.roomCode, r.playedAt, JSON.stringify(r))
    .run();
}

/**
 * Partidas mais recentes primeiro (pelo fim); `before` pagina por esse fim (exclusivo). Mesma limitação do Cúpi: duas
 * partidas que terminam no mesmo ms bem na divisa de uma página fazem a segunda ser pulada (improvável).
 */
export async function listKittensMatches(db: D1Database, before: number | null, limit: number): Promise<KittensMatchRecord[]> {
  const order = 'ORDER BY played_at DESC, id DESC LIMIT ?';
  const stmt =
    before === null
      ? db.prepare(`SELECT record_json FROM kittens_matches ${order}`).bind(limit)
      : db.prepare(`SELECT record_json FROM kittens_matches WHERE played_at < ? ${order}`).bind(before, limit);
  const { results } = await stmt.all<{ record_json: string }>();
  return results.map((r) => JSON.parse(r.record_json) as KittensMatchRecord);
}

/** As partidas mais recentes (até `cap`), pras estatísticas da galera. */
export async function allKittensMatches(db: D1Database, cap = STATS_ROUNDS_CAP): Promise<KittensMatchRecord[]> {
  return listKittensMatches(db, null, cap);
}
