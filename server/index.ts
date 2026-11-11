import { createApi } from './api';
import { localPorts } from '../shared/local-ports';
import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { SocialAccountVault } from './publishing/accounts';
import { testAccounts } from './publishing/adapters';
import { PublishingQueue } from './publishing/queue';
import { join } from 'node:path';
import { publishingStorage } from './publishing/storage';
if (existsSync('.env')) loadEnvFile('.env');
const { api } = localPorts(process.env);

if (process.env.NODE_ENV === 'production') throw new Error('Local fixture API cannot run in production mode.');
const { store, directory: publishingDirectory } = publishingStorage();
const accounts = [...testAccounts, ...new SocialAccountVault(publishingDirectory).accounts()];
const server = createApi(undefined, { store, publishingQueue: new PublishingQueue(join(publishingDirectory, 'publishing.sqlite')), accounts });
server.listen(api, '127.0.0.1', () => console.log(`Dizzle fixture API: http://127.0.0.1:${api}`));
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => server.close(() => process.exit(0)));
