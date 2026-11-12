import { fixturePublishingControls } from './fixtures/publishing-controls';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { AddressInfo } from 'node:net';
import { createApi } from '../server/api';
import { PublishingQueue } from '../server/publishing/queue';
import { PublishingWorker } from '../server/publishing/worker';
import { PublishingError, TestPublishingAdapter } from '../server/publishing/adapters';
import { publishingStorage } from '../server/publishing/storage';
import { stagingPreflight } from '../server/publishing/staging-preflight';
import { verifyExpectedHandle } from '../server/publishing/oauth';
import { Workflow } from '../server/workflow';
import { LoopbackPublishingAuthorization, publishingFingerprint } from '../server/publishing/authorization';
import { testAccounts } from '../server/publishing/adapters';
import { SinglePostPilot } from '../server/publishing/pilot-control';
import { TestImageGenerator } from './fixtures/image-generator';
import { TestCaptionDrafter } from '../server/publishing/drafts';
import type { MarketingWorkspaceData } from '../shared/contracts';

describe('Cheddr first staging pilot through the HTTP API', () => {
  let directory: string, server: ReturnType<typeof createApi> | undefined, base: string, workerQueue: PublishingQueue | undefined;
  let workflow: Workflow, accounts: typeof testAccounts;
  const due = '2026-11-12T20:00:00.000Z';
  async function start() {
    const { store, directory: publishingDirectory } = publishingStorage({ DIZZLE_MARKETING_DIR: directory, DIZZLE_PUBLISHING_DIR: directory });
    workflow = new Workflow(); accounts = structuredClone(testAccounts);
    server = createApi(workflow, { store, publishingQueue: new PublishingQueue(join(publishingDirectory, 'publishing.sqlite')), accounts, resolveAccount: id => accounts.find(account => account.id === id) ?? null, generator: new TestImageGenerator(), drafter: new TestCaptionDrafter() });
    server.listen(0, '127.0.0.1'); await once(server, 'listening'); base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  }
  async function stop() { if (server) { const current = server; server = undefined; current.closeAllConnections(); await new Promise<void>(resolve => current.close(() => resolve())); } }
  async function api(path: string, method = 'GET', body?: unknown, actor = 'marketing'): Promise<any> {
    const response = await fetch(base + '/api' + path, { method, headers: { 'X-Demo-Identity': actor, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const data = await response.json(); expect(response.ok, JSON.stringify(data)).toBe(true); return data;
  }
  async function workspace(): Promise<MarketingWorkspaceData> { return api('/marketing/workspace'); }
  async function approvedPost(handle = '@cheddr_test') {
    const imageJob = await api('/marketing/generation-jobs', 'POST', { brandId: 'cheddr', campaignId: 'campaign-cheddr-launch', prompt: 'Isolated Cheddr staging square', width: 512, height: 512, referenceAssetIds: [], requestKey: crypto.randomUUID() });
    let versionId = '';
    await expect.poll(async () => { const data = await workspace(); versionId = data.generationJobs.find(job => job.id === imageJob.id)?.versionId ?? ''; return !!versionId; }).toBe(true);
    await api(`/marketing/versions/${versionId}/submit`, 'POST', {});
    await api(`/marketing/versions/${versionId}/review`, 'POST', { decision: 'approve', notes: 'Isolated image review' }, 'owner');
    const input = { campaignId: 'campaign-cheddr-launch', title: 'Cheddr staging restart proof', objective: 'Single-image pilot verification', owner: 'marketing', channel: 'X', destinationAccountId: 'test-cheddr-x', destinationAccount: handle, plannedAt: due, caption: 'Cheddr publishing pilot: a single-image test from our marketing workspace.', linkedAssetId: imageJob.assetId, linkedVersionId: versionId };
    const item = await api('/marketing/content', 'POST', input);
    await api(`/marketing/content/${item.id}/submit`, 'POST', {});
    await api(`/marketing/content/${item.id}/review`, 'POST', { decision: 'approve', notes: 'Exact account, image, caption and Pacific time checked' }, 'owner');
    await api(`/marketing/content/${item.id}/schedule`, 'POST', {});
    const job = (await workspace()).publishingJobs.find(job => job.payload.contentId === item.id)!;
    return { item, input, job };
  }
  function queue() { workerQueue = new PublishingQueue(join(directory, 'publishing.sqlite')); return workerQueue; }
  beforeEach(async () => { directory = mkdtempSync(join(tmpdir(), 'dizzle-cheddr-pilot-')); await start(); });
  afterEach(async () => { workerQueue?.close(); workerQueue = undefined; await stop(); if (!resolve(directory).startsWith(resolve(tmpdir()))) throw new Error('Refusing cleanup outside isolated temporary directory.'); rmSync(directory, { recursive: true, force: true }); });

  it('retains actual approval and JPEG after API restart, waits until due, sends once and retains receipt after another restart', async () => {
    const { item, job } = await approvedPost();
    await stop(); await start();
    const restored = await workspace(); expect(restored.content.find(c => c.id === item.id)).toMatchObject({ status: 'scheduled', approvedBy: 'owner', caption: job.payload.caption });
    expect(restored.publishingJobs.find(j => j.id === job.id)).toMatchObject({ state: 'scheduled', payload: job.payload });
    const q = queue(), bytes = q.image(job.id); expect(bytes.subarray(0, 3).toString('hex')).toBe('ffd8ff');
    const adapter = new TestPublishingAdapter(); let clock = '2026-11-12T19:59:59.000Z';
    const worker = new PublishingWorker(q, () => adapter, () => clock, false, fixturePublishingControls());
    expect(await worker.tick()).toBe(false); expect(adapter.calls).toHaveLength(0);
    clock = due; expect(await worker.tick()).toBe(true); expect(await worker.tick()).toBe(false); expect(adapter.calls).toEqual([job.id]);
    await stop(); await start();
    expect((await workspace()).publishingJobs.find(j => j.id === job.id)).toMatchObject({ state: 'published', providerId: 'test-' + job.id, publishedAt: due });
    expect(q.image(job.id)).toEqual(bytes);
    const events = q.db.prepare("SELECT action FROM publishing_events WHERE job_id=? AND action='claimed'").all(job.id); expect(events).toHaveLength(1);
  });
  it('invalidates approval and cancels the queued send when publish time is edited', async () => {
    const { item, input, job } = await approvedPost();
    await api(`/marketing/content/${item.id}`, 'PATCH', { ...input, plannedAt: '2026-11-12T21:00:00.000Z' });
    await stop(); await start();
    const data = await workspace(); expect(data.content.find(c => c.id === item.id)).toMatchObject({ status: 'draft', approvedBy: null, approvalSnapshot: null }); expect(data.publishingJobs.find(j => j.id === job.id)?.state).toBe('canceled');
    const adapter = new TestPublishingAdapter(); expect(await new PublishingWorker(queue(), () => adapter, () => due, false, fixturePublishingControls()).tick()).toBe(false); expect(adapter.calls).toHaveLength(0);
  });
  it('preserves cancellation across restart and never sends the canceled post', async () => {
    const { job } = await approvedPost(); await api(`/marketing/publishing-jobs/${job.id}/cancel`, 'POST', {}); await stop(); await start();
    const adapter = new TestPublishingAdapter(), worker = new PublishingWorker(queue(), () => adapter, () => due, false, fixturePublishingControls()); expect(await worker.tick()).toBe(false); expect(adapter.calls).toHaveLength(0); expect((await workspace()).publishingJobs.find(j => j.id === job.id)?.state).toBe('canceled');
  });
  it('persists an uncertain response as Needs Review and a restarted worker never resends', async () => {
    const { job } = await approvedPost(); const adapter = new TestPublishingAdapter();
    adapter.publish = async (current, _image, checkpoint) => { adapter.calls.push(current.id); checkpoint({ testReceipt: current.id }); throw new PublishingError('Simulated uncertain post response.', true); };
    await new PublishingWorker(queue(), () => adapter, () => due, false, fixturePublishingControls()).tick(); await stop(); await start();
    expect((await workspace()).publishingJobs.find(j => j.id === job.id)?.state).toBe('needs_review');
    workerQueue!.close(); workerQueue = undefined;
    expect(await new PublishingWorker(queue(), () => adapter, () => '2026-11-12T21:00:00.000Z', false, fixturePublishingControls()).tick()).toBe(false); expect(adapter.calls).toEqual([job.id]);
  });
  it('reuses current API employee grants and holds the independent worker after publishing permission is revoked', async () => {
    const { job } = await approvedPost(); const authority = new LoopbackPublishingAuthorization(Number(new URL(base).port));
    await authority.authorize(job);
    workflow.identities.find(actor => actor.id === 'owner')!.marketingGrants = ['workspace:read', 'asset:review'];
    const adapter = new TestPublishingAdapter(), fixture = fixturePublishingControls();
    await new PublishingWorker(queue(), () => adapter, () => due, false, { ...fixture, authorize: current => authority.authorize(current) }).tick();
    expect(adapter.calls).toHaveLength(0); expect((await workspace()).publishingJobs.find(current => current.id === job.id)?.state).toBe('needs_review');
  });
  it('reads the current connected account for each API authorization decision', async () => {
    const { job } = await approvedPost(); const authority = new LoopbackPublishingAuthorization(Number(new URL(base).port)); await authority.authorize(job);
    accounts.find(account => account.id === job.payload.account.id)!.providerUserId = '20002';
    const adapter = new TestPublishingAdapter(), fixture = fixturePublishingControls();
    await new PublishingWorker(queue(), () => adapter, () => due, false, { ...fixture, authorize: current => authority.authorize(current) }).tick();
    expect(adapter.calls).toHaveLength(0); expect((await workspace()).publishingJobs.find(current => current.id === job.id)?.state).toBe('needs_review');
  });
  it('rejects queued payload tampering and denies ungranted callers at the authorization endpoint', async () => {
    const { job } = await approvedPost(), q = queue();
    const changed = structuredClone(job); changed.payload.caption = 'Unapproved replacement'; q.db.prepare('UPDATE publishing_jobs SET payload=? WHERE id=?').run(JSON.stringify(changed.payload), job.id);
    const authority = new LoopbackPublishingAuthorization(Number(new URL(base).port)); await expect(authority.authorize(changed)).rejects.toThrow('could not be confirmed');
    const denied = await fetch(base + `/api/marketing/publishing-jobs/${job.id}/authorize`, { method: 'POST', headers: { 'X-Demo-Identity': 'marketing', 'Content-Type': 'application/json' }, body: JSON.stringify({ fingerprint: publishingFingerprint(changed) }) }); expect(denied.status).toBe(403);
  });
  it('combines current HTTP authority and a durable selected-job restriction for one test send only', async () => {
    accounts.find(account => account.id === 'test-cheddr-x')!.handle = '@cheddrco_';
    const { job } = await approvedPost('@cheddrco_');
    const authority = new LoopbackPublishingAuthorization(Number(new URL(base).port)); await authority.authorize(job);
    const pilot = new SinglePostPilot(join(directory, 'pilot-control.sqlite'));
    try {
      pilot.select(job, '10001', 'test-operator', due); // synthetic connected fixture ID, never the owner's real ID
      const adapter = new TestPublishingAdapter(), worker = new PublishingWorker(queue(), () => adapter, () => due, false, pilot.controls(current => authority.authorize(current), () => due));
      await worker.tick(); expect(await worker.tick()).toBe(false); expect(adapter.calls).toEqual([job.id]);
      const second = await approvedPost('@cheddrco_'); await worker.tick();
      const data = await workspace(); expect(data.publishingJobs.find(current => current.id === job.id)?.state).toBe('published'); expect(data.publishingJobs.find(current => current.id === second.job.id)?.state).toBe('needs_review'); expect(adapter.calls).toEqual([job.id]);
    } finally { pilot.close(); }
  });
});

describe('explicit one-host storage configuration', () => {
  it('uses a stable external directory for both marketing history and publishing state', () => {
    const directory = mkdtempSync(join(tmpdir(), 'dizzle-pilot-storage-'));
    try { const result = publishingStorage({ DIZZLE_MARKETING_DIR: directory }); expect(result.store.directory).toBe(directory); expect(result.directory).toBe(directory); } finally { rmSync(directory, { recursive: true, force: true }); }
  });
  it('rejects a marketing directory inside the checkout before creating state', () => { expect(() => publishingStorage({ DIZZLE_MARKETING_DIR: resolve('forbidden-pilot-state') })).toThrow('outside the checkout'); });
});

describe('private-only staging gates', () => {
  const safeOptions = { nodeVersion: '24.14.0', checkoutEnvExists: false, liveWorkerDisabled: true, liveReadsDisabled: true };
  const root = join(tmpdir(), 'dizzle-cheddr-preflight');
  const env = { DIZZLE_MARKETING_DIR: root, DIZZLE_PUBLISHING_DIR: root, DIZZLE_PILOT_PRIVATE_ONLY: '1', SOCIAL_EXPECTED_HANDLE: '@cheddrco_' };
  it('allows a private test configuration without claiming real-account or public readiness', () => {
    expect(stagingPreflight(env, safeOptions)).toMatchObject({ readyForPrivateTestStaging: true, publicExposureAllowed: false, livePublishingEnabled: false, privateSettingsPresent: { X_CLIENT_ID: false } });
  });
  it('blocks production mode, checkout secrets, enabled live gates and mismatched storage roots', () => {
    const result = stagingPreflight({ ...env, NODE_ENV: 'production', DIZZLE_PUBLISHING_DIR: root + '-different' }, { ...safeOptions, checkoutEnvExists: true, liveWorkerDisabled: false });
    expect(result.readyForPrivateTestStaging).toBe(false); expect(result.blockers).toHaveLength(4);
  });
  it('rejects an OAuth session for the wrong handle before the caller saves credentials', () => {
    expect(() => verifyExpectedHandle('@someone_else', '@cheddrco_')).toThrow('Nothing was saved'); expect(() => verifyExpectedHandle('@cheddrco_', '@cheddrco_')).not.toThrow();
  });
});
