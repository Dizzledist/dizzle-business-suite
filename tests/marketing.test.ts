import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { createApi } from '../server/api';
import { Workflow } from '../server/workflow';

describe('fixture-backed marketing workflow', () => {
  let server: ReturnType<typeof createApi>;
  let base: string;
  let workflow: Workflow;
  beforeEach(async () => {
    workflow = new Workflow();
    server = createApi(workflow);
    server.listen(0, '127.0.0.1'); await once(server, 'listening');
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterEach(async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); });
  async function request(path: string, actor = 'marketing', payload?: unknown, method?: string) {
    return fetch(`${base}/api${path}`, {
      method: method ?? (payload === undefined ? 'GET' : 'POST'),
      headers: { 'X-Demo-Identity': actor, ...(payload === undefined ? {} : { 'Content-Type': 'application/json' }) },
      ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
    });
  }
  const generation = (workspace: any, overrides: Record<string, unknown> = {}) => ({
    brandId: 'cheddr', campaignId: workspace.campaigns[0].id, prompt: 'Autumn product launch, rich crimson studio light',
    referenceAssetIds: workspace.assets.filter((asset: any) => asset.kind === 'reference').map((asset: any) => asset.id),
    width: 1080, height: 1350, simulateTransientError: false, ...overrides,
  });

  it('creates content, requires exact review, and schedules only the approved snapshot', async () => {
    const workspace = await (await request('/marketing/workspace')).json();
    const campaignResponse = await request('/marketing/campaigns', 'marketing', {
      brandId: 'cheddr', title: 'Winter launch', objective: 'Introduce the seasonal line.', owner: 'Marketing editor',
    });
    const campaignBody = await campaignResponse.json();
    expect(campaignResponse.status, JSON.stringify(campaignBody)).toBe(201);
    const campaign = campaignBody;
    const input = { campaignId: campaign.id, title: 'Winter teaser', objective: 'Awareness', owner: 'Marketing editor',
      channel: 'Instagram', plannedAt: '2026-11-18T19:00:00.000Z', destinationAccount: '@cheddr', caption: 'A new season is coming.', linkedAssetId: null, linkedVersionId: null };
    const contentResponse = await request('/marketing/content', 'marketing', input);
    const item = await contentResponse.json();
    expect(contentResponse.status, JSON.stringify(item)).toBe(201);
    expect(item.status).toBe('draft');
    expect((await request(`/marketing/content/${item.id}/schedule`, 'marketing', {})).status).toBe(409);
    await request(`/marketing/content/${item.id}/submit`, 'marketing', {});
    expect((await request(`/marketing/content/${item.id}/review`, 'marketing', { decision: 'approve', notes: '' })).status).toBe(403);
    expect((await request(`/marketing/content/${item.id}/review`, 'owner', { decision: 'approve', notes: 'Approved for the named account.' })).status).toBe(200);
    const changed = { ...input, caption: 'Changed after approval.' };
    expect((await request(`/marketing/content/${item.id}`, 'marketing', changed, 'PATCH')).status).toBe(200);
    expect((await request(`/marketing/content/${item.id}/schedule`, 'marketing', {})).status).toBe(409);
    await request(`/marketing/content/${item.id}/submit`, 'marketing', {});
    await request(`/marketing/content/${item.id}/review`, 'owner', { decision: 'approve', notes: '' });
    expect((await request(`/marketing/content/${item.id}/schedule`, 'marketing', {})).status).toBe(200);
    expect(workspace.brands.map((brand: any) => brand.id)).toContain('cheddr');
  });

  it('keeps generation input and each output version distinct, supports retry, and blocks unapproved publication', async () => {
    const workspace = await (await request('/marketing/workspace')).json();
    const first = await (await request('/marketing/generation-jobs', 'marketing', generation(workspace, { simulateTransientError: true }))).json();
    expect(first).toMatchObject({ status: 'failed', attempts: 1, prompt: 'Autumn product launch, rich crimson studio light' });
    const retried = await (await request(`/marketing/generation-jobs/${first.id}/retry`, 'marketing', {})).json();
    expect(retried).toMatchObject({ status: 'succeeded', attempts: 2, referenceAssetIds: first.referenceAssetIds });
    expect(retried.versionId).toBeTruthy();
    expect((await request(`/marketing/versions/${retried.versionId}/publish`, 'owner', { audienceMode: 'all', repIds: [] })).status).toBe(409);
    expect((await request(`/assets/${first.assetId}/versions/${retried.versionId}/file`, 'rep-a')).status).toBe(404);
    expect((await request(`/marketing/versions/${retried.versionId}/review`, 'marketing', { decision: 'approve', notes: '' })).status).toBe(403);
    await request(`/marketing/versions/${retried.versionId}/submit`, 'marketing', {});
    await request(`/marketing/versions/${retried.versionId}/review`, 'owner', { decision: 'approve', notes: 'Reviewed version 1.' });
    const publish = { audienceMode: 'selected', repIds: ['rep-a'] };
    const firstPublication = await (await request(`/marketing/versions/${retried.versionId}/publish`, 'owner', publish)).json();
    const duplicate = await (await request(`/marketing/versions/${retried.versionId}/publish`, 'owner', publish)).json();
    expect(duplicate.id).toBe(firstPublication.id);
    expect((await request('/assets', 'rep-a')).status).toBe(200);
    expect((await request(`/assets/${first.assetId}/versions/${retried.versionId}/file`, 'rep-a')).status).toBe(200);
    expect((await request(`/assets/${first.assetId}/versions/${retried.versionId}/file`, 'rep-b')).status).toBe(404);
  });

  it('filters account-restricted price lists by the existing rep assignment on lists and direct URLs', async () => {
    const list = await (await request('/assets', 'rep-a')).json();
    const price = list.assets.find((asset: any) => asset.kind === 'price_list');
    expect(price).toBeTruthy();
    const repBAssets = await (await request('/assets', 'rep-b')).json();
    expect(repBAssets.assets.some((asset: any) => asset.assetId === price.assetId)).toBe(false);
    expect((await request(`/assets/${price.assetId}/versions/${price.versionId}/file`, 'rep-b')).status).toBe(404);
    expect((await request(`/assets/${price.assetId}/versions/${price.versionId}/file`, 'rep-a')).status).toBe(200);
    expect((await request('/marketing/workspace', 'manager')).status).toBe(403);
  });

  it('denies disabled, revoked, foreign, and ungranted callers on lists, files, generation and publication', async () => {
    const workspace = await (await request('/marketing/workspace', 'owner')).json();
    const creative = workspace.assets.find((asset: any) => asset.kind === 'creative');
    for (const actor of ['disabled', 'revoked', 'outside', 'warehouse', 'manager', 'admin', 'rep-a']) {
      expect((await request('/marketing/workspace', actor)).ok).toBe(false);
      expect((await request(`/marketing/versions/${creative.versions[0].id}/file`, actor)).ok).toBe(false);
      expect((await request('/marketing/generation-jobs', actor, generation(workspace))).ok).toBe(false);
      expect((await request(`/marketing/versions/${creative.versions[0].id}/publish`, actor, { audienceMode: 'all', repIds: [] })).ok).toBe(false);
    }
    const editorWorkspace = await (await request('/marketing/workspace')).json();
    expect(editorWorkspace.assets.some((asset: any) => ['price_list', 'coa'].includes(asset.kind))).toBe(false);
    const price = workspace.assets.find((asset: any) => asset.kind === 'price_list');
    expect((await request(`/marketing/versions/${price.versions[0].id}/file`)).status).toBe(404);
    expect((await request('/invoices/inv-open')).status).toBe(404);
    expect((await (await request('/workspace')).json()).invoices).toEqual([]);
  });

  it('snapshots all recipients, intersects restricted documents with current assignments, and revokes future reads', async () => {
    const workspace = await (await request('/marketing/workspace', 'owner')).json();
    const price = workspace.assets.find((asset: any) => asset.kind === 'price_list');
    expect((await request(`/marketing/versions/${price.versions[0].id}/publish`, 'owner', { audienceMode: 'selected', repIds: ['rep-b'] })).status).toBe(403);
    const publication = await (await request(`/marketing/versions/${price.versions[0].id}/publish`, 'owner', { audienceMode: 'all', repIds: [] })).json();
    expect(publication.repIds).toEqual(['rep-a']);
    const lateRep = { ...workflow.identities.find(actor => actor.id === 'rep-a')!, id: 'late-rep' };
    workflow.identities.push(lateRep);
    const images = await (await request('/assets', 'late-rep')).json();
    expect(images.assets).toEqual([]);
    const file = `/assets/${price.id}/versions/${price.versions[0].id}/file`;
    expect((await request(file, 'rep-a')).status).toBe(200);
    const rep = workflow.identities.find(actor => actor.id === 'rep-a')!;
    rep.marketingGrants = [];
    expect((await request(file, 'rep-a')).status).toBe(404);
    rep.marketingGrants = ['asset:read:published'];
    for (const entry of [...price.publications, publication]) {
      expect((await request(`/marketing/publications/${entry.id}/retire`, 'owner', { reason: 'Superseded sample' })).status).toBe(200);
    }
    expect((await request(file, 'rep-a')).status).toBe(404);
    expect((await (await request('/assets', 'rep-a')).json()).assets.some((asset: any) => asset.assetId === price.id)).toBe(false);
  });

  it('creates new draft variations without overwriting approved bytes or original references', async () => {
    const workspace = await (await request('/marketing/workspace')).json();
    const original = workspace.assets.find((asset: any) => asset.kind === 'reference');
    const originalFile = await (await request(`/marketing/versions/${original.versions[0].id}/file`)).text();
    const first = await (await request('/marketing/generation-jobs', 'marketing', generation(workspace))).json();
    await request(`/marketing/versions/${first.versionId}/submit`, 'marketing', {});
    await request(`/marketing/versions/${first.versionId}/review`, 'owner', { decision: 'approve', notes: 'Version one' });
    const bytes = await (await request(`/marketing/versions/${first.versionId}/file`)).text();
    const second = await (await request('/marketing/generation-jobs', 'marketing', generation(workspace, { assetId: first.assetId, prompt: 'Changed scene' }))).json();
    expect(second.assetId).toBe(first.assetId);
    expect(second.versionId).not.toBe(first.versionId);
    expect((await request(`/marketing/versions/${second.versionId}/publish`, 'owner', { audienceMode: 'all', repIds: [] })).status).toBe(409);
    expect(await (await request(`/marketing/versions/${first.versionId}/file`)).text()).toBe(bytes);
    expect(await (await request(`/marketing/versions/${original.versions[0].id}/file`)).text()).toBe(originalFile);
    expect((await request('/marketing/generation-jobs', 'marketing', generation(workspace, { assetId: original.id }))).status).toBe(400);
  });

  it('blocks self-review and invalid generation and clears approval when destination or time changes', async () => {
    const workspace = await (await request('/marketing/workspace', 'owner')).json();
    const first = await (await request('/marketing/generation-jobs', 'owner', generation(workspace))).json();
    await request(`/marketing/versions/${first.versionId}/submit`, 'owner', {});
    expect((await request(`/marketing/versions/${first.versionId}/review`, 'owner', { decision: 'approve', notes: '' })).status).toBe(403);
    expect((await request('/marketing/generation-jobs', 'marketing', generation(workspace, { width: 0 }))).status).toBe(400);
    expect((await request('/marketing/generation-jobs', 'marketing', generation(workspace, { brandId: 'puffr' }))).status).toBe(400);
    const input = { campaignId: workspace.campaigns[0].id, title: 'Approval changes', objective: 'Awareness', owner: 'Marketing', channel: 'Instagram', plannedAt: '2026-11-18T19:00:00.000Z', destinationAccount: '@cheddr', caption: 'Exact caption', linkedAssetId: null, linkedVersionId: null };
    const item = await (await request('/marketing/content', 'marketing', input)).json();
    await request(`/marketing/content/${item.id}/submit`, 'marketing', {});
    await request(`/marketing/content/${item.id}/review`, 'owner', { decision: 'return', notes: 'Adjust destination' });
    const returned = await (await request('/marketing/workspace')).json();
    expect(returned.content.find((entry: any) => entry.id === item.id)).toMatchObject({ status: 'draft', reviewNote: 'Adjust destination' });
    await request(`/marketing/content/${item.id}/submit`, 'marketing', {});
    await request(`/marketing/content/${item.id}/review`, 'owner', { decision: 'approve', notes: '' });
    const changed = await (await request(`/marketing/content/${item.id}`, 'owner', { ...input, destinationAccount: '@other', plannedAt: '2026-11-19T19:00:00.000Z' }, 'PATCH')).json();
    expect(changed).toMatchObject({ status: 'draft', approvalSnapshot: null, editedBy: 'owner' });
    await request(`/marketing/content/${item.id}/submit`, 'owner', {});
    expect((await request(`/marketing/content/${item.id}/review`, 'owner', { decision: 'approve', notes: '' })).status).toBe(403);
    expect((await request(`/marketing/content/${item.id}/schedule`, 'owner', {})).status).toBe(409);
  });
});
