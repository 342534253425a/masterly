import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  // Браузер раннера CI — en-US, а сайт выбирает язык по Accept-Language: тесты идут в русской локали целевой аудитории
  use: { baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3100', trace: 'retain-on-failure', locale: 'ru-RU', timezoneId: 'Europe/Moscow' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  webServer: process.env.E2E_BASE_URL ? undefined : { command: 'pnpm dev', url: 'http://localhost:3100', reuseExistingServer: true, timeout: 120_000 },
});
