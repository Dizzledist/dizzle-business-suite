import { createApi } from './api';
import { loadZohoConfig } from './sales-crm/zoho/config';
import { createZohoConnection } from './sales-crm/zoho/connection';
import type { ZohoManagement } from './sales-crm/zoho/routes';

if (process.env.NODE_ENV === 'production') throw new Error('Local fixture API cannot run in production mode.');
let zoho: ZohoManagement | undefined;
try {
  const config = loadZohoConfig(process.env);
  if (config) zoho = { config, connection: createZohoConnection(config) };
} catch {
  console.warn('Zoho integration disabled. Check the local Zoho configuration.');
}
const server = createApi(undefined, zoho);
server.listen(3001, '127.0.0.1', () => console.log('Dizzle fixture API: http://127.0.0.1:3001'));
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => server.close(() => process.exit(0)));
