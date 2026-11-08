import { createApi } from '../../server/api';
import { createGoogleLogin } from '../../server/sales-crm/auth/google/routes';
import { createGoogleProvider } from '../../server/sales-crm/auth/google/provider';
import { googleIssuer } from '../../server/sales-crm/auth/google/config';
import { openSalesIdentity } from '../../server/sales-crm/auth/store';
import { createSyntheticReporting } from '../../server/sales-crm/reporting/demo';
import { googleAuthApi, isSalesAuthEnabled } from '../../shared/sales-auth';
import { isSalesCrmEnabled } from '../../shared/sales-crm';
import { localPorts } from '../../shared/local-ports';
import { googleTestConfig, mockAdmin, mockGoogleTransport } from '../fixtures/google-oidc';

if (process.env.NODE_ENV !== 'test' || process.env.DIZZLE_E2E_GOOGLE !== 'true' ||
    !isSalesCrmEnabled(process.env) || !isSalesAuthEnabled(process.env)) {
  throw new Error('The mock Google browser server requires explicit test mode.');
}
const ports = localPorts(process.env);
const origin = 'http://127.0.0.1:' + ports.web;
const config = { ...googleTestConfig, origin, redirectUri: origin + googleAuthApi + '/callback' };
const mock = mockGoogleTransport(config);
const identity = openSalesIdentity(':memory:');
identity.bootstrapAdministrator('demo-o1', {
  name: 'Sample Google Admin', ...mockAdmin, issuer: googleIssuer, department: 'sales', team: null,
});
const reporting = await createSyntheticReporting({ path: ':memory:' });
const google = createGoogleLogin(config, createGoogleProvider(config, mock.transport));
const server = createApi(undefined, undefined, reporting, identity, { google, ports });
server.listen(ports.api, '127.0.0.1');
server.once('close', () => { reporting.db.close(); identity.close(); });
for (const signal of ['SIGTERM', 'SIGINT'] as const) process.on(signal, () => server.close());
