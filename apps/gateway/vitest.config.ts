import { defineConfig } from 'vitest/config';

// Сквозной тест поднимает доменные сервисы (NestJS) в процессе — им нужны метаданные декораторов
export default defineConfig({ test: { setupFiles: ['reflect-metadata'], testTimeout: 60_000, hookTimeout: 120_000 } });
