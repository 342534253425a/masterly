-- Заявки. leads и lead_recipients секционированы по диапазону UUIDv7 (месяц): первичный ключ — один столбец id,
-- а «месяц» читается из префикса времени. Секции на 3 месяца вперёд создаёт partitions.ts до прихода трафика.
CREATE SEQUENCE lead_number_seq;

CREATE TABLE leads (
  id                  uuid NOT NULL,
  number              text NOT NULL,
  client_id           uuid NOT NULL,
  city_id             text NOT NULL,
  service_id          text NOT NULL,
  model_id            text NOT NULL DEFAULT '',
  description         text NOT NULL,                  -- контакты маскируются, если клиент не разрешил их показывать
  urgency             text NOT NULL,
  visit_type          text NOT NULL,
  preferred_channel   text NOT NULL,
  share_phone         boolean NOT NULL DEFAULT false,
  photo_ids           uuid[] NOT NULL DEFAULT '{}',
  status              text NOT NULL DEFAULT 'new',     -- new | viewed | responded | accepted | in_progress | completed | cancelled | declined | expired
  accepted_master_id  uuid,
  version             integer NOT NULL DEFAULT 1,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  expires_at          timestamptz NOT NULL,
  PRIMARY KEY (id)
) PARTITION BY RANGE (id);
CREATE TABLE leads_default PARTITION OF leads DEFAULT;
CREATE INDEX leads_client ON leads (client_id, id DESC);
CREATE INDEX leads_expiring ON leads (expires_at) WHERE status IN ('new', 'viewed', 'responded');

-- Глобальная уникальность ключа идемпотентности (в секционированной таблице уникальность обязана включать id)
CREATE TABLE lead_idempotency (
  client_id   uuid NOT NULL,
  key         text NOT NULL,
  lead_id     uuid NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (client_id, key)
);
CREATE INDEX lead_idempotency_created ON lead_idempotency (created_at);

CREATE TABLE lead_recipients (
  lead_id       uuid NOT NULL,
  master_id     uuid NOT NULL,
  status        text NOT NULL DEFAULT 'new',          -- new | viewed | responded | accepted | declined | expired
  viewed_at     timestamptz,
  responded_at  timestamptz,
  PRIMARY KEY (lead_id, master_id)
) PARTITION BY RANGE (lead_id);
CREATE TABLE lead_recipients_default PARTITION OF lead_recipients DEFAULT;
-- Входящие мастера: лента без сортировки в памяти, статус читается из индекса
CREATE INDEX recipients_inbox ON lead_recipients (master_id, lead_id DESC) INCLUDE (status);

CREATE TABLE lead_responses (
  id                uuid PRIMARY KEY,
  lead_id           uuid NOT NULL,
  master_id         uuid NOT NULL,
  price_from_minor  bigint NOT NULL,
  price_to_minor    bigint,
  message           text NOT NULL DEFAULT '',
  eta_min           integer NOT NULL DEFAULT 0,
  status            text NOT NULL DEFAULT 'active',  -- active | accepted | rejected
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (lead_id, master_id)
);

CREATE TABLE lead_events (
  lead_id  uuid NOT NULL,
  at       timestamptz NOT NULL DEFAULT clock_timestamp(),
  type     text NOT NULL,
  actor    text NOT NULL,
  note     text NOT NULL DEFAULT ''
);
CREATE INDEX lead_events_lead ON lead_events (lead_id, at);

-- Журнал раскрытий контактов: лимиты против парсинга и статистика «клики по контактам» для мастера
CREATE TABLE contact_reveals (
  id           uuid PRIMARY KEY,
  user_id      uuid NOT NULL,
  master_id    uuid NOT NULL,
  revealed_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX contact_reveals_user ON contact_reveals (user_id, revealed_at DESC);
CREATE INDEX contact_reveals_master ON contact_reveals (master_id, revealed_at DESC);
