import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';

const columns = async (table: string) =>
  (await env.DB.prepare(`SELECT name FROM pragma_table_info('${table}')`).all<{ name: string }>()).results.map((c) => c.name);

describe('migração 0005: partidas do Tatubum', () => {
  it('só cria coisas e nunca toca nas tabelas dos outros jogos (segura para aplicar sozinha)', () => {
    const m5 = env.TEST_MIGRATIONS[4];
    expect(m5?.name).toMatch(/^0005/);
    const sql = m5!.queries.join('\n').replace(/--.*$/gm, '');
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS kittens_matches/);
    expect(sql).not.toMatch(/\b(DROP|ALTER|DELETE|UPDATE|INSERT)\b/i);
    expect(sql).not.toMatch(/\brounds\b/);
    expect(sql).not.toMatch(/dixit_rounds|coup_matches/);
  });

  it('cria kittens_matches com as colunas e o índice', async () => {
    expect(await columns('kittens_matches')).toEqual(['id', 'match_id', 'room_code', 'played_at', 'record_json']);
    const { results } = await env.DB.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'kittens_matches'").all<{
      name: string;
    }>();
    expect(results.map((r) => r.name)).toContain('kittens_matches_played');
  });

  it('a mesma partida na mesma sala só entra uma vez', async () => {
    const insert = (id: string) =>
      env.DB.prepare(
        `INSERT INTO kittens_matches (id, match_id, room_code, played_at, record_json)
         VALUES (?, 'MGR5-1-1', 'MGR5', 70001, '{}') ON CONFLICT (room_code, match_id) DO NOTHING`,
      )
        .bind(id)
        .run();
    await insert('mgr5-a');
    await insert('mgr5-b');
    const { results } = await env.DB.prepare("SELECT id FROM kittens_matches WHERE room_code = 'MGR5'").all<{ id: string }>();
    expect(results.map((r) => r.id)).toEqual(['mgr5-a']);
    await env.DB.prepare("DELETE FROM kittens_matches WHERE room_code = 'MGR5'").run();
  });

  it('a tabela do Cúpi continua igual', async () => {
    expect(await columns('coup_matches')).toEqual(['id', 'match_id', 'room_code', 'played_at', 'record_json']);
  });
});
