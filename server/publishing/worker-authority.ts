import { readFileSync } from 'node:fs';
import type { PublishJob } from '../../shared/publishing';
import { localPorts } from '../../shared/local-ports';
import { SharedWorkerAuthorization } from '../auth/worker-client';
import { privateIdentityPath } from '../auth/store';
import { isSessionToken } from '../auth/sessions';
import { LoopbackPublishingAuthorization, publishingFingerprint } from './authorization';
export function workerAuthority(env: NodeJS.ProcessEnv = process.env) {
  if (env.DIZZLE_AUTH_MODE === 'employee' || env.AUTH_PUBLIC_ORIGIN || env.NODE_ENV === 'production' || env.SOCIAL_WORKER_TOKEN_FILE) {
    const file = env.SOCIAL_WORKER_TOKEN_FILE;
    if (!file) throw new Error('Configure private SOCIAL_WORKER_TOKEN_FILE. No fixture fallback.');
    const port = Number(env.SHARED_AUTH_PORT ?? 3443);
    if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid private authority port.');
    const authorize = async (job: PublishJob) => {
      const token = readFileSync(privateIdentityPath(file), 'utf8').trim();
      if (!isSessionToken(token)) throw new Error('Worker credential unavailable.');
      await new SharedWorkerAuthorization(`http://127.0.0.1:${port}`, token).authorize(job.id, publishingFingerprint(job));
    };
    return { authorize };
  }
  if (env.NODE_ENV && !['development', 'test'].includes(env.NODE_ENV)) throw new Error('Fixture worker authority is local-only.');
  return new LoopbackPublishingAuthorization(localPorts(env).api);
}
