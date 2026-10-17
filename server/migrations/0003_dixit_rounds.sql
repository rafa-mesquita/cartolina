-- Histórico do Diquisti: tabela própria; a do DITU não muda.
-- Só cria coisas, então é segura para aplicar sozinha na publicação.
CREATE TABLE IF NOT EXISTS dixit_rounds (
  id TEXT PRIMARY KEY,
  match_id TEXT NOT NULL,
  room_code TEXT NOT NULL,
  -- chave da revelação (anti-duplicata): a mesma revelação gravada de novo vira no-op.
  reveal_key TEXT NOT NULL,
  played_at INTEGER NOT NULL,
  target INTEGER NOT NULL,
  round INTEGER NOT NULL,
  story_card TEXT NOT NULL,
  clue TEXT NOT NULL,
  -- o DixitRoundRecord inteiro; as colunas acima servem para filtrar e ordenar.
  record_json TEXT NOT NULL,
  UNIQUE (room_code, reveal_key)
);

CREATE INDEX IF NOT EXISTS dixit_rounds_played ON dixit_rounds (played_at DESC);
CREATE INDEX IF NOT EXISTS dixit_rounds_match ON dixit_rounds (match_id);
