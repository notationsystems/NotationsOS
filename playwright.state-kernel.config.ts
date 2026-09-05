import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e', testMatch: 'notation-state.spec.ts',
  timeout: 60_000, workers: 1, retries: 0, reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:3112', trace: 'off', colorScheme: 'dark',
    launchOptions: process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : undefined,
  },
  projects: [
    { name: 'state-desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'state-mobile', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    command: 'npm run start -- --hostname 127.0.0.1 --port 3112', url: 'http://127.0.0.1:3112/notations',
    reuseExistingServer: false, timeout: 120_000,
  },
});
