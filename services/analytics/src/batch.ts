import type { Row, Table, Warehouse } from './warehouse.js';

interface Pending {
  rows: Row[];
  waiters: Array<{ resolve: () => void; reject: (error: unknown) => void }>;
}

/**
 * Пакетная запись: строки копятся до maxRows или maxDelayMs. Каждый add() ждёт вставки своего пакета —
 * обработчик события завершается (и offset Kafka коммитится) только после того, как строка реально в ClickHouse.
 * Параллельные обработчики одного батча Kafka попадают в одну вставку.
 */
export class BatchWriter {
  private readonly pending = new Map<Table, Pending>();
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly warehouse: Warehouse,
    private readonly maxRows = 5_000,
    private readonly maxDelayMs = 500,
  ) {}

  add(table: Table, rows: Row[]): Promise<void> {
    if (rows.length === 0) return Promise.resolve();
    const batch = this.pending.get(table) ?? { rows: [], waiters: [] };
    this.pending.set(table, batch);
    batch.rows.push(...rows);
    const done = new Promise<void>((resolve, reject) => batch.waiters.push({ resolve, reject }));
    if (batch.rows.length >= this.maxRows) void this.flush(table);
    else this.timer ??= setTimeout(() => void this.flushAll(), this.maxDelayMs);
    return done;
  }

  async flushAll(): Promise<void> {
    clearTimeout(this.timer);
    this.timer = undefined;
    await Promise.all([...this.pending.keys()].map((table) => this.flush(table)));
  }

  private async flush(table: Table): Promise<void> {
    const batch = this.pending.get(table);
    if (!batch || batch.rows.length === 0) return;
    this.pending.delete(table);
    try {
      await this.warehouse.insert(table, batch.rows);
      for (const waiter of batch.waiters) waiter.resolve();
    } catch (error) {
      for (const waiter of batch.waiters) waiter.reject(error);
    }
  }
}
