import { applyD1Migrations, env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';

const OLD_ROUND = (id: string, group: string, playedAt: number, revealKey = `key-${id}`) => [
  id, group, 'W8YZ', revealKey, playedAt, 'livre', 1, 'round_won', 0, null,
  JSON.stringify({ titulo: 'Tarefas que um robô faria', min: 'humano', max: 'robô' }),
  JSON.stringify([{ name: 'Claude', color: '#8EC5FF' }]),
  JSON.stringify([{ name: 'Claude', color: '#8EC5FF', value: 1, clue: 'dar um abraço', error: false }]),
];

describe('migração 0002: rodadas por jogo', () => {
  it('guarda todas as rodadas antigas como ito e apaga os grupos', async () => {
    const db = env.MIGRATION_DB;
    const [m1, m2] = env.TEST_MIGRATIONS;
    const names = async () => (await db.prepare("SELECT name FROM sqlite_master WHERE type = 'index'").all<{ name: string }>()).results.map((r) => r.name);
    expect(m1?.name).toMatch(/^0001/);
    expect(m2?.name).toMatch(/^0002/);
    await applyD1Migrations(db, [m1!]);
    await db.batch([
      db.prepare('INSERT INTO groups (id, slug, name, created_at) VALUES (?, ?, ?, ?)').bind('g1', 'abcdefghjk', 'Galera', 1),
      db.prepare('INSERT INTO groups (id, slug, name, created_at) VALUES (?, ?, ?, ?)').bind('g2', 'bcdefghjkm', 'Outra', 2),
      // r4 repete (sala, chave da revelação) de r3 em outro grupo: no formato novo as duas viram a mesma revelação.
      ...[OLD_ROUND('r1', 'g1', 100), OLD_ROUND('r2', 'g1', 200), OLD_ROUND('r3', 'g2', 300), OLD_ROUND('r4', 'g1', 400, 'key-r3')].map((v) =>
        db
          .prepare(
            `INSERT INTO rounds (id, group_id, room_code, reveal_key, played_at, mode, level, outcome, errors, campaign_id,
             theme_json, players_json, cards_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(...v),
      ),
    ]);

    expect(await names()).toContain('rounds_group_played');
    await applyD1Migrations(db, [m2!]);

    const rows = await db.prepare('SELECT id, game, played_at, cards_json FROM rounds ORDER BY played_at').all<{
      id: string; game: string; played_at: number; cards_json: string;
    }>();
    expect(rows.results.map((r) => [r.id, r.game, r.played_at])).toEqual([
      ['r1', 'ito', 100],
      ['r2', 'ito', 200],
      ['r3', 'ito', 300],
    ]);
    const indexes = await names();
    expect(indexes).toContain('rounds_game_played');
    expect(indexes).not.toContain('rounds_group_played');
    expect(JSON.parse(rows.results[0]!.cards_json)[0].clue).toBe('dar um abraço');
    const groups = await db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'groups'").all();
    expect(groups.results).toHaveLength(0);
    const cols = await db.prepare("SELECT name FROM pragma_table_info('rounds')").all<{ name: string }>();
    expect(cols.results.map((c) => c.name)).not.toContain('group_id');
  });
});
