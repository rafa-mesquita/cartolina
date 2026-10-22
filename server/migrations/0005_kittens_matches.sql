-- Histórico do Tatubum: tabela própria; as dos outros jogos não mudam.
-- Só cria coisas, então é segura para aplicar sozinha na publicação.
CREATE TABLE IF NOT EXISTS kittens_matches (
  id TEXT PRIMARY KEY,
  match_id TEXT NOT NULL,
  room_code TEXT NOT NULL,
  played_at INTEGER NOT NULL,
  -- o KittensMatchRecord inteiro; as colunas acima servem para filtrar e ordenar.
  record_json TEXT NOT NULL,
  -- a mesma partida gravada de novo vira no-op.
  UNIQUE (room_code, match_id)
);

CREATE INDEX IF NOT EXISTS kittens_matches_played ON kittens_matches (played_at DESC);
