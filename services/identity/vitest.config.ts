import { defineConfig } from 'vitest/config';

// Метаданные декораторов NestJS нужны до загрузки классов сервиса
export default defineConfig({ test: { setupFiles: ['reflect-metadata'], testTimeout: 20_000, hookTimeout: 30_000 } });
