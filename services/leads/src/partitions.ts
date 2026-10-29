import { ensureMonthlyUuidPartitions, type Db } from '@masterly/platform';

export { uuidv7Bound } from '@masterly/platform';

/** Месячные секции заявок и получателей (см. docs/architecture/data.md#leads). */
export function ensureMonthlyPartitions(db: Db, now = new Date()): Promise<void> {
  return ensureMonthlyUuidPartitions(db, ['leads', 'lead_recipients'], now);
}
