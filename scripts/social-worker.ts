import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { join } from 'node:path';
import { publishingStorage } from '../server/publishing/storage';
import { PublishingQueue } from '../server/publishing/queue';
import { SinglePostPilot } from '../server/publishing/pilot-control';
import { workerAuthority } from '../server/publishing/worker-authority';
import { PublishingWorker } from '../server/publishing/worker';
import { InstagramAdapter, XAdapter, TestPublishingAdapter } from '../server/publishing/adapters';
import { SocialAccountVault } from '../server/publishing/accounts';
import { mediaUrl } from '../server/publishing/media';
if (existsSync('.env')) { if (process.env.NODE_ENV === 'production' || process.env.DIZZLE_AUTH_MODE === 'employee') throw new Error('Hosted workers never load checkout .env.'); loadEnvFile('.env'); }
const directory = publishingStorage().directory;
const queue = new PublishingQueue(join(directory, 'publishing.sqlite')), vault = new SocialAccountVault(directory);
// Deliberately hard-off for this PR. A later explicit test-post authorization must change this gate.
const LIVE_PUBLISHING_ENABLED = false;
const pilot = new SinglePostPilot(join(directory, 'pilot-control.sqlite'));
const authority = workerAuthority();
const worker = new PublishingWorker(queue, account => account.mode === 'test' ? new TestPublishingAdapter() : account.platform === 'x' ? new XAdapter(() => vault.token(account)) : new InstagramAdapter(() => vault.token(account), process.env.META_GRAPH_VERSION ?? '', async job => mediaUrl(process.env.SOCIAL_MEDIA_ORIGIN ?? '', job.id, process.env.SOCIAL_MEDIA_SIGNING_KEY ?? '')), undefined, LIVE_PUBLISHING_ENABLED, pilot.controls(job => authority.authorize(job)));
let stopped = false;
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => { stopped = true; });
console.log('Publishing worker started. Live publishing OFF; selected test pilot job only; current API authority required.');
while (!stopped) { try { await worker.tick(); } catch { console.error('Worker tick failed. Inspect queue; no automatic resend.'); } if (process.argv.includes('--once')) break; await new Promise(resolve => setTimeout(resolve, 1000)); }
pilot.close(); queue.close();
