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
    baseURL: 'http://127.0.0.1:3100',
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
      command: 'pnpm exec next dev --hostname 127.0.0.1 --port 3100',
      url: 'http://127.0.0.1:3100/en/casino',
      reuseExistingServer: false,
      timeout: 120_000,
      env: webEnv(),
    },
  ],
});
