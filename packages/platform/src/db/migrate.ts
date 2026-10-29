import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Db, Queryable } from './db.js';

export interface Migration {
  name: string;
  sql: string;
}

/** Пространство имён advisory-локов платформы (второй ключ — хэш имени миграции или номер шарда outbox). */
export const LOCK_NAMESPACE = 0x6d6c79;

/** Таблицы платформы: outbox (секции по суткам) и inbox. Применяются до миграций сервиса. */
export const PLATFORM_MIGRATIONS: Migration[] = [
  {
    name: '0000_platform_outbox_inbox.sql',
    sql: `
CREATE SEQUENCE IF NOT EXISTS outbox_seq;
CREATE TABLE IF NOT EXISTS outbox (
  seq           bigint      NOT NULL DEFAULT nextval('outbox_seq'),
  id            uuid        NOT NULL,
  shard         smallint    NOT NULL,
  topic         text        NOT NULL,
  key           text        NOT NULL,
  type          text        NOT NULL,
  payload       bytea       NOT NULL,
  headers       jsonb       NOT NULL DEFAULT '{}',
  created_at    timestamptz NOT NULL DEFAULT now(),
  published_at  timestamptz,
  PRIMARY KEY (seq, created_at)
) PARTITION BY RANGE (created_at);
CREATE TABLE IF NOT EXISTS outbox_default PARTITION OF outbox DEFAULT;
CREATE INDEX IF NOT EXISTS outbox_pending ON outbox (shard, seq) WHERE published_at IS NULL;

CREATE TABLE IF NOT EXISTS inbox (
  consumer      text        NOT NULL,
  event_id      uuid        NOT NULL,
  processed_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (consumer, event_id)
);
CREATE INDEX IF NOT EXISTS inbox_processed_at ON inbox (processed_at);
`,
  },
];

export async function loadMigrations(dir: string): Promise<Migration[]> {
  const files = (await readdir(dir)).filter((file) => file.endsWith('.sql')).sort();
  return Promise.all(files.map(async (name) => ({ name, sql: await readFile(join(dir, name), 'utf8') })));
}

/**
 * Применяет миграции без сессионных локов (совместимо с transaction pooling):
 * каждая миграция — своя транзакция с pg_advisory_xact_lock по имени файла, проверкой и записью в schema_migrations.
 * Параллельные запуски безопасны: второй дождётся лока и увидит, что миграция уже применена.
 * Файлы с `-- migrate:no-transaction` (CREATE INDEX CONCURRENTLY) пишутся идемпотентно и выполняются вне транзакции.
 */
export async function migrate(db: Db, migrations: Migration[], log?: (name: string) => void): Promise<string[]> {
  await db.transaction(async (tx) => {
    await tx.query('SELECT pg_advisory_xact_lock($1, 0)', [LOCK_NAMESPACE]);
    await tx.exec('CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
  });

  const applied: string[] = [];
  for (const migration of [...PLATFORM_MIGRATIONS, ...migrations]) {
    if (/^--\s*migrate:no-transaction/m.test(migration.sql)) {
      if (await isApplied(db, migration.name)) continue;
      await dropInvalidIndexes(db, migration.sql);
      await db.exec(migration.sql);
      await db.query('INSERT INTO schema_migrations (name) VALUES ($1) ON CONFLICT DO NOTHING', [migration.name]);
    } else {
      const done = await db.transaction(async (tx) => {
        await tx.query('SELECT pg_advisory_xact_lock($1, $2)', [LOCK_NAMESPACE, hash32(migration.name)]);
        if (await isApplied(tx, migration.name)) return false;
        await tx.exec(migration.sql);
        await tx.query('INSERT INTO schema_migrations (name) VALUES ($1)', [migration.name]);
        return true;
      });
      if (!done) continue;
    }
    applied.push(migration.name);
    log?.(migration.name);
  }
  return applied;
}

async function isApplied(db: Queryable, name: string): Promise<boolean> {
  const result = await db.query('SELECT 1 FROM schema_migrations WHERE name = $1', [name]);
  return result.rowCount > 0;
}

/** Индекс, оставшийся невалидным после сбоя CREATE INDEX CONCURRENTLY, удаляется перед повтором. */
async function dropInvalidIndexes(db: Db, sql: string): Promise<void> {
  const names = [...sql.matchAll(/CREATE\s+(?:UNIQUE\s+)?INDEX\s+CONCURRENTLY\s+IF\s+NOT\s+EXISTS\s+("?[\w.]+"?)/gi)].map((match) => match[1]!.replaceAll('"', ''));
  if (names.length === 0) return;
  const invalid = await db.query<{ name: string }>(
    'SELECT c.relname AS name FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid WHERE NOT i.indisvalid AND c.relname = ANY($1::text[])',
    [names],
  );
  for (const { name } of invalid.rows) await db.exec(`DROP INDEX CONCURRENTLY IF EXISTS "${name}"`);
}

/** FNV-1a → int4 для второго ключа advisory-лока. */
export function hash32(value: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash | 0;
}
