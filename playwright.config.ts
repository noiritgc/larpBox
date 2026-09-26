import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.E2E_PORT ?? 4173);
const BASE_URL = `http://127.0.0.1:${PORT}`;

/**
 * End-to-end tests run the real production build: one Node process serving the SPA, the API and
 * Socket.IO. GAME_TIME_SCALE=0.2 (test + loopback only) makes every timed phase five times faster.
 * Set E2E_SKIP_BUILD=1 to reuse an existing build.
 */
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 300_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: Number(process.env.E2E_WORKERS ?? 2),
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: process.env.E2E_SKIP_BUILD ? 'node apps/server/dist/index.js' : 'npm run build && node apps/server/dist/index.js',
    url: `${BASE_URL}/api/health`,
    reuseExistingServer: false,
    timeout: 300_000,
    stdout: 'ignore',
    stderr: 'pipe',
    env: {
      NODE_ENV: 'test',
      HOST: '127.0.0.1',
      PORT: String(PORT),
      PUBLIC_ORIGIN: BASE_URL,
      ALLOWED_ORIGINS: BASE_URL,
      GAME_TIME_SCALE: '0.2',
      RATE_LIMIT_MULTIPLIER: '50',
      LOG_LEVEL: 'warn',
    },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
