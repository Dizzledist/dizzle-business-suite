import { defineConfig } from '@playwright/test';
import { isSalesAuthEnabled, isSalesPasswordEnabled } from './shared/sales-auth';
import { localPorts } from './shared/local-ports';

const authFixtures = isSalesAuthEnabled(process.env) && !!process.env.DIZZLE_E2E_IDENTITY_DB;
const passwordFixtures = isSalesPasswordEnabled(process.env) && process.env.DIZZLE_E2E_PASSWORD === 'true';
const { web, api } = localPorts(process.env);
const webOrigin = 'http://127.0.0.1:' + web;
export default defineConfig({
  testDir: './tests/browser', workers: 1, fullyParallel: false,
  use: { baseURL: webOrigin, trace: 'retain-on-failure' },
  webServer: [
    {
      command: passwordFixtures ? 'node --import tsx tests/browser/password-server.ts'
        : authFixtures ? 'node --import tsx tests/browser/auth-server.ts' : 'npm run dev:api',
      url: 'http://127.0.0.1:' + api + '/api/health', env: { NODE_ENV: 'test' },
      reuseExistingServer: false, timeout: 60_000,
    },
    { command: 'npm run dev:web', url: webOrigin + '/api/health', env: { CI: 'true' }, reuseExistingServer: false, timeout: 60_000 },
  ],
});
