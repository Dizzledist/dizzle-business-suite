import { defineConfig } from '@playwright/test';
const env = { DIZZLE_WEB_PORT: '5373', DIZZLE_API_PORT: '3201', CI: 'true' };
export default defineConfig({
  testDir: './tests/browser', testIgnore: 'signin.spec.ts', workers: 1, fullyParallel: false,
  use: { baseURL: 'http://127.0.0.1:5373', trace: 'retain-on-failure' },
  webServer: [
    { command: 'npx tsx tests/browser/fixture-server.ts', env, url: 'http://127.0.0.1:3201/api/health', reuseExistingServer: false, timeout: 60_000 },
    { command: 'npx vite --host 127.0.0.1 --port 5373 --strictPort', url: 'http://127.0.0.1:5373/api/health', env, reuseExistingServer: false, timeout: 60_000 },
  ],
});
