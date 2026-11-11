import { existsSync, readFileSync } from 'node:fs';
import { stagingPreflight } from '../server/publishing/staging-preflight';
const worker = readFileSync(new URL('./social-worker.ts', import.meta.url), 'utf8');
const reconcile = readFileSync(new URL('./social-reconcile.ts', import.meta.url), 'utf8');
const result = stagingPreflight(process.env, { nodeVersion: process.versions.node, checkoutEnvExists: existsSync('.env'),
  liveWorkerDisabled: /const LIVE_PUBLISHING_ENABLED = false;/.test(worker), liveReadsDisabled: /const LIVE_PROVIDER_READS_ENABLED = false;/.test(reconcile) });
console.log(JSON.stringify(result, null, 2));
if (!result.readyForPrivateTestStaging) process.exitCode = 1;
