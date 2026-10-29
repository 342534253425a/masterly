-- Уведомления. Получатель — ключ «user:<id>» или «master:<id>» (заявки адресованы мастерской, а не человеку).
-- Отложенная доставка (тихие часы, повторы) — строки deliveries с scheduled_for, разбор через FOR UPDATE SKIP LOCKED:
-- без отдельного брокера задач, переживает рестарты, видно в SQL.
CREATE TABLE preferences (
  recipient      text PRIMARY KEY,
  events         jsonb NOT NULL DEFAULT '{}',          -- вид события → каналы
  quiet_enabled  boolean NOT NULL DEFAULT true,
  quiet_start    text NOT NULL DEFAULT '22:00',
  quiet_end      text NOT NULL DEFAULT '08:00',
  timezone       text NOT NULL DEFAULT 'Europe/Moscow',
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE notifications (
  id          uuid PRIMARY KEY,
  recipient   text NOT NULL,
  kind        text NOT NULL,
  title       text NOT NULL,
  body        text NOT NULL,
  href        text NOT NULL DEFAULT '',
  created_at  timestamptz NOT NULL DEFAULT now(),
  read_at     timestamptz
);
CREATE INDEX notifications_inbox ON notifications (recipient, id DESC);
CREATE INDEX notifications_unread ON notifications (recipient) WHERE read_at IS NULL;

CREATE TABLE deliveries (
  id               uuid PRIMARY KEY,
  notification_id  uuid NOT NULL,
  recipient        text NOT NULL,
  channel          text NOT NULL,                     -- push | email | sms
  dedupe_key       text NOT NULL UNIQUE,              -- событие × получатель × канал: повтор события не дублирует отправку
  status           text NOT NULL DEFAULT 'scheduled', -- scheduled | sent | failed
  scheduled_for    timestamptz NOT NULL,
  attempts         integer NOT NULL DEFAULT 0,
  sent_at          timestamptz,
  error            text
);
CREATE INDEX deliveries_due ON deliveries (scheduled_for) WHERE status = 'scheduled';
CREATE INDEX deliveries_recipient ON deliveries (recipient);
