import { defineConfig, devices } from '@playwright/test';

const desktopChrome = devices['Desktop Chrome'];
if (!desktopChrome) throw new Error('Playwright Desktop Chrome device is unavailable');

function webEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value === 'string') env[key] = value;
  }
  env.BFF_INTERNAL_URL = 'http://127.0.0.1:4010';
  env.NEXT_DIST_DIR = '.next-e2e';
  return env;
}

export default defineConfig({
  testDir: 'e2e',
  testMatch: '**/*.spec.ts',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  workers: 1,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:3100',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...desktopChrome } }],
  webServer: [
    {
      command: 'node e2e/fixture-bff.mjs',
      url: 'http://127.0.0.1:4010/catalog/lobby',
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      // Binding only 127.0.0.1 makes next-intl rewrite /casino to an absolute
      // localhost URL, which redirects back and never returns 200. The browser
      // must use the same host or Next blocks the dev scripts and the page
      // never hydrates.
      command: 'pnpm exec next dev --port 3100',
      url: 'http://localhost:3100/casino',
      reuseExistingServer: false,
      timeout: 120_000,
      env: webEnv(),
    },
  ],
});
