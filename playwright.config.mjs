// Playwright UI tests run against the offline local server (real Worker + DO code on Node).
import { defineConfig } from '@playwright/test';

const PORT = Number(process.env.UI_PORT || 8799);
const executablePath = process.env.PW_CHROMIUM_PATH || undefined;

export default defineConfig({
  testDir: 'tests/ui',
  timeout: 90_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    locale: 'vi-VN',
    colorScheme: 'dark',
    launchOptions: executablePath ? { executablePath } : {},
    trace: 'retain-on-failure',
  },
  webServer: {
    command: `node scripts/local-server.mjs --port ${PORT}`,
    url: `http://127.0.0.1:${PORT}/`,
    reuseExistingServer: !process.env.CI,
    timeout: 20_000,
  },
});
