-- Trust & Safety. Похожие профили и отзывы ищутся без попарного сравнения: SimHash режется на 4 полосы по 16 бит,
-- у каждой полосы свой индекс; кандидаты — совпадение хотя бы одной полосы (LSH), затем точная проверка расстояния.
CREATE TABLE fingerprints (
  entity_type  text NOT NULL,                       -- master | review
  entity_id    uuid NOT NULL,
  simhash      text NOT NULL,                       -- 64 бита, hex
  band0        integer NOT NULL,
  band1        integer NOT NULL,
  band2        integer NOT NULL,
  band3        integer NOT NULL,
  owner        text NOT NULL DEFAULT '',            -- мастер: HMAC телефона; отзыв: id мастера
  author_id    uuid,                                -- отзыв: автор
  geohash      text NOT NULL DEFAULT '',
  label        text NOT NULL DEFAULT '',            -- нормализованное название мастера
  city_id      text NOT NULL DEFAULT '',
  created_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (entity_type, entity_id)
);
CREATE INDEX fingerprints_band0 ON fingerprints (entity_type, band0);
CREATE INDEX fingerprints_band1 ON fingerprints (entity_type, band1);
CREATE INDEX fingerprints_band2 ON fingerprints (entity_type, band2);
CREATE INDEX fingerprints_band3 ON fingerprints (entity_type, band3);
CREATE INDEX fingerprints_owner ON fingerprints (entity_type, owner, created_at) WHERE owner <> '';
CREATE INDEX fingerprints_author ON fingerprints (author_id, created_at) WHERE author_id IS NOT NULL;
CREATE INDEX fingerprints_geohash ON fingerprints (entity_type, geohash text_pattern_ops);

CREATE TABLE duplicate_candidates (
  id          uuid PRIMARY KEY,
  master_a    uuid NOT NULL,                        -- master_a < master_b: пара хранится один раз
  master_b    uuid NOT NULL,
  city_id     text NOT NULL,
  score       real NOT NULL,
  signals     jsonb NOT NULL,
  status      text NOT NULL DEFAULT 'open',         -- open | merged | dismissed
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (master_a, master_b)
);
CREATE INDEX duplicate_candidates_open ON duplicate_candidates (city_id, score DESC) WHERE status = 'open';

CREATE TABLE moderation_items (
  id          uuid PRIMARY KEY,
  kind        text NOT NULL,                        -- review | duplicate | media | master
  subject_id  uuid NOT NULL,
  status      text NOT NULL DEFAULT 'open',         -- open | decided
  title       text NOT NULL,
  content     text NOT NULL DEFAULT '',
  risk_score  real NOT NULL,
  reasons     jsonb NOT NULL DEFAULT '[]',
  created_at  timestamptz NOT NULL DEFAULT now(),
  decided_at  timestamptz,
  UNIQUE (kind, subject_id)
);
CREATE INDEX moderation_queue ON moderation_items (status, risk_score DESC);

-- Журнал решений только на добавление: кто, что и почему (аудит модерации)
CREATE TABLE decisions (
  id           uuid PRIMARY KEY,
  item_id      uuid,
  kind         text NOT NULL,
  subject_id   uuid NOT NULL,
  decision     text NOT NULL,
  reason_code  text NOT NULL,
  actor        text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE media_hashes (
  sha256    text NOT NULL,
  owner_id  uuid NOT NULL,
  asset_id  uuid NOT NULL,
  PRIMARY KEY (sha256, owner_id)
);
