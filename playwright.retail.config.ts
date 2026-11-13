import { defineConfig } from '@playwright/test';
const env = { NODE_ENV: 'test', DIZZLE_WEB_PORT: '5375', DIZZLE_API_PORT: '3203', CI: 'true' };
export default defineConfig({ testDir: './tests/browser', testMatch: 'retail.spec.ts', workers: 1,
  use: { baseURL: 'http://127.0.0.1:5375', trace: 'retain-on-failure' },
  webServer: [
    { command: 'npx tsx tests/browser/retail-session-server.ts', env, url: 'http://127.0.0.1:3203/api/auth/mode', reuseExistingServer: false },
    { command: 'npx vite --host 127.0.0.1 --port 5375 --strictPort', env, url: 'http://127.0.0.1:5375/api/auth/mode', reuseExistingServer: false },
  ],
});
