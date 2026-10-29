-- Жалобы пользователей. Объектом может быть мастер, отзыв, фото или сообщение: идентификаторы — строки,
-- а не только UUID (у фото портфолио свои ключи).
ALTER TABLE moderation_items ALTER COLUMN subject_id TYPE text;
ALTER TABLE decisions ALTER COLUMN subject_id TYPE text;

CREATE TABLE complaints (
  id            uuid PRIMARY KEY,
  reporter_id   uuid NOT NULL,
  subject_type  text NOT NULL,                      -- master | review | photo | message
  subject_id    text NOT NULL,
  reason        text NOT NULL,                      -- spam | fake | offensive | fraud | wrong_info | other
  note          text NOT NULL DEFAULT '',
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX complaints_subject ON complaints (subject_type, subject_id);
-- Один пользователь — одна жалоба на объект за сутки (защита очереди от флуда)
CREATE INDEX complaints_reporter_recent ON complaints (reporter_id, created_at DESC);
