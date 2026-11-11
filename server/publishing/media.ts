import { createHmac, timingSafeEqual } from 'node:crypto';
import { PublishingQueue } from './queue';
export function mediaUrl(origin: string, jobId: string, secret: string, now = Date.now()) {
  if (secret.length < 32) throw new Error('Private media signing key required.');
  const url = new URL(`/social-media/${jobId}.jpg`, origin);
  if (url.protocol !== 'https:') throw new Error('External HTTPS media origin required.');
  const expires = String(now + 3_600_000); const signature = createHmac('sha256', secret).update(jobId + ':' + expires).digest('hex');
  url.searchParams.set('expires', expires); url.searchParams.set('signature', signature); return url.href;
}
export function authorizedMedia(url: URL, queue: PublishingQueue, secret: string, now = Date.now()) {
  const match = /^\/social-media\/([a-f0-9-]+)\.jpg$/.exec(url.pathname); const expires = url.searchParams.get('expires') ?? ''; const signature = url.searchParams.get('signature') ?? '';
  if (!match || secret.length < 32 || !/^\d+$/.test(expires) || Number(expires) < now || Number(expires) > now + 3_600_000 || !/^[a-f0-9]{64}$/.test(signature)) return null;
  const expected = createHmac('sha256', secret).update(match[1] + ':' + expires).digest();
  if (!timingSafeEqual(expected, Buffer.from(signature, 'hex'))) return null;
  const job = queue.get(match[1]);
  return job.payload.account.platform === 'instagram' && job.payload.account.mode === 'live' && ['publishing', 'published', 'needs_review'].includes(job.state) ? queue.image(job.id) : null;
}
