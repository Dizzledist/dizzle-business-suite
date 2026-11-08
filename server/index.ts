import { createApi } from './api';
import { loadZohoConfig } from './sales-crm/zoho/config';
import { createZohoConnection } from './sales-crm/zoho/connection';
import type { ZohoManagement } from './sales-crm/zoho/routes';
import { isSalesCrmEnabled } from '../shared/sales-crm';
import type { SyntheticReporting } from './sales-crm/reporting/demo';
import { isSalesAuthEnabled, isSalesPasswordEnabled } from '../shared/sales-auth';
import { localPorts } from '../shared/local-ports';
import type { PasswordAuth } from './sales-crm/auth/passwords';
import type { SalesIdentityStore } from './sales-crm/auth/store';

if (process.env.NODE_ENV === 'production') throw new Error('Local fixture API cannot run in production mode.');
process.env.NODE_ENV ??= 'development';
const ports = localPorts(process.env);
let zoho: ZohoManagement | undefined;
try {
  const config = loadZohoConfig(process.env);
  if (config) zoho = { config, connection: createZohoConnection(config) };
} catch {
  console.warn('Zoho integration disabled. Check the local Zoho configuration.');
}
let reporting: SyntheticReporting | undefined;
if (isSalesCrmEnabled(process.env)) {
  try {
    const { createSyntheticReporting } = await import('./sales-crm/reporting/demo');
    reporting = await createSyntheticReporting({
      path: process.env.NODE_ENV === 'test' ? ':memory:' : undefined,
      timeZone: process.env.SALES_REPORTING_TIME_ZONE,
    });
  } catch {
    console.warn('Synthetic Sales CRM reporting is unavailable. Check the reporting timezone and local database.');
  }
}
let salesIdentity: SalesIdentityStore | undefined;
if (isSalesCrmEnabled(process.env) && isSalesAuthEnabled(process.env)) {
  try {
    const { openSalesIdentity } = await import('./sales-crm/auth/store');
    salesIdentity = openSalesIdentity(process.env.NODE_ENV === 'test' ? ':memory:' : undefined);
  } catch {
    console.warn('Company sign-in is unavailable. Check the local identity database.');
  }
}
let passwords: PasswordAuth | undefined;
if (salesIdentity && isSalesPasswordEnabled(process.env)) {
  try {
    const { createPasswordAuth } = await import('./sales-crm/auth/passwords');
    passwords = await createPasswordAuth(salesIdentity);
  } catch {
    console.warn('Password sign-in is unavailable. Check the local authentication runtime.');
  }
}
const server = createApi(undefined, zoho, reporting, salesIdentity, { passwords, ports });
server.once('close', () => {
  reporting?.db.close();
  salesIdentity?.close();
});
server.listen(ports.api, '127.0.0.1', () => console.log('Dizzle fixture API: http://127.0.0.1:' + ports.api));
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => server.close(() => process.exit(0)));
