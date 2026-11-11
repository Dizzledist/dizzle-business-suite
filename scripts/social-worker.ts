import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { join } from 'node:path';
import { publishingStorage } from '../server/publishing/storage';
import { PublishingQueue } from '../server/publishing/queue';
import { PublishingWorker } from '../server/publishing/worker';
import { InstagramAdapter, XAdapter, TestPublishingAdapter } from '../server/publishing/adapters';
import { SocialAccountVault } from '../server/publishing/accounts';
import { mediaUrl } from '../server/publishing/media';
if (existsSync('.env')) loadEnvFile('.env');
const directory = publishingStorage().directory;
const queue = new PublishingQueue(join(directory, 'publishing.sqlite')), vault = new SocialAccountVault(directory);
// Deliberately hard-off for this PR. A later explicit test-post authorization must change this gate.
const LIVE_PUBLISHING_ENABLED = false;
const worker = new PublishingWorker(queue, account => account.mode === 'test' ? new TestPublishingAdapter() : account.platform === 'x' ? new XAdapter(() => vault.token(account)) : new InstagramAdapter(() => vault.token(account), process.env.META_GRAPH_VERSION ?? '', async job => mediaUrl(process.env.SOCIAL_MEDIA_ORIGIN ?? '', job.id, process.env.SOCIAL_MEDIA_SIGNING_KEY ?? '')), undefined, LIVE_PUBLISHING_ENABLED);
let stopped = false;
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => { stopped = true; });
console.log('Publishing worker started. Live publishing OFF; test destinations only.');
while (!stopped) { try { await worker.tick(); } catch { console.error('Worker tick failed. Inspect queue; no automatic resend.'); } if (process.argv.includes('--once')) break; await new Promise(resolve => setTimeout(resolve, 1000)); }
queue.close();
