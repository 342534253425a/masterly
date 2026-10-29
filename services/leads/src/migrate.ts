import { fileURLToPath } from 'node:url';
import { runMigrations } from '@masterly/platform';
import { ensureMonthlyPartitions } from './partitions.js';

await runMigrations({
  service: 'leads',
  databaseUrl: process.env.DATABASE_URL,
  dir: fileURLToPath(new URL('../migrations', import.meta.url)),
  after: (db) => ensureMonthlyPartitions(db),
});
