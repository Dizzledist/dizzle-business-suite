import { defineConfig } from '@playwright/test';
const env = { DIZZLE_WEB_PORT: '5374', DIZZLE_API_PORT: '3202', NODE_ENV: 'test', CI: 'true' };
export default defineConfig({
  testDir: './tests/browser', testMatch: 'signin.spec.ts', workers: 1,
  use: { baseURL: 'http://127.0.0.1:5374', trace: 'retain-on-failure' },
  webServer: [
    { command: 'npx tsx tests/browser/session-server.ts', env, url: 'http://127.0.0.1:3202/api/auth/mode', reuseExistingServer: false, timeout: 60_000 },
    { command: 'npx vite --host 127.0.0.1 --port 5374 --strictPort', env, url: 'http://127.0.0.1:5374/api/auth/mode', reuseExistingServer: false, timeout: 60_000 },
  ],
});
