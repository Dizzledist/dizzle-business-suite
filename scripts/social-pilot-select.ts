import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { userInfo } from 'node:os';
import { join } from 'node:path';
import { publishingStorage } from '../server/publishing/storage';
import { PublishingQueue } from '../server/publishing/queue';
import { SinglePostPilot } from '../server/publishing/pilot-control';
import { workerAuthority } from '../server/publishing/worker-authority';
if (existsSync('.env')) { if (process.env.NODE_ENV === 'production' || process.env.DIZZLE_AUTH_MODE === 'employee') throw new Error('Hosted workers never load checkout .env.'); loadEnvFile('.env'); }
const [jobId, accountId] = process.argv.slice(2);
if (!jobId || !/^[1-9]\d*$/.test(accountId ?? '')) throw new Error('Usage: npm run social:pilot:select -- <approved-job-id> <verified-numeric-X-account-id>');
const directory = publishingStorage().directory, queue = new PublishingQueue(join(directory, 'publishing.sqlite')), pilot = new SinglePostPilot(join(directory, 'pilot-control.sqlite'));
try {
  const job = queue.get(jobId); await workerAuthority().authorize(job);
  pilot.select(job, accountId, 'operator:' + userInfo().username, new Date().toISOString());
  console.log(JSON.stringify({ selectedJobId: job.id, accountId, handle: '@cheddrco_', livePublishingEnabled: false, note: 'Selected once; this does not enable live publishing. Consumption cannot be reset or reassigned.' }));
} catch { console.error('Pilot selection refused. Verify current approval, publishing permission, connected numeric X identity and unused pilot slot. Live publishing stays OFF.'); process.exitCode = 1; }
finally { pilot.close(); queue.close(); }
