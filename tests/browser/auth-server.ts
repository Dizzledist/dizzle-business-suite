import { existsSync } from 'node:fs';
import { createApi } from '../../server/api';
import { isSalesAuthEnabled } from '../../shared/sales-auth';
import { isSalesCrmEnabled } from '../../shared/sales-crm';
import { requireE2eIdentityPath, salesAuthFixture } from '../fixtures/sales-auth';

if (process.env.NODE_ENV !== 'test' || !isSalesAuthEnabled(process.env) || !isSalesCrmEnabled(process.env)) {
  throw new Error('The synthetic authentication server requires explicit test mode.');
}
const path = requireE2eIdentityPath(process.env.DIZZLE_E2E_IDENTITY_DB);
if (existsSync(path)) throw new Error('Use a fresh synthetic identity database.');
const fixture = await salesAuthFixture({ path, now: Date.now });
const server = createApi(undefined, undefined, fixture.reporting, fixture.store);
server.listen(3001, '127.0.0.1');
server.once('close', () => fixture.close());
for (const signal of ['SIGTERM', 'SIGINT'] as const) process.on(signal, () => server.close());
