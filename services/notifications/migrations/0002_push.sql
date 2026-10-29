-- Подписки Web Push (PWA): адрес push-сервиса браузера и ключи шифрования полезной нагрузки (RFC 8291).
-- Endpoint уникален: при повторной подписке браузер получает тот же адрес — запись обновляется.
CREATE TABLE push_subscriptions (
  endpoint         text PRIMARY KEY,
  user_id          uuid NOT NULL,
  p256dh           text NOT NULL,
  auth             text NOT NULL,
  user_agent       text NOT NULL DEFAULT '',
  created_at       timestamptz NOT NULL DEFAULT now(),
  last_success_at  timestamptz
);
CREATE INDEX push_subscriptions_user ON push_subscriptions (user_id);
