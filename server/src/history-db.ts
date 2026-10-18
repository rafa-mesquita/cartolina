import type { GameId, RoundRecord } from '@cartolina/shared';

interface RoundRow {
  id: string;
  game: string;
  room_code: string;
  played_at: number;
  mode: string;
  level: number;
  outcome: string;
  errors: number;
  campaign_id: string | null;
  theme_json: string;
  players_json: string;
  cards_json: string;
}

const ROUND_COLS = 'id, game, room_code, played_at, mode, level, outcome, errors, campaign_id, theme_json, players_json, cards_json';
/** Limite de rodadas lidas para estatísticas (a galera fica bem abaixo disso). */
export const STATS_ROUNDS_CAP = 5000;

/** Itens por página do histórico: rodadas no DITU, partidas no Diquisti. */
export const HISTORY_PAGE_SIZE = 20;

/** Idempotente por (jogo, sala, chave da revelação): gravar a mesma revelação de novo não duplica. */
export async function insertRound(db: D1Database, game: GameId, r: RoundRecord, revealKey: string): Promise<void> {
  await db
    .prepare(
      `INSERT INTO rounds (${ROUND_COLS}, reveal_key) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (game, room_code, reveal_key) DO NOTHING`,
    )
    .bind(
      r.id,
      game,
      r.roomCode,
      r.playedAt,
      r.mode,
      r.level,
      r.outcome,
      r.errors,
      r.campaignId,
      JSON.stringify(r.theme),
      JSON.stringify(r.players),
      JSON.stringify(r.cards),
      revealKey,
    )
    .run();
}

function fromRow(row: RoundRow): RoundRecord {
  return {
    id: row.id,
    roomCode: row.room_code,
    playedAt: row.played_at,
    mode: row.mode as RoundRecord['mode'],
    level: row.level,
    outcome: row.outcome as RoundRecord['outcome'],
    errors: row.errors,
    campaignId: row.campaign_id,
    theme: JSON.parse(row.theme_json) as RoundRecord['theme'],
    players: JSON.parse(row.players_json) as RoundRecord['players'],
    cards: JSON.parse(row.cards_json) as RoundRecord['cards'],
  };
}

/**
 * Mais recentes primeiro; `before` pagina por `played_at` (exclusivo). Limitação conhecida: duas rodadas
 * do mesmo jogo com o mesmo `played_at` na divisa de uma página fazem a segunda ser pulada (improvável).
 */
export async function listRounds(db: D1Database, game: GameId, before: number | null, limit: number): Promise<RoundRecord[]> {
  const stmt =
    before === null
      ? db.prepare(`SELECT ${ROUND_COLS} FROM rounds WHERE game = ? ORDER BY played_at DESC, id DESC LIMIT ?`).bind(game, limit)
      : db
          .prepare(`SELECT ${ROUND_COLS} FROM rounds WHERE game = ? AND played_at < ? ORDER BY played_at DESC, id DESC LIMIT ?`)
          .bind(game, before, limit);
  const { results } = await stmt.all<RoundRow>();
  return results.map(fromRow);
}

/** As `cap` rodadas mais recentes do jogo, em ordem cronológica, para estatísticas. */
export async function allRounds(db: D1Database, game: GameId, cap = STATS_ROUNDS_CAP): Promise<RoundRecord[]> {
  const { results } = await db
    .prepare(`SELECT ${ROUND_COLS} FROM rounds WHERE game = ? ORDER BY played_at DESC, id DESC LIMIT ?`)
    .bind(game, cap)
    .all<RoundRow>();
  return results.map(fromRow).reverse();
}
