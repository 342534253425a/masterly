-- Медиа: загрузка напрямую в Object Storage по presigned URL, сервер проверяет файл и чистит метаданные.
-- Временные объекты (tmp/) удаляет lifecycle-правило бакета через 2 дня (infra/terraform/storage.tf).
CREATE TABLE assets (
  id             uuid PRIMARY KEY,
  owner_id       uuid NOT NULL,
  purpose        text NOT NULL,                       -- portfolio | lead | chat | avatar | verification
  status         text NOT NULL DEFAULT 'pending',     -- pending | ready | rejected
  object_key     text NOT NULL,
  content_type   text NOT NULL,
  declared_size  bigint NOT NULL,
  size           bigint,
  sha256         text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  completed_at   timestamptz
);
CREATE INDEX assets_owner ON assets (owner_id, id DESC);
CREATE INDEX assets_sha256 ON assets (sha256) WHERE sha256 IS NOT NULL;
