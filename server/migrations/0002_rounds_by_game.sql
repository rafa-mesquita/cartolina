-- Estante de jogos: grupos deixam de existir; o histórico passa a ser um por jogo.
-- Todas as rodadas existentes eram do ITO e continuam no histórico do ITO.
CREATE TABLE rounds_v2 (
  id TEXT PRIMARY KEY,
  game TEXT NOT NULL,
  room_code TEXT NOT NULL,
  -- chave da revelação (anti-duplicata): a mesma revelação gravada de novo vira no-op.
  reveal_key TEXT NOT NULL,
  played_at INTEGER NOT NULL,
  mode TEXT NOT NULL,
  level INTEGER NOT NULL,
  outcome TEXT NOT NULL,
  errors INTEGER NOT NULL,
  campaign_id TEXT,
  theme_json TEXT NOT NULL,
  players_json TEXT NOT NULL,
  cards_json TEXT NOT NULL,
  UNIQUE (game, room_code, reveal_key)
);

INSERT OR IGNORE INTO rounds_v2
  (id, game, room_code, reveal_key, played_at, mode, level, outcome, errors, campaign_id, theme_json, players_json, cards_json)
  SELECT id, 'ito', room_code, reveal_key, played_at, mode, level, outcome, errors, campaign_id, theme_json, players_json, cards_json
  FROM rounds;

DROP TABLE rounds;
DROP TABLE groups;
ALTER TABLE rounds_v2 RENAME TO rounds;
CREATE INDEX rounds_game_played ON rounds (game, played_at DESC);
