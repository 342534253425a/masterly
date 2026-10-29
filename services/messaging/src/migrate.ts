import { fileURLToPath } from 'node:url';
import { ensureMonthlyUuidPartitions, runMigrations } from '@masterly/platform';

await runMigrations({
  service: 'messaging',
  databaseUrl: process.env.DATABASE_URL,
  dir: fileURLToPath(new URL('../migrations', import.meta.url)),
  after: (db) => ensureMonthlyUuidPartitions(db, ['messages']),
});
