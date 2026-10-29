-- Отзывы. Право на отзыв появляется только из события «заявка выполнена» (leads.lead.v1):
-- отзыв без реального обращения невозможен — главный барьер против накрутки.
CREATE TABLE lead_meta (
  lead_id     uuid PRIMARY KEY,
  client_id   uuid NOT NULL,
  service_id  text NOT NULL,
  model_id    text NOT NULL DEFAULT ''
);

CREATE TABLE review_eligibility (
  lead_id       uuid PRIMARY KEY,
  master_id     uuid NOT NULL,
  client_id     uuid NOT NULL,
  service_id    text NOT NULL DEFAULT '',
  model_id      text NOT NULL DEFAULT '',
  completed_at  timestamptz NOT NULL,
  expires_at    timestamptz NOT NULL
);

CREATE TABLE reviews (
  id           uuid PRIMARY KEY,
  lead_id      uuid NOT NULL UNIQUE,                -- один отзыв на заявку
  master_id    uuid NOT NULL,
  author_id    uuid,                                -- обнуляется при удалении аккаунта
  author_name  text NOT NULL,
  rating       smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
  text         text NOT NULL,
  service_id   text NOT NULL DEFAULT '',
  model_id     text NOT NULL DEFAULT '',
  photos       integer NOT NULL DEFAULT 0,
  helpful      integer NOT NULL DEFAULT 0,
  status       text NOT NULL DEFAULT 'published',   -- published | hidden
  fraud_score  real NOT NULL DEFAULT 0,
  device_hash  text,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX reviews_master_published ON reviews (master_id, id DESC) WHERE status = 'published';
CREATE INDEX reviews_author ON reviews (author_id) WHERE author_id IS NOT NULL;

CREATE TABLE review_replies (
  review_id   uuid PRIMARY KEY REFERENCES reviews (id),
  master_id   uuid NOT NULL,
  text        text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE ratings (
  master_id     uuid PRIMARY KEY,
  count         integer NOT NULL,
  rating        double precision NOT NULL,
  distribution  integer[] NOT NULL,                 -- количество оценок 1…5
  updated_at    timestamptz NOT NULL DEFAULT now()
);
