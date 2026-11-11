import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { Workflow } from '../server/workflow';
import { MarketingService } from '../server/marketing';
import { MarketingStore } from '../server/marketing-store';
import { createApi } from '../server/api';
import type { BrandKit } from '../shared/contracts';
import { TestImageGenerator } from './fixtures/image-generator';

const fields = (kit: BrandKit) => ({ expectedRevision: kit.revision, imageType: kit.imageType, visualStyle: kit.visualStyle, palette: kit.palette,
  typography: kit.typography, logoRules: kit.logoRules, avoid: kit.avoid, guidelines: kit.guidelines, defaultReferenceIds: kit.defaultReferenceIds, referenceCategories: kit.referenceCategories });

describe('saved brand direction', () => {
  function setup(directory?: string) {
    const workflow = new Workflow(), generator = new TestImageGenerator();
    const service = new MarketingService(workflow, generator, directory ? new MarketingStore(directory) : undefined);
    const author = workflow.authenticate('marketing');
    const kit = service.workspace(author).brandKits.find(item => item.brandId === 'cheddr')!;
    const reference = service.workspace(author).assets.find(asset => asset.kind === 'reference' && asset.brandId === 'cheddr')!;
    const request = { brandId: 'cheddr', campaignId: 'campaign-cheddr-launch', prompt: 'A product hero image', width: 128, height: 160, referenceAssetIds: [], requestKey: crypto.randomUUID(), simulateTransientError: false };
    return { workflow, generator, service, author, kit, reference, request };
  }

  it('always composes saved rules and defaults on the server and snapshots the exact revision', async () => {
    const { service, author, kit, reference, generator, request } = setup();
    service.updateBrandKit(author, 'cheddr', { ...fields(kit), visualStyle: 'Matte charcoal, soft red side lighting', palette: '#111111, #b62030', logoRules: 'Keep the original logo proportions', defaultReferenceIds: [reference.id], referenceCategories: { [reference.id]: 'logo' } });
    const job = service.createGeneration(author, request);
    await vi.waitFor(() => expect(generator.calls).toHaveLength(1));
    expect(generator.calls[0].prompt).toContain('Matte charcoal, soft red side lighting');
    expect(generator.calls[0].prompt).toContain('Keep the original logo proportions');
    expect(generator.calls[0].prompt).toContain('Image 1: ' + reference.title + ' (logo reference)');
    expect(generator.calls[0].references).toHaveLength(1);
    expect(job.referenceAssetIds).toEqual([reference.id]);
    expect(job.brandKitSnapshot?.revision).toBe(1);
    const current = service.workspace(author).brandKits.find(item => item.brandId === 'cheddr')!;
    service.updateBrandKit(author, 'cheddr', { ...fields(current), visualStyle: 'Bright white studio' });
    expect(service.workspace(author).generationJobs[0].effectivePrompt).not.toContain('Bright white studio');
    expect(service.createGeneration(author, request).id).toBe(job.id);
    expect(generator.calls).toHaveLength(1);
  });

  it('persists kits with the original library, blocks stale edits and leaves other brands untouched', () => {
    const directory = mkdtempSync(join(tmpdir(), 'dizzle-brand-kits-'));
    try {
      const { service, workflow, generator, author, kit, reference } = setup(directory);
      service.updateBrandKit(author, 'cheddr', { ...fields(kit), visualStyle: 'Editorial glass photography', defaultReferenceIds: [reference.id], referenceCategories: { [reference.id]: 'style' } });
      expect(() => service.updateBrandKit(author, 'cheddr', { ...fields(kit), visualStyle: 'Stale overwrite' })).toThrow('changed');
      const loaded = new MarketingService(workflow, generator, new MarketingStore(directory));
      expect(loaded.workspace(author).brandKits.find(item => item.brandId === 'cheddr')).toMatchObject({ revision: 1, visualStyle: 'Editorial glass photography', defaultReferenceIds: [reference.id] });
      expect(loaded.workspace(author).brandKits.find(item => item.brandId === 'dizzle')).toMatchObject({ revision: 0, visualStyle: '', defaultReferenceIds: [] });
      expect(loaded.marketingFile(author, reference.versions[0].id).body).toBeTruthy();
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });

  it('retries with the original saved kit even after brand rules change', async () => {
    const { service, author, kit, reference, generator, request } = setup();
    const saved = service.updateBrandKit(author, 'cheddr', { ...fields(kit), visualStyle: 'Original burgundy lighting', defaultReferenceIds: [reference.id] });
    const failed = service.createGeneration(author, { ...request, simulateTransientError: true });
    service.updateBrandKit(author, 'cheddr', { ...fields(saved), visualStyle: 'New white lighting', defaultReferenceIds: [] });
    service.retryGeneration(author, failed.id, crypto.randomUUID());
    await vi.waitFor(() => expect(generator.calls).toHaveLength(1));
    expect(generator.calls[0].prompt).toContain('Original burgundy lighting');
    expect(generator.calls[0].prompt).not.toContain('New white lighting');
    expect(generator.calls[0].references).toHaveLength(1);
  });

  it('validates brand reference ownership and prevents defaults plus extras from exceeding the image limit', async () => {
    const { service, author, kit, reference, request, generator } = setup();
    const other = service.workspace(author).assets.find(asset => asset.kind === 'creative')!;
    expect(() => service.updateBrandKit(author, 'cheddr', { ...fields(kit), defaultReferenceIds: [other.id] })).toThrow('must belong');
    expect(() => service.updateBrandKit(author, 'dizzle', { ...fields(kit), defaultReferenceIds: [reference.id] })).toThrow('must belong');
    const png = await generator.generate({ prompt: 'Test', width: 8, height: 8, requestKey: crypto.randomUUID(), references: [] });
    const refs = [reference.id];
    for (let i = 0; i < 4; i++) refs.push((await service.uploadReference(author, { brandId: 'cheddr', title: 'Reference ' + i, base64: png.body.toString('base64') })).id);
    service.updateBrandKit(author, 'cheddr', { ...fields(kit), defaultReferenceIds: refs.slice(0, 4) });
    expect(() => service.createGeneration(author, { ...request, referenceAssetIds: [refs[4]] })).toThrow('exceed four');
    expect(service.workspace(author).generationJobs).toHaveLength(0);
  });
});

describe('brand kit HTTP permissions', () => {
  let server: ReturnType<typeof createApi>, base: string;
  beforeEach(async () => { server = createApi(undefined, { generator: new TestImageGenerator() }); server.listen(0, '127.0.0.1'); await once(server, 'listening'); base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`; });
  afterEach(async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); });
  it('allows granted authors, denies forged/ungranted/disabled/foreign actors and does not broaden library visibility', async () => {
    const headers = { 'X-Demo-Identity': 'marketing' };
    const workspace = await (await fetch(base + '/api/marketing/workspace', { headers })).json();
    const kit = workspace.brandKits.find((item: BrandKit) => item.brandId === 'cheddr');
    for (const actor of ['manager', 'admin', 'rep-a', 'warehouse', 'disabled', 'revoked', 'outside']) {
      const response = await fetch(base + '/api/marketing/brand-kits/cheddr', { method: 'PUT', headers: { 'X-Demo-Identity': actor, 'Content-Type': 'application/json' }, body: JSON.stringify({ ...fields(kit), visualStyle: 'Forbidden style' }) });
      expect(response.ok).toBe(false);
      expect((await fetch(base + '/api/marketing/workspace', { headers: { 'X-Demo-Identity': actor } })).ok).toBe(false);
    }
    const response = await fetch(base + '/api/marketing/brand-kits/cheddr', { method: 'PUT', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ ...fields(kit), visualStyle: 'Approved local author edit' }) });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ revision: 1, updatedBy: 'marketing' });
  });
});
