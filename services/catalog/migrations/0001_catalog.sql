-- Каталог: справочники, профили мастеров, матрица цен. Источник истины для read-модели поиска.
-- Координаты — lat/lng + geohash: гео-запросы выдачи обслуживает OpenSearch, здесь нужны точка и соседство (дубликаты).
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE categories (
  id        text PRIMARY KEY,
  slug      text NOT NULL UNIQUE,
  name      text NOT NULL,
  status    text NOT NULL,
  position  integer NOT NULL DEFAULT 0
);

CREATE TABLE services (
  id             text PRIMARY KEY,
  slug           text NOT NULL UNIQUE,
  category_id    text NOT NULL REFERENCES categories (id),
  name           text NOT NULL,
  description    text NOT NULL DEFAULT '',
  duration_min   integer NOT NULL,
  warranty_days  integer NOT NULL,
  enabled        boolean NOT NULL DEFAULT true
);
CREATE INDEX services_category ON services (category_id);

CREATE TABLE brands (
  id    text PRIMARY KEY,
  slug  text NOT NULL UNIQUE,
  name  text NOT NULL
);

CREATE TABLE device_models (
  id        text PRIMARY KEY,
  brand_id  text NOT NULL REFERENCES brands (id),
  name      text NOT NULL,
  year      integer NOT NULL,
  tier      smallint NOT NULL
);
CREATE INDEX device_models_brand ON device_models (brand_id);
CREATE INDEX device_models_name_trgm ON device_models USING gin (name gin_trgm_ops);

CREATE TABLE masters (
  id                 uuid PRIMARY KEY,
  slug               text NOT NULL UNIQUE,
  owner_user_id      uuid,
  kind               text NOT NULL,
  name               text NOT NULL,
  tagline            text NOT NULL DEFAULT '',
  about              text NOT NULL DEFAULT '',
  city_id            text NOT NULL,
  district_id        text NOT NULL DEFAULT '',
  address            text NOT NULL DEFAULT '',
  lat                double precision NOT NULL,
  lng                double precision NOT NULL,
  geohash            text NOT NULL,
  rating             double precision NOT NULL DEFAULT 0,
  reviews_count      integer NOT NULL DEFAULT 0,
  experience_years   integer NOT NULL DEFAULT 0,
  response_time_min  integer NOT NULL DEFAULT 60,
  warranty_days      integer NOT NULL DEFAULT 30,
  verification       jsonb NOT NULL DEFAULT '{}',
  visit_types        text[] NOT NULL DEFAULT '{}',
  payment_methods    text[] NOT NULL DEFAULT '{}',
  parts              text[] NOT NULL DEFAULT '{}',
  brand_ids          text[] NOT NULL DEFAULT '{}',
  express            boolean NOT NULL DEFAULT false,
  plan               text NOT NULL DEFAULT 'free',
  promotion_erid     text NOT NULL DEFAULT '',
  contact_policy     text NOT NULL DEFAULT 'reveal',   -- reveal | after_lead | chat_only
  phone_enc          text,                             -- AES-256-GCM (FieldCipher)
  phone_hash         text,                             -- HMAC: дубликаты без расшифровки
  telegram_enc       text,
  schedule           jsonb NOT NULL DEFAULT '[]',      -- 7 элементов: {open, close} | null, 0 = понедельник
  accepting_leads    boolean NOT NULL DEFAULT true,
  service_radius_km  double precision NOT NULL DEFAULT 10,
  completeness       smallint NOT NULL DEFAULT 0,
  status             text NOT NULL DEFAULT 'draft',    -- draft | pending | published | suspended | merged | deleted
  profile            jsonb NOT NULL DEFAULT '{}',      -- филиалы, сотрудники, портфолио, витринные поля
  version            bigint NOT NULL DEFAULT 1,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX masters_city_published ON masters (city_id) WHERE status = 'published';
CREATE INDEX masters_owner ON masters (owner_user_id) WHERE owner_user_id IS NOT NULL;
CREATE INDEX masters_phone_hash ON masters (phone_hash) WHERE phone_hash IS NOT NULL;
CREATE INDEX masters_geohash ON masters (geohash text_pattern_ops);
CREATE INDEX masters_name_trgm ON masters USING gin (name gin_trgm_ops);

-- Матрица цен: услуга мастера + цены по сегментам устройств 1…5 (копейки).
CREATE TABLE offers (
  master_id          uuid NOT NULL,
  service_id         text NOT NULL,
  price_from_minor   bigint NOT NULL,
  price_to_minor     bigint NOT NULL,
  tier_prices_minor  integer[] NOT NULL DEFAULT '{}',
  duration_min       integer NOT NULL,
  warranty_days      integer NOT NULL,
  parts              text[] NOT NULL DEFAULT '{}',
  enabled            boolean NOT NULL DEFAULT true,
  updated_at         timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (master_id, service_id)
) PARTITION BY HASH (master_id);

DO $$
BEGIN
  FOR i IN 0..15 LOOP
    EXECUTE format('CREATE TABLE IF NOT EXISTS offers_p%s PARTITION OF offers FOR VALUES WITH (MODULUS 16, REMAINDER %s)', i, i);
  END LOOP;
END $$;

CREATE INDEX offers_service_enabled ON offers (service_id) INCLUDE (price_from_minor) WHERE enabled;
