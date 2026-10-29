import type { Db, Queryable } from '../db/db.js';
import type { InboundEvent } from './codec.js';

/**
 * Идемпотентный потребитель: отметка в inbox и эффект — в одной транзакции.
 * Повторная доставка того же события (ce_id) ничего не делает. Возвращает false для дубля.
 */
export async function processOnce(db: Db, consumer: string, event: Pick<InboundEvent, 'id'>, effect: (tx: Queryable) => Promise<void>): Promise<boolean> {
  return db.transaction(async (tx) => {
    const inserted = await tx.query('INSERT INTO inbox (consumer, event_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [consumer, event.id]);
    if (inserted.rowCount === 0) return false;
    await effect(tx);
    return true;
  });
}
