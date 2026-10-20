import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';

const columns = async (table: string) =>
  (await env.DB.prepare(`SELECT name FROM pragma_table_info('${table}')`).all<{ name: string }>()).results.map((c) => c.name);

describe('migração 0004: partidas do Cúpi', () => {
  it('só cria coisas e nunca toca nas tabelas dos outros jogos (segura para aplicar sozinha)', () => {
    const m4 = env.TEST_MIGRATIONS[3];
    expect(m4?.name).toMatch(/^0004/);
    const sql = m4!.queries.join('\n').replace(/--.*$/gm, '');
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS coup_matches/);
    expect(sql).not.toMatch(/\b(DROP|ALTER|DELETE|UPDATE|INSERT)\b/i);
    expect(sql).not.toMatch(/\brounds\b/);
    expect(sql).not.toMatch(/dixit_rounds/);
  });

  it('cria coup_matches com as colunas e o índice', async () => {
    expect(await columns('coup_matches')).toEqual(['id', 'match_id', 'room_code', 'played_at', 'record_json']);
    const { results } = await env.DB.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'coup_matches'").all<{
      name: string;
    }>();
    expect(results.map((r) => r.name)).toContain('coup_matches_played');
  });

  it('a mesma partida na mesma sala só entra uma vez', async () => {
    const insert = (id: string) =>
      env.DB.prepare(
        `INSERT INTO coup_matches (id, match_id, room_code, played_at, record_json)
         VALUES (?, 'MGR4-1-1', 'MGR4', 70001, '{}') ON CONFLICT (room_code, match_id) DO NOTHING`,
      )
        .bind(id)
        .run();
    await insert('mgr4-a');
    await insert('mgr4-b');
    const { results } = await env.DB.prepare("SELECT id FROM coup_matches WHERE room_code = 'MGR4'").all<{ id: string }>();
    expect(results.map((r) => r.id)).toEqual(['mgr4-a']);
    await env.DB.prepare("DELETE FROM coup_matches WHERE room_code = 'MGR4'").run();
  });

  it('as tabelas do DITU e do Diquisti continuam iguais', async () => {
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
  });
});
