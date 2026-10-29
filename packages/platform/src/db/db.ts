import pg from 'pg';
import { metrics } from '../metrics.js';

// int8 (bigint) → number: seq outbox, счётчики и суммы в копейках заведомо меньше 2^53
pg.types.setTypeParser(20, (value) => Number(value));

export interface QueryResult<R> {
  rows: R[];
  rowCount: number;
}

export interface Queryable {
  query<R = Record<string, unknown>>(text: string, params?: readonly unknown[]): Promise<QueryResult<R>>;
  /** Несколько SQL-операторов без параметров (миграции, DDL). */
  exec(sql: string): Promise<void>;
}

export interface Db extends Queryable {
  transaction<T>(fn: (tx: Queryable) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

/**
 * Пул node-postgres за пулером Odyssey (transaction mode): только транзакционные блокировки,
 * без сессионного состояния (docs/architecture/data.md#2-кластеры-и-пулинг).
 */
export function createPgDb(url: string, options: { max?: number; applicationName?: string } = {}): Db {
  const pool = new pg.Pool({
    connectionString: url,
    max: options.max ?? 8,
    application_name: options.applicationName,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 2_000,
    keepAlive: true,
  });
  pool.on('error', () => undefined); // обрыв простаивающего соединения: пул создаст новое

  const timer = setInterval(() => {
    metrics.dbPool.set({ state: 'idle' }, pool.idleCount);
    metrics.dbPool.set({ state: 'used' }, pool.totalCount - pool.idleCount);
    metrics.dbPool.set({ state: 'waiting' }, pool.waitingCount);
  }, 5_000);
  timer.unref();

  const wrap = (client: pg.Pool | pg.PoolClient): Queryable => ({
    async query<R>(text: string, params?: readonly unknown[]) {
      const result = await client.query(text, params as unknown[] | undefined);
      return { rows: result.rows as R[], rowCount: result.rowCount ?? 0 };
    },
    async exec(sql: string) {
      await client.query(sql);
    },
  });

  return {
    ...wrap(pool),
    async transaction<T>(fn: (tx: Queryable) => Promise<T>): Promise<T> {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await fn(wrap(client));
        await client.query('COMMIT');
        return result;
      } catch (error) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw error;
      } finally {
        client.release();
      }
    },
    async close() {
      clearInterval(timer);
      await pool.end();
    },
  };
}
