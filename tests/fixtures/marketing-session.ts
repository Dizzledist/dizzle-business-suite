import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { createServer } from 'node:net';
import type { AddressInfo } from 'node:net';
import { createApi } from '../../server/api';
import { IdentityStore, migrateIdentity } from '../../server/auth/store';
import { MarketingStore } from '../../server/marketing-store';
import { PublishingQueue } from '../../server/publishing/queue';
import { SinglePostPilot } from '../../server/publishing/pilot-control';
import { TestImageGenerator } from './image-generator';
import { TestCaptionDrafter } from '../../server/publishing/drafts';
import { testAccounts } from '../../server/publishing/adapters';
import type { ReportingService } from '../../server/reporting/service';
import { FixtureGoogle, principal } from './shared-identity';
import type { EmployeeGrant } from '../../shared/identity';
export const editorGrants: EmployeeGrant[] = ['workspace:read', 'campaign:write', 'creative:generate', 'asset:read:all'];
export const reviewerGrants: EmployeeGrant[] = ['workspace:read', 'campaign:write', 'asset:review', 'asset:publish', 'asset:read:all'];
export const pilotTime = '2030-11-12T20:00:00.000Z';
export async function marketingSessionFixture(port?: number, publicOrigin?: string, reportingFactory?: (directory: string) => ReportingService) {
  const root = mkdtempSync(join(tmpdir(), 'dizzle-marketing-session-')), db = join(root, 'identity.sqlite');
  migrateIdentity(db); let clock = Date.now(); const identity = new IdentityStore(db, () => clock);
  for (const [id, organizationId, grants] of [['sales-editor-17', 'pilot-org', editorGrants], ['sales-reviewer-42', 'pilot-org', reviewerGrants], ['other-org', 'other-org', reviewerGrants]] as const)
    identity.provision({ id, organizationId, ...principal('google-' + id), active: true, grants: [...grants] }, 'fixture-operator');
  if (!port) { const reserve = createServer(); reserve.listen(0, '127.0.0.1'); await once(reserve, 'listening'); port = (reserve.address() as AddressInfo).port; await new Promise<void>(resolve => reserve.close(() => resolve())); }
  const base = 'http://127.0.0.1:' + port, google = new FixtureGoogle();
  const queue = new PublishingQueue(join(root, 'publishing.sqlite')); let pilot = new SinglePostPilot(join(root, 'pilot-control.sqlite'));
  const account = { ...testAccounts[1], handle: '@cheddrco_' };
  let accountReads = 0; const controls = { unavailable: false, onAccountRead: (_count: number) => {} };
  const server = createApi(undefined, { reporting: reportingFactory?.(root), generator: new TestImageGenerator(), drafter: new TestCaptionDrafter(), store: new MarketingStore(join(root, 'marketing')), publishingQueue: queue, accounts: [account],
    resolveAccount: () => { controls.onAccountRead(++accountReads); if (controls.unavailable) throw new Error('Fixture authorization unavailable'); return account; },
    authentication: { store: identity, google, origin: publicOrigin ?? base, workerOrigin: base, organizationId: 'pilot-org', allowLoopbackHttp: true } });
  server.listen(port, '127.0.0.1'); await once(server, 'listening');
  async function close() { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); identity.close(); pilot.close(); rmSync(root, { recursive: true, force: true }); }
  async function login(id = 'sales-editor-17') {
    google.selected = principal('google-' + id);
    const start = await fetch(base + '/api/auth/google/start', { method: 'POST', headers: { Origin: base }, redirect: 'manual' });
    const state = new URL(start.headers.get('location')!).searchParams.get('state')!;
    const callback = await fetch(base + '/api/auth/google/callback?' + new URLSearchParams({ code: 'verified-fixture-code', state }), { redirect: 'manual', headers: { Cookie: start.headers.getSetCookie()[0].split(';')[0] } });
    const cookie = callback.headers.getSetCookie().find(c => c.startsWith('__Host-dizzle_session='))?.split(';')[0] ?? '';
    const session = cookie ? await (await fetch(base + '/api/auth/session', { headers: { Cookie: cookie } })).json() : null;
    return { cookie, csrf: session?.csrfToken ?? '', status: callback.status, session };
  }
  async function request(path: string, actor: Awaited<ReturnType<typeof login>>, payload?: unknown, method?: string, extra: Record<string, string> = {}) {
    return fetch(base + '/api' + path, { method: method ?? (payload === undefined ? 'GET' : 'POST'), headers: { Cookie: actor.cookie, Origin: base, 'X-CSRF-Token': actor.csrf, ...(payload === undefined ? {} : { 'Content-Type': 'application/json' }), ...extra }, ...(payload === undefined ? {} : { body: JSON.stringify(payload) }) });
  }
  return { root, db, identity, queue, get pilot() { return pilot; }, set pilot(value: SinglePostPilot) { pilot = value; }, server, base, google, account, controls, login, request, close, advance: (milliseconds: number) => { clock += milliseconds; } };
}
export async function approvedFixtureJob(f: Awaited<ReturnType<typeof marketingSessionFixture>>) {
  const editor = await f.login(), reviewer = await f.login('sales-reviewer-42');
  const ok = async (r: Response) => { const body = await r.json(); if (!r.ok) throw new Error(JSON.stringify(body)); return body; };
  const campaign = await ok(await f.request('/marketing/campaigns', editor, { brandId: 'cheddr', title: 'Session pilot', objective: 'Isolated publishing proof', owner: 'Test employee' }));
  const generation = await ok(await f.request('/marketing/generation-jobs', editor, { brandId: 'cheddr', campaignId: campaign.id, prompt: 'Test image', referenceAssetIds: [], width: 64, height: 64, requestKey: crypto.randomUUID(), simulateTransientError: false }));
  let workspace: any;
  for (let attempt = 0; attempt < 100; attempt++) {
    workspace = await ok(await f.request('/marketing/workspace', editor));
    if (workspace.generationJobs.find((job: any) => job.id === generation.id)?.status === 'succeeded') break;
    await new Promise(resolve => setTimeout(resolve, 5));
  }
  const asset = workspace.assets.find((a: any) => a.id === generation.assetId), version = asset.versions[0];
  await ok(await f.request(`/marketing/versions/${version.id}/submit`, editor, {}));
  await ok(await f.request(`/marketing/versions/${version.id}/review`, reviewer, { decision: 'approve' }));
  const input = { campaignId: campaign.id, title: 'Approved pilot', objective: 'One post', owner: 'Test employee', channel: 'X', destinationAccountId: f.account.id, destinationAccount: f.account.handle, plannedAt: pilotTime, caption: 'Fixture-only Cheddr pilot caption.', linkedAssetId: asset.id, linkedVersionId: version.id };
  const content = await ok(await f.request('/marketing/content', editor, input));
  await ok(await f.request(`/marketing/content/${content.id}/submit`, editor, {}));
  await ok(await f.request(`/marketing/content/${content.id}/review`, reviewer, { decision: 'approve' }));
  await ok(await f.request(`/marketing/content/${content.id}/schedule`, editor, {}));
  const job = f.queue.list().find(job => job.payload.contentId === content.id)!;
  return { job, editor, reviewer, asset, version, content, input };
}
