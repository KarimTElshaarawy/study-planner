import { defineConfig, devices } from '@playwright/test';

const PORT = 4020;

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: { baseURL: `http://localhost:${PORT}`, ...devices['Pixel 7'], colorScheme: 'light' },
  webServer: {
    command: 'sh -c "rm -rf test-results/e2e && npm run build --silent && node --import tsx server/index.ts"',
    url: `http://localhost:${PORT}/api/health`,
    timeout: 120_000,
    reuseExistingServer: false,
    env: {
      PORT: String(PORT),
      NODE_ENV: 'production',
      APP_PASSWORD: 'e2e-password',
      DATA_DIR: 'test-results/e2e/data',
      OUTBOX_DIR: 'test-results/e2e/outbox',
      RESEND_API_KEY: '',
      SMTP_HOST: '',
      FAKE_NOW: '2026-10-26T03:30:00Z',
    },
  },
});
