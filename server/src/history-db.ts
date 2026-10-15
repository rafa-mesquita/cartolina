import type { RoundRecord } from '@cartolina/shared';
import { randomSlug } from './codes';

export interface GroupRow {
  id: string;
  slug: string;
  name: string;
  created_at: number;
}

interface RoundRow {
  id: string;
  group_id: string;
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

const ROUND_COLS =
  'id, group_id, room_code, played_at, mode, level, outcome, errors, campaign_id, theme_json, players_json, cards_json';
/** Limite de rodadas lidas para estatísticas (um grupo de amigos fica bem abaixo disso). */
export const STATS_ROUNDS_CAP = 5000;

export async function createGroup(db: D1Database, name: string, now: number): Promise<GroupRow> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const row: GroupRow = { id: crypto.randomUUID(), slug: randomSlug(), name, created_at: now };
    try {
      await db
        .prepare('INSERT INTO groups (id, slug, name, created_at) VALUES (?, ?, ?, ?)')
        .bind(row.id, row.slug, row.name, row.created_at)
        .run();
      return row;
    } catch (err) {
      if (!String(err).includes('UNIQUE')) throw err;
    }
  }
  throw new Error('slug_collision');
}

export async function findGroup(db: D1Database, slug: string): Promise<GroupRow | null> {
  return (await db.prepare('SELECT id, slug, name, created_at FROM groups WHERE slug = ?').bind(slug).first<GroupRow>()) ?? null;
}

export async function insertRound(db: D1Database, groupId: string, r: RoundRecord): Promise<void> {
  await db
    .prepare(`INSERT INTO rounds (${ROUND_COLS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(
      r.id,
      groupId,
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

/** Mais recentes primeiro; `before` pagina por `played_at` (exclusivo). */
export async function listRounds(db: D1Database, groupId: string, before: number | null, limit: number): Promise<RoundRecord[]> {
  const stmt =
    before === null
      ? db.prepare(`SELECT ${ROUND_COLS} FROM rounds WHERE group_id = ? ORDER BY played_at DESC, id DESC LIMIT ?`).bind(groupId, limit)
      : db
          .prepare(`SELECT ${ROUND_COLS} FROM rounds WHERE group_id = ? AND played_at < ? ORDER BY played_at DESC, id DESC LIMIT ?`)
          .bind(groupId, before, limit);
  const { results } = await stmt.all<RoundRow>();
  return results.map(fromRow);
}

/** Em ordem cronológica, para estatísticas. */
export async function allRounds(db: D1Database, groupId: string): Promise<RoundRecord[]> {
  const { results } = await db
    .prepare(`SELECT ${ROUND_COLS} FROM rounds WHERE group_id = ? ORDER BY played_at ASC, id ASC LIMIT ?`)
    .bind(groupId, STATS_ROUNDS_CAP)
    .all<RoundRow>();
  return results.map(fromRow);
}
