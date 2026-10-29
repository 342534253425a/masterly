-- Настройки интерфейса (JSON, identity их хранит, но не трактует), избранное, поиск пользователей в админке.
ALTER TABLE users ADD COLUMN IF NOT EXISTS settings jsonb NOT NULL DEFAULT '{}';
CREATE INDEX IF NOT EXISTS users_name_prefix ON users (lower(name) text_pattern_ops);
CREATE INDEX IF NOT EXISTS users_created ON users (created_at DESC);
CREATE INDEX IF NOT EXISTS sessions_user_seen ON sessions (user_id, created_at DESC);

CREATE TABLE favorites (
  user_id     uuid NOT NULL,
  master_id   uuid NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, master_id)
);
CREATE INDEX favorites_user_recent ON favorites (user_id, created_at DESC);
