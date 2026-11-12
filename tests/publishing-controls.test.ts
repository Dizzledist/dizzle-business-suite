import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { PublishingQueue } from '../server/publishing/queue';
import { PublishingWorker } from '../server/publishing/worker';
import { TestPublishingAdapter, PublishingError, testAccounts } from '../server/publishing/adapters';
import { SinglePostPilot } from '../server/publishing/pilot-control';
import { assertPublishingAuthority, LoopbackPublishingAuthorization } from '../server/publishing/authorization';
import { Workflow } from '../server/workflow';
import type { PublishJob, PublishPayload } from '../shared/publishing';

describe('single-post Cheddr X execution controls', () => {
  const now = '2026-11-12T20:00:00.000Z', image = Buffer.from('approved image bytes');
  let directory: string, queue: PublishingQueue, pilot: SinglePostPilot, workflow: Workflow, account: typeof testAccounts[number], adapter: TestPublishingAdapter;
  beforeEach(() => { directory = mkdtempSync(join(tmpdir(), 'dizzle-controls-')); queue = new PublishingQueue(join(directory, 'publishing.sqlite')); pilot = new SinglePostPilot(join(directory, 'pilot-control.sqlite')); workflow = new Workflow(); account = { ...testAccounts[1], handle: '@cheddrco_' }; adapter = new TestPublishingAdapter(); });
  afterEach(() => { pilot.close(); queue.close(); rmSync(directory, { recursive: true, force: true }); });
  function job() {
    const payload: PublishPayload = { contentId: crypto.randomUUID(), organizationId: 'demo-o1', account: structuredClone(account), caption: 'Exact selected pilot caption', versionId: 'approved-version-1', publishAt: now, approvedBy: 'owner', approvedAt: '2026-11-11T20:00:00.000Z', approvalSnapshot: 'exact approval', imageHash: createHash('sha256').update(image).digest('hex') };
    return queue.enqueue(payload, image, now);
  }
  const authorize = async (job: PublishJob) => assertPublishingAuthority(job, workflow.identities.find(actor => actor.id === job.payload.approvedBy) ?? null, account);
  function worker(authorization = authorize) { return new PublishingWorker(queue, () => adapter, () => now, false, pilot.controls(authorization, () => now)); }
  function select(job: PublishJob) { pilot.select(job, account.providerUserId, 'owner', now); }
  function tamper(job: PublishJob, change: (payload: PublishPayload) => void) { change(job.payload); queue.db.prepare('UPDATE publishing_jobs SET payload=? WHERE id=?').run(JSON.stringify(job.payload), job.id); }

  it('permits the selected exact job once; a second otherwise identical job is held', async () => {
    const first = job(), second = job(); select(first); const w = worker(); await w.tick(); await w.tick(); await w.tick();
    expect(adapter.calls).toEqual([first.id]); expect(queue.get(first.id).state).toBe('published'); expect(queue.get(second.id).state).toBe('needs_review');
    expect(() => select(second)).toThrow('already selected or consumed');
  });
  it.each(['caption', 'version', 'time', 'account', 'imageHash'] as const)('holds a changed %s after pilot selection', async field => {
    const selected = job(); select(selected);
    tamper(selected, p => { if (field === 'caption') p.caption += ' edited'; if (field === 'version') p.versionId = 'another-version'; if (field === 'time') p.publishAt = '2026-11-12T21:00:00.000Z'; if (field === 'account') p.account.providerUserId = '20002'; if (field === 'imageHash') p.imageHash = 'a'.repeat(64); });
    await worker().tick(); expect(adapter.calls).toHaveLength(0); expect(queue.get(selected.id).state).toBe('needs_review');
  });
  it('holds changed image bytes even when the stored payload was untouched', async () => {
    const selected = job(); select(selected); queue.db.prepare('UPDATE publishing_jobs SET image=? WHERE id=?').run(Buffer.from('changed'), selected.id);
    await worker().tick(); expect(adapter.calls).toHaveLength(0); expect(queue.get(selected.id).state).toBe('needs_review');
  });
  it('retains consumed restriction across restart and blocks a forced queue replay', async () => {
    const selected = job(); select(selected); await worker().tick();
    pilot.close(); pilot = new SinglePostPilot(join(directory, 'pilot-control.sqlite'));
    queue.db.prepare("UPDATE publishing_jobs SET state='scheduled' WHERE id=?").run(selected.id);
    await worker().tick(); expect(adapter.calls).toEqual([selected.id]); expect(queue.get(selected.id).state).toBe('needs_review'); expect(() => select(selected)).toThrow();
  });
  it.each(['publish', 'review', 'disabled', 'read', 'organization'] as const)('holds work if the approver loses %s authority', async field => {
    const selected = job(); select(selected); const owner = workflow.identities.find(actor => actor.id === 'owner')!;
    if (field === 'publish') owner.marketingGrants = owner.marketingGrants.filter(grant => grant !== 'asset:publish');
    if (field === 'review') owner.marketingGrants = owner.marketingGrants.filter(grant => grant !== 'asset:review');
    if (field === 'disabled') owner.active = false; if (field === 'read') owner.read = false; if (field === 'organization') owner.organizationId = 'foreign';
    await worker().tick(); expect(adapter.calls).toHaveLength(0); expect(queue.get(selected.id).state).toBe('needs_review');
  });
  it.each(['disconnected', 'id', 'handle', 'brand'] as const)('holds a connected-account %s change', async field => {
    const selected = job(); select(selected); if (field === 'disconnected') account.connected = false; if (field === 'id') account.providerUserId = '20002'; if (field === 'handle') account.handle = '@different'; if (field === 'brand') account.brandId = 'puffr';
    await worker().tick(); expect(adapter.calls).toHaveLength(0); expect(queue.get(selected.id).state).toBe('needs_review');
  });
  it('rechecks authority immediately before sending and retains the consumed attempt on revocation', async () => {
    const selected = job(); select(selected); let checks = 0;
    await worker(async current => { if (++checks === 2) workflow.identities.find(a => a.id === 'owner')!.marketingGrants = []; await authorize(current); }).tick();
    expect(checks).toBe(2); expect(adapter.calls).toHaveLength(0); expect(queue.get(selected.id).state).toBe('needs_review');
    expect(() => pilot.reserve(selected, now)).toThrow('already consumed');
  });
  it('does not release the single attempt after an uncertain response or worker restart', async () => {
    const selected = job(); select(selected);
    adapter.publish = async (current, _image, checkpoint, beforePublish) => { await beforePublish(); adapter.calls.push(current.id); checkpoint({ testReceipt: current.id }); throw new PublishingError('Simulated unknown response', true); };
    await worker().tick(); pilot.close(); pilot = new SinglePostPilot(join(directory, 'pilot-control.sqlite'));
    expect(queue.get(selected.id).state).toBe('needs_review'); expect(await worker().tick()).toBe(false); expect(adapter.calls).toEqual([selected.id]); expect(() => pilot.reserve(selected, now)).toThrow();
  });
  it('requires an explicit selection and denies missing current authority', async () => {
    const unselected = job(); await worker().tick(); expect(queue.get(unselected.id).state).toBe('needs_review');
    const another = job(); await new PublishingWorker(queue, () => adapter, () => now).tick(); expect(queue.get(another.id).state).toBe('needs_review'); expect(adapter.calls).toHaveLength(0);
  });
  it('does not grant a second public write within one adapter invocation', async () => {
    const selected = job(); select(selected);
    adapter.publish = async (current, _image, _checkpoint, beforePublish) => { await beforePublish(); adapter.calls.push(current.id); await beforePublish(); adapter.calls.push(current.id); return { id: 'should-not-return', url: 'https://example.invalid' }; };
    await worker().tick(); expect(adapter.calls).toEqual([selected.id]); expect(queue.get(selected.id).state).toBe('needs_review');
  });
  it('fails closed when the current authority service is unavailable or returns a different fingerprint', async () => {
    const selected = job(); select(selected);
    const authority = new LoopbackPublishingAuthorization(3001, async () => new Response(JSON.stringify({ fingerprint: 'wrong' }), { status: 200 }));
    await worker(current => authority.authorize(current)).tick(); expect(queue.get(selected.id).state).toBe('needs_review'); expect(adapter.calls).toHaveLength(0);
  });
  it('shares the consumed restriction between worker connections', async () => {
    const selected = job(); select(selected); const otherQueue = new PublishingQueue(join(directory, 'publishing.sqlite')), otherPilot = new SinglePostPilot(join(directory, 'pilot-control.sqlite'));
    try { await Promise.all([worker().tick(), new PublishingWorker(otherQueue, () => adapter, () => now, false, otherPilot.controls(authorize, () => now)).tick()]); expect(adapter.calls).toEqual([selected.id]); } finally { otherPilot.close(); otherQueue.close(); }
  });
});
