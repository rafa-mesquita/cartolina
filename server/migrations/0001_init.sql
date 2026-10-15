CREATE TABLE IF NOT EXISTS groups (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS rounds (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL REFERENCES groups(id),
  room_code TEXT NOT NULL,
  played_at INTEGER NOT NULL,
  mode TEXT NOT NULL,
  level INTEGER NOT NULL,
  outcome TEXT NOT NULL,
  errors INTEGER NOT NULL,
  campaign_id TEXT,
  theme_json TEXT NOT NULL,
  players_json TEXT NOT NULL,
  cards_json TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS rounds_group_played ON rounds (group_id, played_at DESC);
