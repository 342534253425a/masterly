-- Identity: пользователи, сессии с ротацией refresh-токенов, журнал согласий, ключи подписи JWT,
-- подтверждения исполнения удаления аккаунта сервисами-владельцами ПДн (ADR-0011).
CREATE TABLE users (
  id            uuid PRIMARY KEY,
  phone_enc     text,                                  -- AES-256-GCM; под legal hold до retain_until
  phone_hash    text NOT NULL UNIQUE,                  -- HMAC; у удалённых — освобождается
  email_enc     text,
  email_hash    text UNIQUE,
  name          text NOT NULL DEFAULT '',
  roles         text[] NOT NULL DEFAULT '{client}',
  master_id     uuid,
  city_id       text NOT NULL DEFAULT 'msk',
  status        text NOT NULL DEFAULT 'active',        -- active | deleted
  consents      jsonb NOT NULL DEFAULT '{"analytics": false, "personalization": false, "marketing": false, "policyVersion": 1}',
  created_at    timestamptz NOT NULL DEFAULT now(),
  deleted_at    timestamptz,
  retain_until  timestamptz
);
CREATE INDEX users_retention ON users (retain_until) WHERE status = 'deleted';

CREATE TABLE sessions (
  id            uuid PRIMARY KEY,
  user_id       uuid NOT NULL REFERENCES users (id),
  family_id     uuid NOT NULL,                         -- цепочка ротаций одного входа
  refresh_hash  text NOT NULL UNIQUE,                  -- SHA-256 токена; сам токен не хранится
  user_agent    text NOT NULL DEFAULT '',
  ip_hash       text NOT NULL DEFAULT '',
  created_at    timestamptz NOT NULL DEFAULT now(),
  expires_at    timestamptz NOT NULL,
  rotated_at    timestamptz,
  revoked_at    timestamptz
);
CREATE INDEX sessions_user_active ON sessions (user_id) WHERE revoked_at IS NULL;
CREATE INDEX sessions_family ON sessions (family_id);

-- Журнал согласий только на добавление: доказательство, когда и на что дано или отозвано согласие
CREATE TABLE consent_log (
  id              bigserial PRIMARY KEY,
  user_id         uuid NOT NULL,
  purpose         text NOT NULL,
  granted         boolean NOT NULL,
  policy_version  integer NOT NULL,
  at              timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX consent_log_user ON consent_log (user_id, at DESC);

CREATE TABLE signing_keys (
  kid          text PRIMARY KEY,
  public_jwk   jsonb NOT NULL,
  private_enc  text NOT NULL,                          -- приватный JWK, зашифрованный FieldCipher
  created_at   timestamptz NOT NULL DEFAULT now(),
  retired_at   timestamptz
);

CREATE TABLE erasure_acks (
  user_id          uuid NOT NULL,
  service          text NOT NULL,
  acknowledged_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, service)
);
