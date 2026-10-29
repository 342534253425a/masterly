import type { Logger } from 'pino';
import type { Db, Queryable } from '../db/db.js';
import { hash32, LOCK_NAMESPACE } from '../db/migrate.js';
import { metrics } from '../metrics.js';
import type { EventBus } from './bus.js';
import { toRecord } from './codec.js';
import type { OutgoingEvent } from './registry.js';

/** Шарды outbox: порядок внутри агрегата держится тем, что шард в каждый момент публикует один relay. */
export const OUTBOX_SHARDS = 16;
const OUTBOX_LOCK_NAMESPACE = LOCK_NAMESPACE + 1;

export function shardOf(key: string): number {
  return Math.abs(hash32(key)) % OUTBOX_SHARDS;
}

/** Записывает события в outbox в транзакции бизнес-операции (docs/architecture/events.md#4-гарантии-доставки). */
export async function enqueue(tx: Queryable, source: string, events: OutgoingEvent[]): Promise<void> {
  for (const event of events) {
    const record = toRecord(source, event);
    await tx.query('INSERT INTO outbox (id, shard, topic, key, type, payload, headers) VALUES ($1, $2, $3, $4, $5, $6, $7)', [
      record.headers.ce_id,
      shardOf(event.key),
      record.topic,
      event.key,
      event.type,
      Buffer.from(record.value),
      record.headers,
    ]);
  }
}

/**
 * Tombstone для компактированного топика (пустое тело): после сжатия ключ исчезает из Kafka целиком —
 * так данные удалённого профиля физически покидают брокер (docs/architecture/events.md#типы-событий-и-снимки).
 */
export async function enqueueTombstone(tx: Queryable, source: string, topic: string, key: string): Promise<void> {
  const headers = { ce_type: 'tombstone', ce_source: source, ce_subject: key, 'x-tombstone': '1' };
  await tx.query('INSERT INTO outbox (id, shard, topic, key, type, payload, headers) VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6)', [
    shardOf(key),
    topic,
    key,
    'tombstone',
    Buffer.alloc(0),
    headers,
  ]);
}

interface OutboxRow {
  seq: number;
  topic: string;
  key: string;
  payload: Uint8Array;
  headers: Record<string, string>;
  created_at: Date | string;
}

export interface OutboxRelayOptions {
  batchSize?: number;
  busyDelayMs?: number;
  idleDelayMs?: number;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Публикует outbox в Kafka. Работает в каждом поде: шарды разбираются через pg_try_advisory_xact_lock,
 * публикация ждёт acks=all, отметка published_at — в той же транзакции. Сбой между ними даёт повтор (его отсечёт inbox).
 */
export class OutboxRelay {
  private running = false;
  private loop?: Promise<void>;
  private readonly timers: NodeJS.Timeout[] = [];
  private readonly batchSize: number;
  private readonly busyDelayMs: number;
  private readonly idleDelayMs: number;

  constructor(
    private readonly db: Db,
    private readonly bus: EventBus,
    private readonly logger: Logger,
    options: OutboxRelayOptions = {},
  ) {
    this.batchSize = options.batchSize ?? 500;
    this.busyDelayMs = options.busyDelayMs ?? 50;
    this.idleDelayMs = options.idleDelayMs ?? 500;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.loop = this.run();
    const maintain = () => void maintainOutbox(this.db).catch((error: unknown) => this.logger.warn({ err: error }, 'обслуживание outbox не удалось'));
    maintain();
    this.timers.push(
      setInterval(() => void this.reportPending(), 15_000),
      setInterval(maintain, 60 * 60_000),
    );
    for (const timer of this.timers) timer.unref();
  }

  async stop(): Promise<void> {
    this.running = false;
    for (const timer of this.timers) clearInterval(timer);
    await this.loop;
  }

  /** Один проход по всем шардам; возвращает число опубликованных событий. */
  async tick(): Promise<number> {
    let published = 0;
    const start = Math.floor(Math.random() * OUTBOX_SHARDS);
    for (let i = 0; i < OUTBOX_SHARDS; i++) published += await this.publishShard((start + i) % OUTBOX_SHARDS);
    return published;
  }

  private async run(): Promise<void> {
    while (this.running) {
      let published = 0;
      try {
        published = await this.tick();
      } catch (error) {
        this.logger.warn({ err: error }, 'outbox relay: публикация не удалась, повтор');
      }
      await sleep(published > 0 ? this.busyDelayMs : this.idleDelayMs);
    }
  }

  private publishShard(shard: number): Promise<number> {
    return this.db.transaction(async (tx) => {
      const lock = await tx.query<{ locked: boolean }>('SELECT pg_try_advisory_xact_lock($1, $2) AS locked', [OUTBOX_LOCK_NAMESPACE, shard]);
      if (!lock.rows[0]?.locked) return 0;
      const { rows } = await tx.query<OutboxRow>(
        'SELECT seq, topic, key, payload, headers, created_at FROM outbox WHERE shard = $1 AND published_at IS NULL ORDER BY seq LIMIT $2',
        [shard, this.batchSize],
      );
      if (rows.length === 0) return 0;
      await this.bus.publish(rows.map((row) => ({ topic: row.topic, key: row.key, value: row.payload, headers: row.headers })));
      await tx.query('UPDATE outbox SET published_at = now() WHERE shard = $1 AND seq = ANY($2::bigint[])', [shard, rows.map((row) => row.seq)]);
      const now = Date.now();
      for (const row of rows) metrics.outboxPublishLag.observe((now - new Date(row.created_at).getTime()) / 1000);
      return rows.length;
    });
  }

  private async reportPending(): Promise<void> {
    const result = await this.db.query<{ pending: number }>('SELECT count(*)::int AS pending FROM outbox WHERE published_at IS NULL').catch(() => undefined);
    if (result?.rows[0]) metrics.outboxPending.set(result.rows[0].pending);
  }
}

const day = (date: Date, offset: number) => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + offset));
const stamp = (date: Date) => date.toISOString().slice(0, 10).replaceAll('-', '');

/**
 * Секции outbox по суткам: создаются на 3 дня вперёд, опубликованные секции старше срока удаляются целиком
 * (без VACUUM-нагрузки от DELETE). Записи inbox старше 14 дней чистятся батчами.
 */
export async function maintainOutbox(db: Db, now = new Date(), retentionDays = 3): Promise<void> {
  for (let offset = 0; offset <= 3; offset++) {
    const from = day(now, offset);
    const to = day(now, offset + 1);
    await db
      .exec(`CREATE TABLE IF NOT EXISTS outbox_${stamp(from)} PARTITION OF outbox FOR VALUES FROM ('${from.toISOString()}') TO ('${to.toISOString()}')`)
      .catch(() => undefined); // гонка подов или строки этого дня уже в DEFAULT — следующий проход
  }

  const partitions = await db.query<{ name: string }>(
    "SELECT c.relname AS name FROM pg_inherits i JOIN pg_class c ON c.oid = i.inhrelid WHERE i.inhparent = 'outbox'::regclass AND c.relname ~ '^outbox_[0-9]{8}$'",
  );
  const cutoff = stamp(day(now, -retentionDays));
  for (const { name } of partitions.rows) {
    if (name.slice('outbox_'.length) >= cutoff) continue;
    const pending = await db.query(`SELECT 1 FROM ${name} WHERE published_at IS NULL LIMIT 1`);
    if (pending.rowCount === 0) {
      await db.transaction(async (tx) => {
        await tx.exec("SET LOCAL lock_timeout = '2s'");
        await tx.exec(`DROP TABLE IF EXISTS ${name}`);
      });
    }
  }
  await db.query('DELETE FROM outbox_default WHERE published_at < now() - make_interval(days => $1)', [retentionDays]);
  await db.query(
    'DELETE FROM inbox WHERE (consumer, event_id) IN (SELECT consumer, event_id FROM inbox WHERE processed_at < now() - make_interval(days => 14) LIMIT 10000)',
  );
}
