import type { CoupMatchRecord } from '@cartolina/shared';

/** Idempotente por (sala, partida): gravar a mesma partida de novo não duplica. */
export async function insertCoupMatch(db: D1Database, r: CoupMatchRecord): Promise<void> {
  await db
    .prepare(
      `INSERT INTO coup_matches (id, match_id, room_code, played_at, record_json)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (room_code, match_id) DO NOTHING`,
    )
    .bind(r.id, r.matchId, r.roomCode, r.playedAt, JSON.stringify(r))
    .run();
}

/**
 * Partidas mais recentes primeiro (pelo fim); `before` pagina por esse fim (exclusivo). Mesma limitação do Diquisti:
 * duas partidas que terminam no mesmo ms bem na divisa de uma página fazem a segunda ser pulada (improvável).
 */
export async function listCoupMatches(db: D1Database, before: number | null, limit: number): Promise<CoupMatchRecord[]> {
  const order = 'ORDER BY played_at DESC, id DESC LIMIT ?';
  const stmt =
    before === null
      ? db.prepare(`SELECT record_json FROM coup_matches ${order}`).bind(limit)
      : db.prepare(`SELECT record_json FROM coup_matches WHERE played_at < ? ${order}`).bind(before, limit);
  const { results } = await stmt.all<{ record_json: string }>();
  return results.map((r) => JSON.parse(r.record_json) as CoupMatchRecord);
}
