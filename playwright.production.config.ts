import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e', testMatch: 'production-api.spec.ts',
  timeout: 90_000, workers: 1, retries: 0, reporter: [['list']],
  use: { baseURL: 'http://127.0.0.1:3113', trace: 'off',
    extraHTTPHeaders: { origin: 'http://127.0.0.1:3113', 'sec-fetch-site': 'same-origin' } },
  webServer: {
    command: 'npm run start -- --hostname 127.0.0.1 --port 3113',
    url: 'http://127.0.0.1:3113/api/production', reuseExistingServer: false, timeout: 120_000,
  },
});
