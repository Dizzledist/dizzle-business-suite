import { createApi } from './api';
import { loadZohoConfig } from './sales-crm/zoho/config';
import { createZohoConnection } from './sales-crm/zoho/connection';
import type { ZohoManagement } from './sales-crm/zoho/routes';
import { isSalesCrmEnabled } from '../shared/sales-crm';
import type { SyntheticReporting } from './sales-crm/reporting/demo';

if (process.env.NODE_ENV === 'production') throw new Error('Local fixture API cannot run in production mode.');
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
const server = createApi(undefined, zoho, reporting);
server.once('close', () => reporting?.db.close());
server.listen(3001, '127.0.0.1', () => console.log('Dizzle fixture API: http://127.0.0.1:3001'));
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => server.close(() => process.exit(0)));
