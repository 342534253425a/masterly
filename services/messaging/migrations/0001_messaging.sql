-- Диалоги и сообщения. messages секционированы по диапазону UUIDv7 (месяц), история листается keyset-курсором по id.
CREATE TABLE conversations (
  id                 uuid PRIMARY KEY,
  lead_id            uuid,
  client_id          uuid NOT NULL,
  master_id          uuid NOT NULL,
  subject            text NOT NULL DEFAULT '',
  last_message_text  text NOT NULL DEFAULT '',
  last_message_at    timestamptz NOT NULL DEFAULT now(),
  created_at         timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX conversations_lead_master ON conversations (lead_id, master_id) WHERE lead_id IS NOT NULL;
CREATE UNIQUE INDEX conversations_direct ON conversations (client_id, master_id) WHERE lead_id IS NULL;
CREATE INDEX conversations_client ON conversations (client_id, last_message_at DESC);
CREATE INDEX conversations_master ON conversations (master_id, last_message_at DESC);

CREATE TABLE messages (
  id               uuid NOT NULL,
  conversation_id  uuid NOT NULL,
  author_id        uuid,                              -- NULL: системное сообщение или удалённый аккаунт
  kind             text NOT NULL DEFAULT 'text',      -- text | system
  text             text NOT NULL,
  client_id        text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id)
) PARTITION BY RANGE (id);
CREATE TABLE messages_default PARTITION OF messages DEFAULT;
CREATE INDEX messages_conversation ON messages (conversation_id, id DESC);
CREATE INDEX messages_author ON messages (author_id) WHERE author_id IS NOT NULL;

-- Повтор отправки с тем же client_id (сеть, офлайн-очередь PWA) не создаёт дубль
CREATE TABLE message_dedupe (
  conversation_id  uuid NOT NULL,
  client_id        text NOT NULL,
  message_id       uuid NOT NULL,
  PRIMARY KEY (conversation_id, client_id)
);

CREATE TABLE read_markers (
  conversation_id  uuid NOT NULL,
  user_id          uuid NOT NULL,
  last_read_id     uuid NOT NULL,
  PRIMARY KEY (conversation_id, user_id)
);
