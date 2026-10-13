import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/browser',
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:4325', browserName: 'chromium', channel: 'chromium' },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 4325',
    url: 'http://127.0.0.1:4325',
    reuseExistingServer: false,
  },
});
