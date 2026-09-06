import { defineConfig, devices } from '@playwright/test';

// Local production acceptance: HTTP workflows and the production path in a browser, both against a
// built application started with the local rail enabled on a fresh, isolated evidence root.
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 90_000, workers: 1, retries: 0, reporter: [['list']],
  use: { baseURL: 'http://127.0.0.1:3113', trace: 'off', colorScheme: 'dark',
    launchOptions: process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : undefined },
  projects: [
    { name: 'api', testMatch: 'production-api.spec.ts', use: { extraHTTPHeaders: { origin: 'http://127.0.0.1:3113', 'sec-fetch-site': 'same-origin' } } },
    { name: 'browser', testMatch: 'production-path.spec.ts', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    // Spatial Inquiry drives the real spatial service from the browser; the spec seeds the runner's evidence root itself.
    { name: 'spatial', testMatch: 'spatial.spec.ts', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
  ],
  webServer: {
    command: 'npm run start -- --hostname 127.0.0.1 --port 3113',
    url: 'http://127.0.0.1:3113/api/production', reuseExistingServer: false, timeout: 120_000,
  },
});
