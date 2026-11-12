import { createHash } from 'node:crypto';
import type { Identity } from '../../shared/contracts';
import type { PublishJob, SocialAccount } from '../../shared/publishing';
import { PublishingError } from './adapters';

export class PublishingHold extends PublishingError {
  constructor(message: string) { super(message, true); }
}
function canonical(value: any): any {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  return value;
}
export function publishingFingerprint(job: PublishJob) {
  return createHash('sha256').update(JSON.stringify(canonical({ jobId: job.id, payload: job.payload }))).digest('hex');
}
export function assertPublishingAuthority(job: PublishJob, employee: Identity | null, account: SocialAccount | null) {
  if (!employee || employee.id !== job.payload.approvedBy || !employee.active || !employee.read || employee.organizationId !== job.payload.organizationId ||
    !employee.marketingGrants.includes('asset:publish') || !employee.marketingGrants.includes('asset:review'))
    throw new PublishingHold('Approving employee no longer has publishing/review permission. Hold for renewed review.');
  const approved = job.payload.account;
  if (!account || !account.connected || account.id !== approved.id || account.brandId !== approved.brandId || account.platform !== approved.platform ||
    account.mode !== approved.mode || account.providerUserId !== approved.providerUserId || account.handle !== approved.handle)
    throw new PublishingHold('Connected account no longer matches the approved destination. Hold for renewed review.');
}
export interface PublishingControls {
  authorize(job: PublishJob): Promise<void>;
  reserve(job: PublishJob): void;
  validate(job: PublishJob): void;
}
export const denyPublishingControls: PublishingControls = {
  async authorize() { throw new PublishingHold('Fresh execution authorization is unavailable. No post was sent.'); },
  reserve() { throw new PublishingHold('No selected pilot job.'); }, validate() { throw new PublishingHold('No selected pilot job.'); },
};
// Reuses the API's existing server-owned identity/grant checks; never caches a decision or
// accepts roles from the worker. Production must replace the fixture identity transport.
export class LoopbackPublishingAuthorization {
  constructor(private port: number, private transport: typeof fetch = fetch) {
    if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Valid local authority port required.');
  }
  async authorize(job: PublishJob) {
    const fingerprint = publishingFingerprint(job);
    try {
      const response = await this.transport(`http://127.0.0.1:${this.port}/api/marketing/publishing-jobs/${job.id}/authorize`, {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(5000), headers: { 'X-Demo-Identity': job.payload.approvedBy, 'Content-Type': 'application/json' }, body: JSON.stringify({ fingerprint }),
      });
      if (!response.ok || (await response.json()).fingerprint !== fingerprint) throw new Error();
    } catch { throw new PublishingHold('Current publishing authority or approved destination could not be confirmed. Hold for review; no blind retry.'); }
  }
}
