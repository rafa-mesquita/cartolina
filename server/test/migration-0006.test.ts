import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';

const columns = async (table: string) =>
  (await env.DB.prepare(`SELECT name FROM pragma_table_info('${table}')`).all<{ name: string }>()).results.map((c) => c.name);

describe('migração 0006: partidas do Cama-Leão', () => {
  it('só cria coisas e nunca toca nas tabelas dos outros jogos (segura para aplicar sozinha)', () => {
    const m6 = env.TEST_MIGRATIONS[5];
    expect(m6?.name).toMatch(/^0006/);
    const sql = m6!.queries.join('\n').replace(/--.*$/gm, '');
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS camelio_matches/);
    expect(sql).not.toMatch(/\b(DROP|ALTER|DELETE|UPDATE|INSERT)\b/i);
    expect(sql).not.toMatch(/\brounds\b/);
    expect(sql).not.toMatch(/dixit_rounds|coup_matches|kittens_matches/);
  });

  it('cria camelio_matches com as colunas e o índice', async () => {
    expect(await columns('camelio_matches')).toEqual(['id', 'match_id', 'room_code', 'played_at', 'record_json']);
    const { results } = await env.DB.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'camelio_matches'").all<{
      name: string;
    }>();
    expect(results.map((r) => r.name)).toContain('camelio_matches_played');
  });

  it('a mesma partida na mesma sala só entra uma vez', async () => {
    const insert = (id: string) =>
      env.DB.prepare(
        `INSERT INTO camelio_matches (id, match_id, room_code, played_at, record_json)
         VALUES (?, 'MGR6-1-1', 'MGR6', 70001, '{}') ON CONFLICT (room_code, match_id) DO NOTHING`,
      )
        .bind(id)
        .run();
    await insert('mgr6-a');
    await insert('mgr6-b');
    const { results } = await env.DB.prepare("SELECT id FROM camelio_matches WHERE room_code = 'MGR6'").all<{ id: string }>();
    expect(results.map((r) => r.id)).toEqual(['mgr6-a']);
    await env.DB.prepare("DELETE FROM camelio_matches WHERE room_code = 'MGR6'").run();
  });

  it('a tabela do Tatubum continua igual', async () => {
    expect(await columns('kittens_matches')).toEqual(['id', 'match_id', 'room_code', 'played_at', 'record_json']);
  });
});
