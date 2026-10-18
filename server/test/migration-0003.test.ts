import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';

const columns = async (table: string) =>
  (await env.DB.prepare(`SELECT name FROM pragma_table_info('${table}')`).all<{ name: string }>()).results.map((c) => c.name);

describe('migração 0003: rodadas do Diquisti', () => {
  it('só cria coisas e nunca toca na tabela rounds do DITU (segura para aplicar sozinha)', () => {
    const m3 = env.TEST_MIGRATIONS[2];
    expect(m3?.name).toMatch(/^0003/);
    const sql = m3!.queries.join('\n').replace(/--.*$/gm, '');
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS dixit_rounds/);
    expect(sql).not.toMatch(/\b(DROP|ALTER|DELETE|UPDATE|INSERT)\b/i);
    expect(sql).not.toMatch(/\brounds\b/);
  });

  it('cria dixit_rounds com as colunas e os índices', async () => {
    expect(await columns('dixit_rounds')).toEqual([
      'id',
      'match_id',
      'room_code',
      'reveal_key',
      'played_at',
      'target',
      'round',
      'story_card',
      'clue',
      'record_json',
    ]);
    const { results } = await env.DB.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'dixit_rounds'").all<{
      name: string;
    }>();
    expect(results.map((r) => r.name)).toEqual(expect.arrayContaining(['dixit_rounds_played', 'dixit_rounds_match']));
  });

  it('a tabela rounds do DITU continua igual', async () => {
    expect(await columns('rounds')).toEqual([
      'id',
      'game',
      'room_code',
      'reveal_key',
      'played_at',
      'mode',
      'level',
      'outcome',
      'errors',
      'campaign_id',
      'theme_json',
      'players_json',
      'cards_json',
    ]);
  });

  it('a mesma revelação na mesma sala só entra uma vez', async () => {
    const insert = (id: string) =>
      env.DB.prepare(
        `INSERT INTO dixit_rounds (id, match_id, room_code, reveal_key, played_at, target, round, story_card, clue, record_json)
         VALUES (?, 'MGR3-1-1', 'MGR3', 'k1', 60001, 30, 1, 'd001', '', '{}') ON CONFLICT (room_code, reveal_key) DO NOTHING`,
      )
        .bind(id)
        .run();
    await insert('mgr3-a');
    await insert('mgr3-b');
    const { results } = await env.DB.prepare("SELECT id FROM dixit_rounds WHERE room_code = 'MGR3'").all<{ id: string }>();
    expect(results.map((r) => r.id)).toEqual(['mgr3-a']);
    await env.DB.prepare("DELETE FROM dixit_rounds WHERE room_code = 'MGR3'").run();
  });
});
