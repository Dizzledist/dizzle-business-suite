import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/browser', workers: 1, fullyParallel: false,
  use: { baseURL: 'http://127.0.0.1:5173', trace: 'retain-on-failure' },
  webServer: [
    {
      command: 'npm run dev:api', url: 'http://127.0.0.1:3001/api/health', env: { NODE_ENV: 'test' },
      reuseExistingServer: false, timeout: 60_000,
    },
    { command: 'npm run dev:web', url: 'http://127.0.0.1:5173/api/health', env: { CI: 'true' }, reuseExistingServer: false, timeout: 60_000 },
  ],
});
