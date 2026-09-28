CREATE TABLE IF NOT EXISTS app_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  version INTEGER NOT NULL DEFAULT 0,
  data TEXT NOT NULL
);
INSERT OR IGNORE INTO app_state (id, version, data) VALUES (1, 0, '{}');

CREATE TABLE IF NOT EXISTS login_sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  csrf TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS login_sessions_expires ON login_sessions (expires_at);

CREATE TABLE IF NOT EXISTS request_limits (
  scope TEXT NOT NULL,
  ip TEXT NOT NULL,
  window_start INTEGER NOT NULL,
  count INTEGER NOT NULL,
  PRIMARY KEY (scope, ip, window_start)
);
