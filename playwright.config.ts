import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/browser', workers: 1, fullyParallel: false,
  use: { baseURL: 'http://127.0.0.1:5273', trace: 'retain-on-failure' },
  webServer: [
    { command: 'npm run dev:api', url: 'http://127.0.0.1:3101/api/health', env: { LOCAL_API_PORT: '3101', LOCAL_WEB_PORT: '5273' }, reuseExistingServer: false, timeout: 60_000 },
    { command: 'npx vite --host 127.0.0.1 --port 5273 --strictPort', url: 'http://127.0.0.1:5273/api/health', env: { CI: 'true', LOCAL_API_PORT: '3101' }, reuseExistingServer: false, timeout: 60_000 },
  ],
});
