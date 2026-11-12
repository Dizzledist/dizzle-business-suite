import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { IdentityStore } from '../server/auth/store';
import { workerAuthority } from '../server/publishing/worker-authority';
import { createApi } from '../server/api';
import { PublishingWorker } from '../server/publishing/worker';
import { TestPublishingAdapter } from '../server/publishing/adapters';
import { SinglePostPilot } from '../server/publishing/pilot-control';
import sharp from 'sharp';
import { approvedFixtureJob, marketingSessionFixture, pilotTime, reviewerGrants } from './fixtures/marketing-session';

describe('Marketing adopted shared employee sessions and trusted publishing resolver', () => {
  let f: Awaited<ReturnType<typeof marketingSessionFixture>>;
  beforeEach(async () => { f = await marketingSessionFixture(); });
  afterEach(async () => { vi.unstubAllEnvs(); await f.close(); });
  const campaign = { brandId: 'cheddr', title: 'Private campaign', objective: 'Test', owner: 'Employee' };
  it('refuses fixture API/worker fallback when hosted employee mode or production is requested', () => {
    vi.stubEnv('NODE_ENV', 'production'); expect(() => createApi()).toThrow('Fixture API');
    expect(() => workerAuthority({ NODE_ENV: 'production' })).toThrow('SOCIAL_WORKER_TOKEN_FILE');
    vi.stubEnv('NODE_ENV', 'test'); vi.stubEnv('DIZZLE_AUTH_MODE', 'employee'); expect(() => createApi()).toThrow('Fixture API');
    expect(() => workerAuthority({ NODE_ENV: 'test', AUTH_PUBLIC_ORIGIN: 'https://pilot.example.test' })).toThrow('SOCIAL_WORKER_TOKEN_FILE');
  });
  it('signs in a provisioned subject through the shared flow, uses its canonical ID and starts with no fixture data', async () => {
    const editor = await f.login(); expect(editor.status).toBe(302); expect(editor.session.employee.id).toBe('sales-editor-17');
    const workspace = await (await f.request('/marketing/workspace', editor)).json(); expect(workspace.campaigns).toEqual([]); expect(workspace.eligibleReps).toEqual([]); expect(workspace.identity.demo).toBe(false); expect(workspace.identity.roles).toEqual([]);
    const created = await (await f.request('/marketing/campaigns', editor, campaign)).json(); expect(created.createdBy).toBe('sales-editor-17'); expect(created.organizationId).toBe('pilot-org');
    expect((await f.request('/invoices/inv-open', editor)).status).toBe(404); expect((await f.request('/demo/reset', editor, {})).status).toBe(404);
  });
  it('requires a session and denies fixture headers on campaigns, calendar, asset files and publishing controls', async () => {
    for (const path of ['/marketing/workspace', '/assets', '/marketing/versions/missing/file', '/marketing/content/missing/social-image']) {
      expect((await fetch(f.base + '/api' + path, { headers: { 'X-Demo-Identity': 'owner' } })).status).toBe(401);
      expect((await fetch(f.base + '/api' + path)).status).toBe(401);
    }
    const editor = await f.login(); expect((await f.request('/marketing/workspace', editor, undefined, undefined, { 'X-Demo-Identity': 'owner' })).status).toBe(401);
  });
  it('protects every mutation with exact-origin CSRF and does not accept body-supplied grants', async () => {
    const editor = await f.login();
    expect((await f.request('/marketing/campaigns', editor, campaign, undefined, { 'X-CSRF-Token': '' })).status).toBe(403);
    expect((await f.request('/marketing/campaigns', editor, campaign, undefined, { Origin: 'https://foreign.example' })).status).toBe(403);
    expect((await f.request('/marketing/campaigns', editor, { ...campaign, grants: ['asset:publish'] })).status).toBe(400);
    expect((await f.request('/marketing/campaigns', editor, campaign)).status).toBe(201);
  });
  it('enforces current grants separately for campaign, generation, approval and internal asset publication', async () => {
    const editor = await f.login(); f.identity.changeAccess('sales-editor-17', 'pilot-org', true, ['workspace:read'], 'fixture-operator');
    expect((await f.request('/marketing/campaigns', editor, campaign)).status).toBe(403);
    expect((await f.request('/marketing/generation-jobs', editor, { brandId: 'cheddr', campaignId: 'missing', prompt: 'test', referenceAssetIds: [], width: 64, height: 64, requestKey: crypto.randomUUID() })).status).toBe(403);
    expect((await f.request('/marketing/content/missing/review', editor, { decision: 'approve' })).status).toBe(403);
    expect((await f.request('/marketing/versions/missing/publish', editor, { audienceMode: 'all' })).status).toBe(403);
  });
  it('disables existing sessions and denies wrong-organization users even if their grants match', async () => {
    const editor = await f.login(); const operator = new IdentityStore(f.db);
    try { operator.changeAccess('sales-editor-17', 'pilot-org', false, [], 'fixture-operator'); } finally { operator.close(); }
    expect((await f.request('/marketing/workspace', editor)).status).toBe(401); expect((await f.login()).status).toBe(403); expect((await f.login('other-org')).status).toBe(403);
  });
  it('uploads and retrieves protected brand references in the configured organization, then denies after grant revocation', async () => {
    const editor = await f.login(), png = await sharp({ create: { width: 16, height: 16, channels: 3, background: '#892c3b' } }).png().toBuffer();
    const upload = await f.request('/marketing/references', editor, { brandId: 'cheddr', title: 'Private logo fixture', base64: png.toString('base64') });
    expect(upload.status).toBe(201); const asset = await upload.json(), file = '/marketing/versions/' + asset.versions[0].id + '/file';
    expect(asset.organizationId).toBe('pilot-org'); expect((await f.request(file, editor)).status).toBe(200);
    f.identity.changeAccess('sales-editor-17', 'pilot-org', true, [], 'fixture-operator');
    expect((await f.request(file, editor)).status).toBe(403);
  });
  function worker(adapter: TestPublishingAdapter, token: string) {
    const file = join(f.root, 'worker-credential'); writeFileSync(file, token, { mode: 0o600 });
    const authority = workerAuthority({ NODE_ENV: 'test', DIZZLE_AUTH_MODE: 'employee', SHARED_AUTH_PORT: new URL(f.base).port, SOCIAL_WORKER_TOKEN_FILE: file });
    return new PublishingWorker(f.queue, () => adapter, () => pilotTime, false, f.pilot.controls(job => authority.authorize(job), () => pilotTime));
  }
  async function setup() { const data = await approvedFixtureJob(f); const token = f.identity.issueWorkload('pilot-worker', 'pilot-org', 3_600_000, 'fixture-operator'); f.pilot.select(data.job, '10001', 'fixture-operator', pilotTime); return { ...data, token, adapter: new TestPublishingAdapter() }; }
  it('approves and schedules actual creative/content through sessions and publishes the selected due test job once', async () => {
    const { job, token, adapter } = await setup(); const w = worker(adapter, token);
    expect(createHash('sha256').update(f.queue.image(job.id)).digest('hex')).toBe(job.payload.imageHash);
    expect(job.payload.approvedBy).toBe('sales-reviewer-42');
    expect(await w.tick()).toBe(true); expect(await w.tick()).toBe(false); expect(adapter.calls).toEqual([job.id]); expect(f.queue.get(job.id)).toMatchObject({ state: 'published', providerId: 'test-' + job.id });
  });
  it.each(['disabled', 'revoked', 'revoked-workspace', 'expired-worker', 'invalid-worker', 'revoked-worker', 'wrong-worker-org', 'unavailable'] as const)('holds the actual approved job for %s authority with no send or automatic retry', async reason => {
    const { job, token, adapter } = await setup(); let credential = token;
    if (reason === 'disabled') f.identity.changeAccess('sales-reviewer-42', 'pilot-org', false, [], 'fixture-operator');
    if (reason === 'revoked') f.identity.changeAccess('sales-reviewer-42', 'pilot-org', true, reviewerGrants.filter(g => g !== 'asset:publish'), 'fixture-operator');
    if (reason === 'revoked-workspace') f.identity.changeAccess('sales-reviewer-42', 'pilot-org', true, reviewerGrants.filter(g => g !== 'workspace:read'), 'fixture-operator');
    if (reason === 'expired-worker') f.advance(3_600_001);
    if (reason === 'invalid-worker') credential = 'z'.repeat(43);
    if (reason === 'revoked-worker') f.identity.revokeWorkload('pilot-worker', 'pilot-org', 'fixture-operator');
    if (reason === 'wrong-worker-org') credential = f.identity.issueWorkload('other-worker', 'other-org', 3_600_000, 'fixture-operator');
    if (reason === 'unavailable') f.controls.unavailable = true;
    const w = worker(adapter, credential); await w.tick(); expect(f.queue.get(job.id).state).toBe('needs_review'); expect(adapter.calls).toHaveLength(0);
    f.controls.unavailable = false; expect(await w.tick()).toBe(false);
  });
  it('denies revoked authority immediately before the public write after initial authorization succeeds', async () => {
    const { job, token, adapter } = await setup();
    // First resolver reads the destination twice; the final authorization must read it again.
    f.controls.onAccountRead = count => { if (count === 3) f.identity.changeAccess('sales-reviewer-42', 'pilot-org', true, ['workspace:read'], 'fixture-operator'); };
    await worker(adapter, token).tick(); expect(adapter.calls).toHaveLength(0); expect(f.queue.get(job.id).state).toBe('needs_review');
  });
  it.each(['account', 'caption', 'versionId', 'publishAt', 'imageHash', 'bytes'] as const)('rechecks the approved %s binding through the actual domain resolver', async field => {
    const { job, token, adapter } = await setup();
    if (field === 'account') f.account.providerUserId = '20002';
    else if (field === 'bytes') f.queue.db.prepare('UPDATE publishing_jobs SET image=? WHERE id=?').run(Buffer.from('changed'), job.id);
    else { job.payload[field] = field === 'publishAt' ? '2030-11-12T19:00:00.000Z' : 'changed'; f.queue.db.prepare('UPDATE publishing_jobs SET payload=? WHERE id=?').run(JSON.stringify(job.payload), job.id); }
    await worker(adapter, token).tick(); expect(adapter.calls).toHaveLength(0); expect(f.queue.get(job.id).state).toBe('needs_review');
  });
  it('invalidates content approval after an edit and prevents the queued original from sending', async () => {
    const { job, token, adapter, content, editor, input } = await setup();
    const changed = await f.request('/marketing/content/' + content.id, editor, { ...input, caption: 'Changed after approval' }, 'PATCH'); expect(changed.status).toBe(200); expect((await changed.json()).approvedBy).toBeNull();
    await worker(adapter, token).tick(); expect(adapter.calls).toHaveLength(0); expect(f.queue.get(job.id).state).toBe('canceled');
  });
  it('retains the consumed slot across restart, denies forced replay and a second valid approved job', async () => {
    const { job, token, adapter } = await setup(); await worker(adapter, token).tick();
    f.pilot.close(); f.pilot = new SinglePostPilot(join(f.root, 'pilot-control.sqlite'));
    f.queue.db.prepare("UPDATE publishing_jobs SET state='scheduled' WHERE id=?").run(job.id); await worker(adapter, token).tick();
    const second = await approvedFixtureJob(f); await worker(adapter, token).tick();
    expect(adapter.calls).toEqual([job.id]); expect(f.queue.get(second.job.id).state).toBe('needs_review');
    expect(readFileSync(join(f.root, 'marketing', 'state.json'), 'utf8')).toContain('sales-reviewer-42');
  });
});
