import { IdentityStore } from './auth/store';
import { GoogleWorkspaceOidc } from './auth/google';
import { createSharedAuthApi } from './auth/api';
const required = (name: string) => { const value = process.env[name]; if (!value) throw new Error('Configure ' + name + ' privately.'); return value; };
const port = Number(process.env.SHARED_AUTH_PORT ?? 3443); if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid auth port.');
const origin = required('AUTH_PUBLIC_ORIGIN'), store = new IdentityStore(required('SHARED_IDENTITY_DB'));
const google = new GoogleWorkspaceOidc(required('GOOGLE_CLIENT_ID'), required('GOOGLE_CLIENT_SECRET'), origin + '/api/auth/google/callback', required('GOOGLE_WORKSPACE_DOMAIN'));
// Auth module host only. Publishing resolver deliberately absent until PR #5 adopts the shared
// contracts; its worker receives 503 and holds the job instead of trusting unverified payloads.
const server = createSharedAuthApi({ store, google, origin, organizationId: required('DIZZLE_ORGANIZATION_ID'), workerOrigin: `http://127.0.0.1:${port}` });
server.listen(port, '127.0.0.1', () => console.log('Shared identity module listening privately; live publishing unavailable.'));
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => server.close(() => { store.close(); process.exit(0); }));
