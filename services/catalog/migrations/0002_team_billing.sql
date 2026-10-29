-- Тариф и продвижение (оплата только по внешним счетам, ADR-0009), отпуск мастера, контакты сотрудников.
ALTER TABLE masters
  ADD COLUMN IF NOT EXISTS plan_until timestamptz,
  ADD COLUMN IF NOT EXISTS promotion_until timestamptz,
  ADD COLUMN IF NOT EXISTS vacation_from date,
  ADD COLUMN IF NOT EXISTS vacation_to date;

-- Телефон сотрудника не попадает в публичный профиль: только сюда и только зашифрованным
CREATE TABLE staff_contacts (
  master_id   uuid NOT NULL,
  staff_id    text NOT NULL,
  phone_enc   text NOT NULL,
  invited_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (master_id, staff_id)
);

CREATE SEQUENCE invoice_number_seq;

-- Счёт формирует и отправляет бухгалтерия во внешней системе; здесь — заявка, сумма и статус. Реквизитов карт нет и не будет.
CREATE TABLE invoices (
  id            uuid PRIMARY KEY,
  number        text NOT NULL UNIQUE,
  master_id     uuid NOT NULL,
  product       text NOT NULL,                       -- pro_month | pro_year | promotion_week
  amount_minor  bigint NOT NULL,
  payer         text NOT NULL,
  inn           text NOT NULL,
  email_enc     text NOT NULL,
  status        text NOT NULL DEFAULT 'issued',      -- issued | paid | cancelled
  issued_at     timestamptz NOT NULL DEFAULT now(),
  paid_at       timestamptz
);
CREATE INDEX invoices_master ON invoices (master_id, issued_at DESC);
