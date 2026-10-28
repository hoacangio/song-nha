// Playwright UI tests run against the offline local server (real Worker + DO code on Node).
import { defineConfig } from '@playwright/test';

const PORT = Number(process.env.UI_PORT || 8799);
const executablePath = process.env.PW_CHROMIUM_PATH || undefined;

export default defineConfig({
  testDir: 'tests/ui',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  // On CI the `github` reporter turns each failure into an annotation on the run (readable via the API).
  reporter: process.env.CI ? [['list'], ['github']] : [['list']],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    locale: 'vi-VN',
    colorScheme: 'dark',
    launchOptions: executablePath ? { executablePath } : {},
    trace: 'retain-on-failure',
    // A missing button should fail in seconds, not wait for the whole test timeout.
    actionTimeout: 15_000,
    navigationTimeout: 15_000,
  },
  webServer: {
    command: `node scripts/local-server.mjs --port ${PORT}`,
    url: `http://127.0.0.1:${PORT}/`,
    reuseExistingServer: !process.env.CI,
    stdout: 'pipe',
    stderr: 'pipe',
    timeout: 20_000,
  },
});
