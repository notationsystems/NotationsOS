import { defineConfig, devices } from '@playwright/test';

// Screenshots and end-to-end checks against the built app. The dev server is
// started by Playwright; nothing here talks to a network beyond localhost.
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:3111',
    trace: 'off',
    colorScheme: 'dark',
    // The environment pre-installs Chromium here; do not download browsers.
    launchOptions: process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : undefined,
  },
  projects: [
    { name: 'desktop', testIgnore: /screenshots\.spec\.ts/, use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'mobile', testIgnore: /screenshots\.spec\.ts/, use: { ...devices['Pixel 7'] } },
    { name: 'screenshots', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } }, testMatch: /screenshots\.spec\.ts/ },
  ],
  webServer: {
    command: 'npm run start -- --port 3111',
    url: 'http://127.0.0.1:3111/cases',
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
