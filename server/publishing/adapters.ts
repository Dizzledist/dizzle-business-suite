import type { PublishJob, SocialAccount } from '../../shared/publishing';

export class PublishingError extends Error {
  constructor(message: string, readonly uncertain = false) { super(message); }
}
export interface PublishAdapter {
  readonly mode: 'test' | 'live';
  publish(job: PublishJob, image: Buffer, checkpoint: (values: Record<string, string>) => void, beforePublish: () => Promise<void>): Promise<{ id: string; url?: string }>;
  reconcile(job: PublishJob): Promise<{ id: string; url?: string } | null>;
}
type Fetch = typeof fetch;
// Never retain provider response bodies in errors: they may contain credentials or private URLs.
async function request(transport: Fetch, url: string, token: string, init: RequestInit = {}, uncertain = false): Promise<any> {
  let response: Response;
  try { response = await transport(url, { ...init, headers: { Authorization: `Bearer ${token}`, ...init.headers }, redirect: 'error', signal: AbortSignal.timeout(20_000) }); }
  catch { throw new PublishingError('Provider request timed out or disconnected. Reconcile before retrying.', uncertain); }
  if (!response.ok) throw new PublishingError(`Provider rejected request (HTTP ${response.status}). Check account access, credits and media requirements.`, uncertain && response.status >= 500);
  try { const data = await response.json(); if (data.error || data.errors?.length) throw new Error(); return data; }
  catch { throw new PublishingError('Provider returned an unreadable outcome. Reconciliation is required.', uncertain); }
}
const json = (body: unknown): RequestInit => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
export class XAdapter implements PublishAdapter {
  readonly mode = 'live' as const;
  constructor(private token: () => Promise<string>, private transport: Fetch = fetch) {}
  async publish(job: PublishJob, image: Buffer, checkpoint: (v: Record<string, string>) => void, beforePublish: () => Promise<void>) {
    const token = await this.token();
    const identity = await request(this.transport, 'https://api.x.com/2/users/me', token);
    if (identity.data?.id !== job.payload.account.providerUserId || '@' + identity.data?.username !== job.payload.account.handle) throw new PublishingError('X account identity/handle changed. Reconnect and renew approval.', true);
    const uploaded = await request(this.transport, 'https://api.x.com/2/media/upload', token, json({ media: image.toString('base64'), media_category: 'tweet_image' }));
    const mediaId = uploaded.data?.id;
    if (!/^\d+$/.test(mediaId ?? '')) throw new PublishingError('X did not return a usable image ID.');
    checkpoint({ mediaId, mediaKey: uploaded.data.media_key ?? '' });
    // Checkpoint is durable BEFORE the only public write. No blind POST retry.
    await beforePublish();
    const posted = await request(this.transport, 'https://api.x.com/2/tweets', token, json({ text: job.payload.caption, made_with_ai: !!job.payload.aiGenerated, media: { media_ids: [mediaId] } }), true);
    if (!/^\d+$/.test(posted.data?.id ?? '')) throw new PublishingError('X post outcome is unknown.', true);
    checkpoint({ mediaId, mediaKey: uploaded.data.media_key ?? '', postId: posted.data.id });
    return { id: posted.data.id, url: `https://x.com/i/status/${posted.data.id}` };
  }
  async reconcile(job: PublishJob) {
    const token = await this.token();
    if (job.checkpoint.postId) return { id: job.checkpoint.postId, url: `https://x.com/i/status/${job.checkpoint.postId}` };
    if (!job.checkpoint.mediaKey || !job.startedAt) return null;
    const url = new URL(`https://api.x.com/2/users/${job.payload.account.providerUserId}/tweets`);
    url.searchParams.set('start_time', job.startedAt); url.searchParams.set('tweet.fields', 'attachments,created_at'); url.searchParams.set('max_results', '100');
    const data = await request(this.transport, url.href, token);
    const matches = (data.data ?? []).filter((post: any) => post.text === job.payload.caption && post.attachments?.media_keys?.includes(job.checkpoint.mediaKey));
    // A missing result or ambiguous result is NOT proof that no post was sent.
    return matches.length === 1 ? { id: matches[0].id, url: `https://x.com/i/status/${matches[0].id}` } : null;
  }
}
export class InstagramAdapter implements PublishAdapter {
  readonly mode = 'live' as const;
  constructor(private token: () => Promise<string>, private version: string,
    private stageImage: (job: PublishJob, image: Buffer) => Promise<string>, private transport: Fetch = fetch) {
    if (!/^v\d+\.\d+$/.test(version)) throw new Error('Set an explicitly reviewed Meta Graph API version.');
  }
  private base(id: string) { if (!/^\d+$/.test(id)) throw new PublishingError('Invalid Instagram identifier.'); return `https://graph.instagram.com/${this.version}/${id}`; }
  async publish(job: PublishJob, image: Buffer, checkpoint: (v: Record<string, string>) => void, beforePublish: () => Promise<void>) {
    const token = await this.token();
    const identity = await request(this.transport, `https://graph.instagram.com/${this.version}/me?fields=user_id,username`, token);
    const profile = identity.data?.[0] ?? identity.data ?? identity;
    if (profile.user_id !== job.payload.account.providerUserId || '@' + profile.username !== job.payload.account.handle) throw new PublishingError('Instagram account identity/handle changed. Reconnect and renew approval.', true);
    const imageUrl = new URL(await this.stageImage(job, image));
    if (imageUrl.protocol !== 'https:' || imageUrl.username || imageUrl.password || ['localhost', '127.0.0.1'].includes(imageUrl.hostname)) throw new PublishingError('Instagram requires an externally reachable HTTPS JPEG URL.');
    const created = await request(this.transport, this.base(job.payload.account.providerUserId) + '/media', token,
      { method: 'POST', body: new URLSearchParams({ image_url: imageUrl.href, caption: job.payload.caption, is_ai_generated: String(!!job.payload.aiGenerated) }) });
    if (!/^\d+$/.test(created.id ?? '')) throw new PublishingError('Instagram did not return a container ID.');
    checkpoint({ containerId: created.id });
    // Bounded polling. An unfinished container stays safely un-published, with no duplicate publish attempt.
    for (let i = 0; i < 8; i++) {
      checkpoint({ containerId: created.id });
      const status = await request(this.transport, this.base(created.id) + '?fields=status_code', token);
      if (status.status_code === 'FINISHED') {
        checkpoint({ containerId: created.id });
        await beforePublish();
        const result = await request(this.transport, this.base(job.payload.account.providerUserId) + '/media_publish', token,
          { method: 'POST', body: new URLSearchParams({ creation_id: created.id }) }, true);
        if (!/^\d+$/.test(result.id ?? '')) throw new PublishingError('Instagram publish outcome is unknown.', true);
        checkpoint({ containerId: created.id, postId: result.id });
        // A permalink lookup failure must never turn successful publication into a retryable failure.
        let url: string | undefined;
        try { const media = await request(this.transport, this.base(result.id) + '?fields=permalink', token); if (/^https:\/\/(www\.)?instagram\.com\//.test(media.permalink)) url = media.permalink; } catch { /* post ID remains authoritative */ }
        return { id: result.id, url };
      }
      if (['ERROR', 'EXPIRED'].includes(status.status_code)) throw new PublishingError('Instagram container failed or expired.');
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    throw new PublishingError('Instagram image processing did not finish. No publish call was made.');
  }
  async reconcile(job: PublishJob) {
    const token = await this.token();
    if (job.checkpoint.postId) return { id: job.checkpoint.postId };
    if (job.checkpoint.containerId) {
      const status = await request(this.transport, this.base(job.checkpoint.containerId) + '?fields=status_code', token);
      // PUBLISHED confirms container publication, but not the media ID/permalink. Keep operator review
      // rather than guessing from captions, which may be reused across posts.
      if (status.status_code === 'PUBLISHED') throw new PublishingError('Instagram confirms publication. Inspect the account and record its exact media URL; do not republish.', true);
    }
    return null;
  }
}
export class TestPublishingAdapter implements PublishAdapter {
  readonly mode = 'test' as const;
  calls: string[] = [];
  async publish(job: PublishJob, _image: Buffer, checkpoint: (v: Record<string, string>) => void, beforePublish: () => Promise<void>) {
    await beforePublish(); this.calls.push(job.id); checkpoint({ testReceipt: job.id }); return { id: `test-${job.id}`, url: 'https://example.invalid/test-post/' + job.id };
  }
  async reconcile(job: PublishJob) { return job.checkpoint.testReceipt ? { id: `test-${job.id}` } : null; }
}
export const testAccounts: SocialAccount[] = ['instagram', 'x'].map(platform => ({ id: 'test-cheddr-' + platform, brandId: 'cheddr', platform: platform as 'instagram' | 'x', providerUserId: '10001', handle: '@cheddr_test', mode: 'test', connected: true }));
