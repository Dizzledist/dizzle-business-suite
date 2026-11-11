import { describe, expect, it, vi } from 'vitest';
import sharp from 'sharp';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { OpenAIImageGenerator, ImageGenerationError, type ImageRequest } from '../server/image-generation';
import { MarketingService } from '../server/marketing';
import { MarketingStore } from '../server/marketing-store';
import { Workflow } from '../server/workflow';
import { TestImageGenerator } from './fixtures/image-generator';
import { createApi } from '../server/api';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';

const key = 'isolated-test-secret-never-a-real-key';
const input = (): ImageRequest => ({ prompt: 'Crimson studio campaign', width: 1080, height: 1350, references: [], requestKey: crypto.randomUUID() });
async function png() { return sharp({ create: { width: 32, height: 32, channels: 3, background: '#bc384a' } }).png().toBuffer(); }
async function success() { return new Response(JSON.stringify({ data: [{ b64_json: (await png()).toString('base64') }], usage: { input_tokens: 10, output_tokens: 20, total_tokens: 30 } }), { headers: { 'x-request-id': 'req-test-123' } }); }

describe('OpenAI raster adapter', () => {
  it('posts one server-authenticated image request and returns an exact-size PNG with provenance and usage', async () => {
    const transport = vi.fn(async () => success());
    const generator = new OpenAIImageGenerator({ OPENAI_API_KEY: key }, transport as typeof fetch);
    const request = input();
    const image = await generator.generate(request);
    expect(transport).toHaveBeenCalledTimes(1);
    const [url, options] = transport.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.openai.com/v1/images/generations');
    expect(options.headers).toMatchObject({ Authorization: `Bearer ${key}`, 'X-Client-Request-Id': request.requestKey });
    expect(JSON.parse(options.body as string)).toMatchObject({ model: 'gpt-image-2.6-sunburst', n: 1, quality: 'medium', size: '1024x1536', output_format: 'png' });
    expect(image.body.subarray(1, 4).toString()).toBe('PNG');
    expect(await sharp(image.body).metadata()).toMatchObject({ width: 1080, height: 1350, format: 'png', hasAlpha: true });
    expect(image).toMatchObject({ requestId: 'req-test-123', usage: { totalTokens: 30 }, providerSize: '32x32' });
    expect(JSON.stringify(image)).not.toContain(key);
  });

  it('sends reference bytes as PNG multipart inputs through image edits instead of ignoring them', async () => {
    const transport = vi.fn(async () => success());
    const generator = new OpenAIImageGenerator({ OPENAI_API_KEY: key, OPENAI_IMAGE_MODEL: 'gpt-image-1.5', OPENAI_IMAGE_QUALITY: 'low' }, transport as typeof fetch);
    const reference = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" fill="red"/></svg>');
    await generator.generate({ ...input(), references: [{ body: reference, mimeType: 'image/svg+xml' }] });
    const [url, options] = transport.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.openai.com/v1/images/edits');
    const form = options.body as FormData;
    expect(form.get('model')).toBe('gpt-image-1.5');
    const file = form.get('image[]') as File;
    expect(file.type).toBe('image/png');
    expect(Buffer.from(await file.arrayBuffer()).subarray(1, 4).toString()).toBe('PNG');
  });

  it.each([[401, true, false], [403, true, false], [429, true, false], [500, false, true], [400, false, false]])('sanitizes provider error %s without automatic retry', async (status, retryable, outcomeUnknown) => {
    const transport = vi.fn(async () => new Response(JSON.stringify({ error: { message: key } }), { status }));
    const generator = new OpenAIImageGenerator({ OPENAI_API_KEY: key }, transport as typeof fetch);
    const error = await generator.generate(input()).catch(error => error);
    expect(error).toBeInstanceOf(ImageGenerationError);
    expect(error).toMatchObject({ retryable, outcomeUnknown });
    expect(error.message).not.toContain(key);
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it('fails closed with no configured key, timeout, unsupported model, and malformed image data', async () => {
    const transport = vi.fn(async () => success());
    const missing = new OpenAIImageGenerator({}, transport as typeof fetch);
    expect(missing.ready).toBe(false);
    await expect(missing.generate(input())).rejects.toMatchObject({ outcomeUnknown: false });
    expect(transport).not.toHaveBeenCalled();
    expect(new OpenAIImageGenerator({ OPENAI_API_KEY: key, OPENAI_IMAGE_MODEL: 'unreviewed-model' }).ready).toBe(false);
    const timedOut = new OpenAIImageGenerator({ OPENAI_API_KEY: key }, vi.fn(async () => { throw new Error(key); }) as typeof fetch);
    await expect(timedOut.generate(input())).rejects.toMatchObject({ outcomeUnknown: true, retryable: false });
    const invalid = new OpenAIImageGenerator({ OPENAI_API_KEY: key }, vi.fn(async () => new Response(JSON.stringify({ data: [{ b64_json: Buffer.from('<svg/>').toString('base64') }] }))) as typeof fetch);
    await expect(invalid.generate(input())).rejects.toMatchObject({ outcomeUnknown: true, retryable: false });
  });
});

describe('saved generation workflow', () => {
  it('rejects unconfigured generation at the API without creating a job or calling a provider', async () => {
    const transport = vi.fn(async () => success());
    const server = createApi(undefined, { generator: new OpenAIImageGenerator({}, transport as typeof fetch) });
    server.listen(0, '127.0.0.1'); await once(server, 'listening');
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    try {
      const headers = { 'X-Demo-Identity': 'marketing', 'Content-Type': 'application/json' };
      const result = await fetch(base + '/api/marketing/generation-jobs', { method: 'POST', headers, body: JSON.stringify({ brandId: 'cheddr', campaignId: 'campaign-cheddr-launch', prompt: 'Product artwork', width: 1080, height: 1350, referenceAssetIds: [], requestKey: crypto.randomUUID() }) });
      expect(result.status).toBe(503);
      const workspace = await (await fetch(base + '/api/marketing/workspace', { headers })).json();
      expect(workspace.imageGeneration.ready).toBe(false);
      expect(workspace.generationJobs).toHaveLength(0);
      expect(transport).not.toHaveBeenCalled();
    } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
  });
  function setup(directory?: string, generator = new TestImageGenerator()) {
    const workflow = new Workflow();
    const service = new MarketingService(workflow, generator, directory ? new MarketingStore(directory) : undefined);
    const author = workflow.authenticate('marketing');
    const owner = workflow.authenticate('owner');
    const request = { brandId: 'cheddr', campaignId: service.workspace(author).campaigns[0].id, prompt: 'Campaign photo', width: 128, height: 160,
      referenceAssetIds: [], requestKey: crypto.randomUUID(), simulateTransientError: false };
    return { workflow, service, author, owner, request, generator };
  }
  async function finish(service: MarketingService, author: ReturnType<Workflow['authenticate']>, id: string) {
    await vi.waitFor(() => expect(service.workspace(author).generationJobs.find(job => job.id === id)?.status).not.toBe('running'));
    return service.workspace(author).generationJobs.find(job => job.id === id)!;
  }

  it('deduplicates concurrent/replayed commands across restarts and preserves approved protected PNG bytes', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'dizzle-images-'));
    try {
      const { service, workflow, author, owner, request, generator } = setup(directory);
      const start = service.createGeneration(author, request);
      expect(service.createGeneration(author, request).id).toBe(start.id);
      expect(() => service.createGeneration(author, { ...request, prompt: 'Changed' })).toThrow('different generation settings');
      expect(() => service.createGeneration(author, { ...request, requestKey: crypto.randomUUID() })).toThrow('already generating');
      const job = await finish(service, author, start.id);
      expect(generator.calls).toHaveLength(1);
      expect(() => service.publishedFile(workflow.authenticate('rep-a'), job.assetId, job.versionId!)).toThrow();
      service.submitVersion(author, job.versionId!); service.reviewVersion(owner, job.versionId!, 'approve', 'Approved PNG');
      service.publishVersion(owner, job.versionId!, 'selected', ['rep-a']);
      const original = service.publishedFile(workflow.authenticate('rep-a'), job.assetId, job.versionId!).body;
      const loaded = new MarketingService(workflow, generator, new MarketingStore(directory));
      expect(loaded.createGeneration(author, request).id).toBe(job.id);
      expect(generator.calls).toHaveLength(1);
      expect(loaded.publishedFile(workflow.authenticate('rep-a'), job.assetId, job.versionId!).body).toEqual(original);
      expect(() => loaded.publishedFile(workflow.authenticate('rep-b'), job.assetId, job.versionId!)).toThrow();
      loaded.reset();
      expect(loaded.workspace(author).generationJobs).toHaveLength(1);
      expect(readFileSync(join(directory, 'state.json'), 'utf8')).not.toContain(key);
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });

  it('recovers interrupted jobs as uncertain and blocks blind retry', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'dizzle-interrupted-'));
    try {
      const generator = new TestImageGenerator();
      generator.generate = () => new Promise(() => {});
      const { service, workflow, author, request } = setup(directory, generator);
      const job = service.createGeneration(author, request);
      const recovered = new MarketingService(workflow, new TestImageGenerator(), new MarketingStore(directory));
      expect(recovered.workspace(author).generationJobs[0]).toMatchObject({ status: 'failed', outcomeUnknown: true, retryable: false });
      expect(() => recovered.retryGeneration(author, job.id, crypto.randomUUID())).toThrow('cannot be retried safely');
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });

  it('limits paid-attempt frequency and deduplicates retry clicks', async () => {
    const { service, author, request, generator } = setup();
    const failed = service.createGeneration(author, { ...request, simulateTransientError: true });
    const retryKey = crypto.randomUUID();
    service.retryGeneration(author, failed.id, retryKey);
    service.retryGeneration(author, failed.id, retryKey);
    expect((await finish(service, author, failed.id)).attempts).toBe(2);
    expect(generator.calls).toHaveLength(1);
    for (let i = 0; i < 8; i++) {
      const job = service.createGeneration(author, { ...request, requestKey: crypto.randomUUID() });
      await finish(service, author, job.id);
    }
    expect(service.workspace(author).imageGeneration.remainingAttempts).toBe(0);
    expect(() => service.createGeneration(author, { ...request, requestKey: crypto.randomUUID() })).toThrow('10 image attempts');
  });

  it('accepts real raster references and denies invalid files and non-marketing uploaders', async () => {
    const { service, author, workflow } = setup();
    const original = (await png()).toString('base64');
    const asset = await service.uploadReference(author, { brandId: 'cheddr', title: 'Product reference', base64: original });
    expect(asset.versions[0].mimeType).toBe('image/png');
    expect(service.marketingFile(author, asset.versions[0].id).body).toBeInstanceOf(Buffer);
    const jpeg = await sharp(await png()).jpeg().toBuffer();
    const uploaded = await service.uploadReference(author, { brandId: 'cheddr', title: 'Original JPEG', base64: jpeg.toString('base64') });
    expect(uploaded.versions[0].mimeType).toBe('image/jpeg');
    expect(service.marketingFile(author, uploaded.versions[0].id).body).toEqual(jpeg);
    await expect(service.uploadReference(author, { brandId: 'cheddr', title: 'Invalid', base64: Buffer.from('<svg/>').toString('base64') })).rejects.toThrow('PNG, JPEG or WebP');
    await expect(service.uploadReference(workflow.authenticate('rep-a'), { brandId: 'cheddr', title: 'Forbidden', base64: original })).rejects.toThrow('not authorized');
  });
});
