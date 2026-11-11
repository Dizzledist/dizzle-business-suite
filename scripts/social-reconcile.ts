import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { join } from 'node:path';
import { MarketingStore } from '../server/marketing-store';
import { PublishingQueue } from '../server/publishing/queue';
import { PublishingWorker } from '../server/publishing/worker';
import { TestPublishingAdapter, InstagramAdapter, XAdapter } from '../server/publishing/adapters';
import { SocialAccountVault } from '../server/publishing/accounts';
if (existsSync('.env')) loadEnvFile('.env');
const directory = process.env.DIZZLE_PUBLISHING_DIR ?? new MarketingStore().directory;
const queue = new PublishingQueue(join(directory, 'publishing.sqlite')), vault = new SocialAccountVault(directory);
// Live reads, like live writes, await explicit account/test authorization. No public create calls here.
const LIVE_PROVIDER_READS_ENABLED = false;
const worker = new PublishingWorker(queue, account => account.mode === 'test' ? new TestPublishingAdapter() : account.platform === 'x' ? new XAdapter(() => vault.token(account)) : new InstagramAdapter(() => vault.token(account), process.env.META_GRAPH_VERSION ?? '', async () => { throw new Error('Reconciliation cannot stage or publish media.'); }), undefined, LIVE_PROVIDER_READS_ENABLED);
try { const result = await worker.reconcile(process.argv[2]); console.log(JSON.stringify({ id: result.id, state: result.state, providerId: result.providerId, url: result.url })); }
catch { console.error('Reconciliation unavailable or inconclusive. Inspect the account; do not retry the post. Live provider reads remain OFF.'); process.exitCode = 1; }
finally { queue.close(); }
