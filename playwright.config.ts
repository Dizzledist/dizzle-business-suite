import { defineConfig } from '@playwright/test';
import { isSalesAuthEnabled } from './shared/sales-auth';

const authFixtures = isSalesAuthEnabled(process.env) && !!process.env.DIZZLE_E2E_IDENTITY_DB;
export default defineConfig({
  testDir: './tests/browser', workers: 1, fullyParallel: false,
  use: { baseURL: 'http://127.0.0.1:5173', trace: 'retain-on-failure' },
  webServer: [
    {
      command: authFixtures ? 'node --import tsx tests/browser/auth-server.ts' : 'npm run dev:api',
      url: 'http://127.0.0.1:3001/api/health', env: { NODE_ENV: 'test' },
      reuseExistingServer: false, timeout: 60_000,
    },
    { command: 'npm run dev:web', url: 'http://127.0.0.1:5173/api/health', env: { CI: 'true' }, reuseExistingServer: false, timeout: 60_000 },
  ],
});
