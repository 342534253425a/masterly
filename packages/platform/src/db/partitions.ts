import type { Db } from './db.js';

/** Наименьший UUIDv7 с данной миллисекундой: граница секции по времени для ключей UUIDv7. */
export function uuidv7Bound(ms: number): string {
  const hex = ms.toString(16).padStart(12, '0');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-7000-8000-000000000000`;
}

const monthStart = (date: Date, offset: number) => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + offset, 1));

/**
 * Месячные секции таблиц, секционированных по диапазону UUIDv7 (`PARTITION BY RANGE (id)` + DEFAULT).
 * Запускать после миграций (до трафика) и периодически: иначе строки месяца осядут в DEFAULT-секции.
 */
export async function ensureMonthlyUuidPartitions(db: Db, tables: readonly string[], now = new Date(), monthsAhead = 3): Promise<void> {
  for (let offset = 0; offset <= monthsAhead; offset++) {
    const from = monthStart(now, offset);
    const to = monthStart(now, offset + 1);
    const suffix = `${from.getUTCFullYear()}${String(from.getUTCMonth() + 1).padStart(2, '0')}`;
    for (const table of tables) {
      await db
        .exec(`CREATE TABLE IF NOT EXISTS ${table}_${suffix} PARTITION OF ${table} FOR VALUES FROM ('${uuidv7Bound(from.getTime())}') TO ('${uuidv7Bound(to.getTime())}')`)
        .catch(() => undefined); // гонка подов или строки месяца уже в DEFAULT — повтор следующим проходом
    }
  }
}
