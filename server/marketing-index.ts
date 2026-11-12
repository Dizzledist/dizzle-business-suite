import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { createApi } from './api';
import { IdentityStore } from './auth/store';
import { GoogleWorkspaceOidc } from './auth/google';
import { publishingStorage } from './publishing/storage';
import { PublishingQueue } from './publishing/queue';
import { SocialAccountVault } from './publishing/accounts';
const required = (name: string) => { const value = process.env[name]; if (!value) throw new Error('Configure ' + name + ' privately.'); return value; };
if (existsSync('.env')) throw new Error('Hosted Marketing never loads checkout .env. Inject the private service environment.');
required('DIZZLE_MARKETING_DIR'); required('DIZZLE_PUBLISHING_DIR');
const origin = required('AUTH_PUBLIC_ORIGIN'), organizationId = required('DIZZLE_ORGANIZATION_ID');
const port = Number(process.env.SHARED_AUTH_PORT ?? 3443);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid auth/API port.');
const identity = new IdentityStore(required('SHARED_IDENTITY_DB'));
const google = new GoogleWorkspaceOidc(required('GOOGLE_CLIENT_ID'), required('GOOGLE_CLIENT_SECRET'), origin + '/api/auth/google/callback', required('GOOGLE_WORKSPACE_DOMAIN'));
const { store, directory } = publishingStorage(), vault = new SocialAccountVault(directory);
const accounts = vault.accounts(); // No implicit test destinations or fixture records on hosted startup.
const server = createApi(undefined, { store, accounts, resolveAccount: id => vault.accounts().find(account => account.id === id) ?? null,
  publishingQueue: new PublishingQueue(join(directory, 'publishing.sqlite')),
  authentication: { store: identity, google, origin, organizationId, workerOrigin: `http://127.0.0.1:${port}` } });
server.listen(port, '127.0.0.1', () => console.log('Private session-authenticated Marketing API; live publishing OFF.'));
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => server.close(() => { identity.close(); process.exit(0); }));
