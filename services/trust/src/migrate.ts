import { fileURLToPath } from 'node:url';
import { runMigrations } from '@masterly/platform';

await runMigrations({ service: 'trust', databaseUrl: process.env.DATABASE_URL, dir: fileURLToPath(new URL('../migrations', import.meta.url)) });
