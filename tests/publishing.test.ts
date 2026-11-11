import { describe, it, expect, vi } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { PublishingQueue } from '../server/publishing/queue';
import { PublishingWorker } from '../server/publishing/worker';
import { PublishingError, TestPublishingAdapter, testAccounts, XAdapter, InstagramAdapter } from '../server/publishing/adapters';
import { SocialAccountVault } from '../server/publishing/accounts';
import { authorizedMedia, mediaUrl } from '../server/publishing/media';
import { oauthStart, consumeOAuthState } from '../server/publishing/oauth';
import { Workflow } from '../server/workflow';
import { MarketingService } from '../server/marketing';
import { TestImageGenerator } from './fixtures/image-generator';
import { TestCaptionDrafter, OpenAICaptionDrafter } from '../server/publishing/drafts';
import type { PublishPayload } from '../shared/publishing';
const now = '2026-11-12T20:00:00.000Z', image = Buffer.from('test-image');
const payload = (overrides: Partial<PublishPayload> = {}): PublishPayload => ({ contentId: crypto.randomUUID(), organizationId: 'demo-o1', account: testAccounts[0], caption: 'Approved caption', publishAt: now, versionId: 'v1', imageHash: createHash('sha256').update(image).digest('hex'), approvalSnapshot: 'exact-approved-snapshot', approvedBy: 'owner', approvedAt: '2026-11-11T20:00:00.000Z', ...overrides });
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('durable approved publishing queue', () => {
  it('publishes a persisted test job in a separate worker process with no API or browser running', () => {
    const dir = mkdtempSync(join(tmpdir(), 'dizzle-worker-')); let queue: PublishingQueue | undefined;
    try {
      queue = new PublishingQueue(join(dir, 'publishing.sqlite'));
      const job = queue.enqueue(payload({ publishAt: '2020-01-01T00:00:00.000Z' }), image, now); queue.close(); queue = undefined;
      const child = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/social-worker.ts', '--once'], { env: { ...process.env, DIZZLE_PUBLISHING_DIR: dir }, encoding: 'utf8', timeout: 15_000 });
      expect(child.status).toBe(0); queue = new PublishingQueue(join(dir, 'publishing.sqlite')); expect(queue.get(job.id).state).toBe('published');
    } finally { queue?.close(); rmSync(dir, { recursive: true, force: true }); }
  });
  it('waits for simulated time, survives restart, and only one of two workers sends', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'dizzle-publish-')); let a: PublishingQueue | undefined, b: PublishingQueue | undefined;
    try {
      a = new PublishingQueue(join(dir, 'queue.sqlite')); const p = payload(); const job = a.enqueue(p, image, now);
      expect(a.enqueue(p, image, now).id).toBe(job.id); a.close();
      a = new PublishingQueue(join(dir, 'queue.sqlite')); b = new PublishingQueue(join(dir, 'queue.sqlite'));
      const adapter = new TestPublishingAdapter(); let clock = '2026-11-12T19:59:59.000Z';
      const workerA = new PublishingWorker(a, () => adapter, () => clock), workerB = new PublishingWorker(b, () => adapter, () => clock);
      expect(await workerA.tick()).toBe(false); clock = now;
      await Promise.all([workerA.tick(), workerB.tick()]);
      expect(adapter.calls).toEqual([job.id]); expect(b.get(job.id).state).toBe('published');
      expect(b.image(job.id)).toEqual(image);
    } finally { a?.close(); b?.close(); rmSync(dir, { recursive: true, force: true }); }
  });
  it('keeps live destinations queued while the publishing switch is off', async () => {
    const q = new PublishingQueue(), adapter = new TestPublishingAdapter();
    try { const job = q.enqueue(payload({ account: { ...testAccounts[0], mode: 'live' } }), image, now); expect(await new PublishingWorker(q, () => adapter, () => now).tick()).toBe(false); expect(q.get(job.id).state).toBe('scheduled'); expect(adapter.calls).toHaveLength(0); } finally { q.close(); }
  });
  it('holds uncertain writes, reconciles positively, and never blindly retries', async () => {
    const q = new PublishingQueue();
    try {
      const adapter = new TestPublishingAdapter(); adapter.publish = async (job, _image, checkpoint) => { adapter.calls.push(job.id); checkpoint({ testReceipt: job.id }); throw new PublishingError('Timed out', true); };
      const job = q.enqueue(payload(), image, now), worker = new PublishingWorker(q, () => adapter, () => now);
      await worker.tick(); expect(q.get(job.id).state).toBe('needs_review'); expect(await worker.tick()).toBe(false);
      expect(() => q.cancel(job.id, 'marketing')).toThrow(); expect(() => q.manual(job.id, 'marketing', 'https://www.instagram.com/p/one/', now)).toThrow();
      expect((await worker.reconcile(job.id)).state).toBe('published'); expect(adapter.calls).toHaveLength(1);
    } finally { q.close(); }
  });
  it('recovers an expired claimed job into review instead of giving it to another worker', () => {
    const q = new PublishingQueue(); try { const job = q.enqueue(payload(), image, now); expect(q.claim(now, false)?.job.id).toBe(job.id); expect(q.claim('2026-11-12T20:03:00.000Z', false)).toBeNull(); expect(q.get(job.id).state).toBe('needs_review'); expect(() => q.blockEdit(job.payload.contentId)).toThrow(); } finally { q.close(); }
  });
  it('cancels queued work, tracks manual evidence, and cannot claim it afterward', () => {
    const q = new PublishingQueue(); try { const job = q.enqueue(payload(), image, now); q.cancel(job.id, 'marketing'); expect(q.claim(now, false)).toBeNull(); q.manual(job.id, 'marketing', 'https://www.instagram.com/p/manual/', now); expect(q.get(job.id)).toMatchObject({ state: 'published', manual: true, postedBy: 'marketing' }); } finally { q.close(); }
  });
  it('rejects missing approval and mismatched approved image bytes', () => {
    const q = new PublishingQueue(); try { expect(() => q.enqueue(payload({ approvedBy: '' }), image, now)).toThrow(); expect(() => q.enqueue(payload(), Buffer.from('different'), now)).toThrow(); } finally { q.close(); }
  });
});
describe('fixed-host provider adapters', () => {
  it('stops before media upload if the authorized account handle changes', async () => {
    const q = new PublishingQueue(); try {
      const transport = vi.fn().mockResolvedValue(response({ data: { id: '10001', username: 'renamed_account' } }));
      const adapter = new XAdapter(async () => 'private', transport);
      await expect(adapter.publish(q.enqueue(payload({ account: testAccounts[1] }), image, now), image, () => {})).rejects.toThrow('identity/handle changed');
      expect(transport).toHaveBeenCalledTimes(1);
    } finally { q.close(); }
  });
  it('uploads X image bytes before creating exactly one image post and saves both receipts', async () => {
    const transport = vi.fn().mockResolvedValueOnce(response({ data: { id: '10001', username: 'cheddr_test' } })).mockResolvedValueOnce(response({ data: { id: '123', media_key: '3_123' } })).mockResolvedValueOnce(response({ data: { id: '456' } }));
    const adapter = new XAdapter(async () => 'private-token', transport); const q = new PublishingQueue();
    try { const job = q.enqueue(payload({ account: testAccounts[1] }), image, now); const checkpoints: any[] = [];
      expect(await adapter.publish(job, image, v => checkpoints.push(v))).toEqual({ id: '456', url: 'https://x.com/i/status/456' });
      expect(transport.mock.calls[1][0]).toBe('https://api.x.com/2/media/upload'); expect(JSON.parse(transport.mock.calls[1][1].body).media).toBe(image.toString('base64'));
      expect(JSON.parse(transport.mock.calls[2][1].body).media.media_ids).toEqual(['123']); expect(checkpoints[0]).toEqual({ mediaId: '123', mediaKey: '3_123' });
    } finally { q.close(); }
  });
  it('reconciles X by uploaded media key and caption, never treats a missing match as permission to retry', async () => {
    const q = new PublishingQueue(); try {
      const job = { ...q.enqueue(payload({ account: testAccounts[1] }), image, now), startedAt: now, checkpoint: { mediaKey: '3_123' } };
      const transport = vi.fn().mockResolvedValueOnce(response({ data: [{ id: '456', text: job.payload.caption, attachments: { media_keys: ['3_123'] } }] })).mockResolvedValueOnce(response({ data: [] }));
      const adapter = new XAdapter(async () => 'private', transport); expect((await adapter.reconcile(job))?.id).toBe('456'); expect(await adapter.reconcile(job)).toBeNull(); expect(transport.mock.calls.every(call => !call[1].method)).toBe(true);
    } finally { q.close(); }
  });
  it('creates/polls/publishes Instagram container from an HTTPS JPEG and retains success if permalink lookup fails', async () => {
    const q = new PublishingQueue(); try {
      const transport = vi.fn().mockResolvedValueOnce(response({ data: [{ user_id: '10001', username: 'cheddr_test' }] })).mockResolvedValueOnce(response({ id: '111' })).mockResolvedValueOnce(response({ status_code: 'FINISHED' })).mockResolvedValueOnce(response({ id: '222' })).mockResolvedValueOnce(response({ error: 'private-token' }, 500));
      const adapter = new InstagramAdapter(async () => 'private-token', 'v27.0', async () => 'https://media.example.test/image.jpg?signature=private', transport);
      const job = q.enqueue(payload(), image, now); const checkpoints: any[] = [];
      expect(await adapter.publish(job, image, value => checkpoints.push(value))).toEqual({ id: '222', url: undefined });
      expect(transport.mock.calls[1][1].body.get('image_url')).toContain('https://media.example.test'); expect(transport.mock.calls[3][1].body.get('creation_id')).toBe('111'); expect(checkpoints.at(-1).postId).toBe('222');
    } finally { q.close(); }
  });
  it('redacts upstream failures and marks post-create network timeouts uncertain', async () => {
    const transport = vi.fn().mockResolvedValueOnce(response({ data: { id: '10001', username: 'cheddr_test' } })).mockResolvedValueOnce(response({ data: { id: '123' } })).mockRejectedValueOnce(new Error('secret-token'));
    const q = new PublishingQueue(); try { const adapter = new XAdapter(async () => 'secret-token', transport); const job = q.enqueue(payload(), image, now); await expect(adapter.publish(job, image, () => {})).rejects.toMatchObject({ uncertain: true }); } finally { q.close(); }
  });
});
describe('AI drafts have no publishing authority', () => {
  it('uses a server-selected Responses model without tools and validates draft output', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'isolated-test-key'); vi.stubEnv('OPENAI_CAPTION_MODEL', 'isolated-text-model');
    try {
      const transport = vi.fn().mockResolvedValue(response({ output: [{ content: [{ type: 'output_text', text: JSON.stringify({ caption: 'A reviewed collection awaits.', publishAt: '2030-11-12T20:00:00.000Z', rationale: 'Draft timing suggestion only.' }) }] }] }));
      const result = await new OpenAICaptionDrafter(transport).propose({ brief: 'Collection launch', platform: 'X', earliest: now, brandDirection: 'Editorial style' });
      const request = JSON.parse(transport.mock.calls[0][1].body); expect(request.model).toBe('isolated-text-model'); expect(request.store).toBe(false); expect(request.tools).toBeUndefined(); expect(result.caption).toBe('A reviewed collection awaits.');
    } finally { vi.unstubAllEnvs(); }
  });
  it('rejects unusable proposed times and captions without creating queue work', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'isolated-test-key'); vi.stubEnv('OPENAI_CAPTION_MODEL', 'isolated-text-model');
    try {
      const transport = vi.fn().mockResolvedValue(response({ output: [{ content: [{ type: 'output_text', text: JSON.stringify({ caption: 'x'.repeat(281), publishAt: '2020-01-01T00:00:00.000Z', rationale: 'Invalid draft' }) }] }] }));
      await expect(new OpenAICaptionDrafter(transport).propose({ brief: 'Launch', platform: 'X', earliest: now, brandDirection: '' })).rejects.toThrow('did not meet');
    } finally { vi.unstubAllEnvs(); }
  });
});
describe('private account and media boundaries', () => {
  it('encrypts credentials and exposes account metadata only', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'dizzle-token-')); try {
      const vault = new SocialAccountVault(dir, 'ab'.repeat(32)); vault.save({ ...testAccounts[0], mode: 'live' }, { accessToken: 'private-token-value', expiresAt: Date.now() + 60 * 86_400_000, issuedAt: Date.now() });
      expect(readFileSync(join(dir, 'social-accounts.json'), 'utf8')).not.toContain('private-token-value'); expect(JSON.stringify(vault.accounts())).not.toContain('private-token-value'); expect(await vault.token(testAccounts[0])).toBe('private-token-value');
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  it('uses one-use OAuth state and S256 PKCE with only required X scopes', () => {
    const state = oauthStart('x', 'client', 'https://app.example.test/callback'); const url = new URL(state.url); expect(url.searchParams.get('code_challenge_method')).toBe('S256'); expect(url.searchParams.get('scope')).toContain('media.write'); expect(() => consumeOAuthState(state, 'forged')).toThrow(); consumeOAuthState(state, state.state); expect(() => consumeOAuthState(state, state.state)).toThrow();
  });
  it('only serves a signed, unexpired, approved live Instagram job image', () => {
    const q = new PublishingQueue(); try { const job = q.enqueue(payload({ account: { ...testAccounts[0], mode: 'live' } }), image, now); q.claim(now, true); const secret = 'a'.repeat(32), clock = Date.parse(now), url = new URL(mediaUrl('https://media.example.test', job.id, secret, clock)); expect(authorizedMedia(url, q, secret, clock)).toEqual(image); expect(authorizedMedia(url, q, 'wrong'.repeat(8), clock)).toBeNull(); expect(authorizedMedia(url, q, secret, clock + 3_600_001)).toBeNull(); } finally { q.close(); }
  });
});
describe('calendar approval integration', () => {
  async function setup() {
    const workflow = new Workflow(), service = new MarketingService(workflow, new TestImageGenerator(), undefined, undefined, undefined, new TestCaptionDrafter());
    const author = workflow.authenticate('marketing'), owner = workflow.authenticate('owner');
    const job = service.createGeneration(author, { brandId: 'cheddr', campaignId: 'campaign-cheddr-launch', prompt: 'test', referenceAssetIds: [], width: 512, height: 512, simulateTransientError: false, requestKey: crypto.randomUUID() });
    await vi.waitFor(() => expect(service.workspace(author).generationJobs[0].status).toBe('succeeded'));
    const versionId = service.workspace(author).generationJobs[0].versionId!; service.submitVersion(author, versionId); service.reviewVersion(owner, versionId, 'approve', 'approved');
    const input = { campaignId: 'campaign-cheddr-launch', title: 'Social calendar post', objective: 'Launch', owner: 'marketing', destinationAccountId: testAccounts[0].id, destinationAccount: testAccounts[0].handle, channel: 'Instagram', caption: 'Approved caption', plannedAt: now, linkedAssetId: job.assetId, linkedVersionId: versionId };
    return { workflow, service, author, owner, input };
  }
  it('only schedules exact approved account/image/caption/time, invalidates on edit, preserves queue evidence', async () => {
    const { service, author, owner, input } = await setup(); try {
      const item = service.createContent(author, input); await expect(service.scheduleContent(author, item.id)).rejects.toThrow('approval');
      service.submitContent(author, item.id); expect(() => service.reviewContent(author, item.id, 'approve', '')).toThrow(); service.reviewContent(owner, item.id, 'approve', 'Exact destination, JPEG, caption and Pacific time checked');
      await service.scheduleContent(author, item.id); const queued = service.workspace(author).publishingJobs[0]; expect(queued.payload.account.handle).toBe('@cheddr_test'); expect(queued.payload.versionId).toBe(input.linkedVersionId);
      service.updateContent(author, item.id, { ...input, caption: 'Changed caption' }); expect(service.workspace(author).content.find(c => c.id === item.id)?.approvedBy).toBeNull(); expect(service.publishingQueue.get(queued.id).state).toBe('canceled'); await expect(service.scheduleContent(author, item.id)).rejects.toThrow();
      expect(() => service.createContent(author, { ...input, destinationAccount: '@someone_else' })).toThrow('exact handle');
      expect(() => service.createContent(author, { ...input, destinationAccountId: testAccounts[1].id, destinationAccount: testAccounts[1].handle, channel: 'X', caption: 'x'.repeat(281) })).toThrow('Caption');
    } finally { service.publishingQueue.close(); }
  });
  it('records manual posting only after cancellation, validates URL/time, and AI proposals never enqueue', async () => {
    const { service, author, owner, input, workflow } = await setup(); try {
      const proposal = await service.proposeSocial(author, 'cheddr', 'Launch', 'Instagram'); expect(proposal.caption).toContain('Test proposal'); expect(service.workspace(author).publishingJobs).toHaveLength(0);
      await expect(service.proposeSocial(workflow.authenticate('rep-a'), 'cheddr', 'Launch', 'Instagram')).rejects.toThrow();
      const item = service.createContent(author, input); service.submitContent(author, item.id); service.reviewContent(owner, item.id, 'approve', ''); await service.scheduleContent(author, item.id); const queued = service.workspace(author).publishingJobs[0];
      expect(() => service.markSocialPosted(author, item.id, 'https://www.instagram.com/p/manual/', '2026-11-10T20:00:00.000Z')).toThrow('Cancel'); service.cancelSocial(author, queued.id);
      expect(() => service.markSocialPosted(author, item.id, 'https://evil.example/p/manual/', '2026-11-10T20:00:00.000Z')).toThrow('actual platform');
      expect(service.markSocialPosted(author, item.id, 'https://www.instagram.com/p/manual/', '2026-11-10T20:00:00.000Z').manual).toBe(true);
    } finally { service.publishingQueue.close(); }
  });
  it('blocks edits once claimed and requires a reviewer to confirm an existing uncertain post', async () => {
    const { service, author, owner, input } = await setup(); try {
      const item = service.createContent(author, input); service.submitContent(author, item.id); service.reviewContent(owner, item.id, 'approve', ''); await service.scheduleContent(author, item.id);
      const frozen = await service.socialImage(author, item.id), claim = service.publishingQueue.claim('2030-11-12T20:00:00.000Z', false)!;
      expect(() => service.updateContent(author, item.id, { ...input, caption: 'Race with worker' })).toThrow('Posting has started');
      expect(await service.socialImage(author, item.id)).toEqual(frozen);
      service.publishingQueue.finish(claim.job.id, claim.lease, 'needs_review', { error: 'Unknown result' }, now);
      expect(() => service.markSocialPosted(author, item.id, 'https://www.instagram.com/p/existing/', '2026-11-10T20:00:00.000Z', true)).toThrow('not authorized');
      expect(() => service.markSocialPosted(owner, item.id, 'https://www.instagram.com/p/existing/', '2026-11-10T20:00:00.000Z', true)).toThrow('lease');
      service.publishingQueue.db.prepare('UPDATE publishing_jobs SET lease_until=0 WHERE id=?').run(claim.job.id);
      expect(service.markSocialPosted(owner, item.id, 'https://www.instagram.com/p/existing/', '2026-11-10T20:00:00.000Z', true).state).toBe('published');
    } finally { service.publishingQueue.close(); }
  });
});
