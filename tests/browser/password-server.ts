import { createApi } from '../../server/api';
import { createPasswordAuth } from '../../server/sales-crm/auth/passwords';
import { openSalesIdentity } from '../../server/sales-crm/auth/store';
import { createSyntheticReporting } from '../../server/sales-crm/reporting/demo';
import { isSalesPasswordEnabled } from '../../shared/sales-auth';
import { isSalesCrmEnabled } from '../../shared/sales-crm';
import { localPorts } from '../../shared/local-ports';
import { samplePassword, samplePasswordEmail } from '../fixtures/password-browser';

if (process.env.NODE_ENV !== 'test' || process.env.DIZZLE_E2E_PASSWORD !== 'true' ||
    !isSalesCrmEnabled(process.env) || !isSalesPasswordEnabled(process.env)) {
  throw new Error('The password browser server requires explicit synthetic test mode.');
}
const ports = localPorts(process.env);
const identity = openSalesIdentity(':memory:');
const passwords = await createPasswordAuth(identity);
const setup = identity.bootstrapPasswordAdministrator('demo-o1', {
  name: 'Sample Password Admin', email: samplePasswordEmail, department: 'sales', team: null,
});
await passwords.redeem(samplePasswordEmail, setup.code, samplePassword);
const reporting = await createSyntheticReporting({ path: ':memory:' });
const server = createApi(undefined, undefined, reporting, identity, { ports, passwords });
server.listen(ports.api, '127.0.0.1');
server.once('close', () => { reporting.db.close(); identity.close(); });
for (const signal of ['SIGTERM', 'SIGINT'] as const) process.on(signal, () => server.close());
