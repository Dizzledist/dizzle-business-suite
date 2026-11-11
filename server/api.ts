import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { z } from 'zod';
import { localPorts } from '../shared/local-ports';
import { demoEvents } from '../shared/contracts';
import { ApiError, Workflow } from './workflow';
import { MarketingService } from './marketing';
import type { ImageGenerator } from './image-generation';
import { MarketingStore } from './marketing-store';

const releaseSchema = z.object({
  reason: z.string().trim().min(1).max(500), termsId: z.string().min(1).max(100),
  requestKey: z.string().min(1).max(150), expectedRevision: z.number().int().positive(),
}).strict();
const eventSchema = z.object({ event: z.enum(demoEvents) }).strict();
const campaignSchema = z.object({ brandId: z.string().min(1), title: z.string().trim().min(1).max(160), objective: z.string().trim().min(1).max(1000), owner: z.string().trim().min(1).max(100) }).strict();
const contentSchema = z.object({
  campaignId: z.string().min(1), title: z.string().trim().min(1).max(160), objective: z.string().trim().min(1).max(1000),
  owner: z.string().trim().min(1).max(100), channel: z.string().trim().min(1).max(80),
  plannedAt: z.string().datetime(), destinationAccount: z.string().trim().min(1).max(160),
  caption: z.string().trim().min(1).max(5000), linkedAssetId: z.string().nullable(), linkedVersionId: z.string().nullable(),
}).strict();
const reviewSchema = z.object({ decision: z.enum(['approve', 'return']), notes: z.string().max(2000).default('') }).strict();
const generationSchema = z.object({
  brandId: z.string().min(1), campaignId: z.string().min(1), prompt: z.string().trim().min(1).max(2000),
  referenceAssetIds: z.array(z.string()).max(12), width: z.number().int().min(64).max(4096), height: z.number().int().min(64).max(4096),
  simulateTransientError: z.boolean().default(false), assetId: z.string().optional(), requestKey: z.string().uuid(),
}).strict();
const retrySchema = z.object({ requestKey: z.string().uuid() }).strict();
const brandKitSchema = z.object({
  expectedRevision: z.number().int().nonnegative(), imageType: z.string().trim().max(120), visualStyle: z.string().trim().max(2000),
  palette: z.string().trim().max(1000), typography: z.string().trim().max(1000), logoRules: z.string().trim().max(1500), avoid: z.string().trim().max(1500), guidelines: z.string().trim().max(4000),
  brandBibleMarkdown: z.string().max(20_000).optional(), brandBibleFileName: z.string().max(255).optional(),
  defaultReferenceIds: z.array(z.string().min(1).max(100)).max(4),
  referenceCategories: z.record(z.string().min(1).max(100), z.enum(['logo', 'style', 'product', 'brand_bible', 'other'])).refine(value => Object.keys(value).length <= 500),
}).strict();
const referenceSchema = z.object({ brandId: z.string().min(1), title: z.string().trim().min(1).max(160), base64: z.string().min(4).max(6_700_000).regex(/^[A-Za-z0-9+/]+={0,2}$/) }).strict();
const publishSchema = z.object({ audienceMode: z.enum(['all', 'selected']), repIds: z.array(z.string()).max(100).default([]) }).strict();
const retireSchema = z.object({ reason: z.string().trim().min(1).max(500) }).strict();
async function body(req: IncomingMessage, limit = 16_384): Promise<unknown> {
  if (!req.headers['content-type']?.startsWith('application/json')) throw new ApiError(415, 'JSON body required.');
  let content = '';
  for await (const chunk of req) {
    content += String(chunk);
    if (Buffer.byteLength(content) > limit) throw new ApiError(413, 'Request too large.');
  }
  try { return JSON.parse(content); } catch { throw new ApiError(400, 'Invalid JSON.'); }
}
function send(res: ServerResponse, status: number, data: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(JSON.stringify(data));
}
export function createApi(workflow = new Workflow(), options: { generator?: ImageGenerator; store?: MarketingStore } = {}) {
  const marketing = new MarketingService(workflow, options.generator, options.store);
  const ports = localPorts(process.env);
  return createServer(async (req, res) => {
    try {
      const host = new URL(`http://${req.headers.host ?? ''}`);
      if (!['127.0.0.1', 'localhost', '[::1]'].includes(host.hostname)) throw new ApiError(403, 'Local host required.');
      if (req.headers.origin && ![`http://127.0.0.1:${ports.web}`, `http://localhost:${ports.web}`, `http://127.0.0.1:${ports.api}`].includes(req.headers.origin))
        throw new ApiError(403, 'Local demo origin required.');
      const path = new URL(req.url ?? '/', host).pathname;
      if (path === '/api/health' && req.method === 'GET') return send(res, 200, { status: 'local-fixture-only' });
      // This header selects a SERVER-DEFINED test identity, not caller-provided roles.
      // It is deliberately not production authentication and only runs on loopback.
      const id = req.headers['x-demo-identity'];
      const actor = workflow.authenticate(typeof id === 'string' ? id : undefined);
      if (req.method === 'GET' && path === '/api/workspace') return send(res, 200, workflow.workspace(actor));
      if (req.method === 'GET' && path === '/api/marketing/workspace') return send(res, 200, marketing.workspace(actor));
      const brandKit = /^\/api\/marketing\/brand-kits\/([a-z0-9-]+)$/.exec(path);
      if (req.method === 'PUT' && brandKit) return send(res, 200, marketing.updateBrandKit(actor, brandKit[1], brandKitSchema.parse(await body(req, 300_000))));
      if (req.method === 'POST' && path === '/api/marketing/campaigns') return send(res, 201, marketing.createCampaign(actor, campaignSchema.parse(await body(req))));
      if (req.method === 'POST' && path === '/api/marketing/content') return send(res, 201, marketing.createContent(actor, contentSchema.parse(await body(req))));
      const contentUpdate = /^\/api\/marketing\/content\/([a-z0-9-]+)$/.exec(path);
      if (req.method === 'PATCH' && contentUpdate) return send(res, 200, marketing.updateContent(actor, contentUpdate[1], contentSchema.parse(await body(req))));
      const contentAction = /^\/api\/marketing\/content\/([a-z0-9-]+)\/(submit|review|schedule)$/.exec(path);
      if (contentAction && req.method === 'POST') {
        const [, id, action] = contentAction;
        if (action === 'submit') return send(res, 200, marketing.submitContent(actor, id));
        if (action === 'schedule') return send(res, 200, marketing.scheduleContent(actor, id));
        const input = reviewSchema.parse(await body(req));
        return send(res, 200, marketing.reviewContent(actor, id, input.decision, input.notes));
      }
      if (req.method === 'POST' && path === '/api/marketing/references') {
        if (!actor.marketingGrants.includes('creative:generate') || actor.organizationId !== 'demo-o1') throw new ApiError(403, 'Reference upload is not authorized.');
        return send(res, 201, await marketing.uploadReference(actor, referenceSchema.parse(await body(req, 6_700_500))));
      }
      if (req.method === 'POST' && path === '/api/marketing/generation-jobs') return send(res, 202, marketing.createGeneration(actor, generationSchema.parse(await body(req))));
      const retryGeneration = /^\/api\/marketing\/generation-jobs\/([a-z0-9-]+)\/retry$/.exec(path);
      if (req.method === 'POST' && retryGeneration) return send(res, 202, marketing.retryGeneration(actor, retryGeneration[1], retrySchema.parse(await body(req)).requestKey));
      const versionAction = /^\/api\/marketing\/versions\/([a-z0-9-]+)\/(submit|review|publish)$/.exec(path);
      if (versionAction && req.method === 'POST') {
        const [, id, action] = versionAction;
        if (action === 'submit') return send(res, 200, marketing.submitVersion(actor, id));
        if (action === 'review') {
          const input = reviewSchema.parse(await body(req));
          return send(res, 200, marketing.reviewVersion(actor, id, input.decision, input.notes));
        }
        const input = publishSchema.parse(await body(req));
        return send(res, 200, marketing.publishVersion(actor, id, input.audienceMode, input.repIds));
      }
      const retirePublication = /^\/api\/marketing\/publications\/([a-z0-9-]+)\/retire$/.exec(path);
      if (req.method === 'POST' && retirePublication) return send(res, 200, marketing.retirePublication(actor, retirePublication[1], retireSchema.parse(await body(req)).reason));
      const marketingFile = /^\/api\/marketing\/versions\/([a-z0-9-]+)\/file$/.exec(path);
      if (req.method === 'GET' && marketingFile) {
        const file = marketing.marketingFile(actor, marketingFile[1]);
        res.writeHead(200, { 'Content-Type': file.mimeType, 'Content-Disposition': `${new URL(req.url ?? '/', host).searchParams.has('download') ? 'attachment' : 'inline'}; filename="${file.fileName}"`, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; sandbox" });
        return res.end(file.body);
      }
      if (req.method === 'GET' && path === '/api/assets') return send(res, 200, { assets: marketing.publishedAssets(actor) });
      const publishedFile = /^\/api\/assets\/([a-z0-9-]+)\/versions\/([a-z0-9-]+)\/file$/.exec(path);
      if (req.method === 'GET' && publishedFile) {
        const file = marketing.publishedFile(actor, publishedFile[1], publishedFile[2]);
        res.writeHead(200, { 'Content-Type': file.mimeType, 'Content-Disposition': `${new URL(req.url ?? '/', host).searchParams.has('download') ? 'attachment' : 'inline'}; filename="${file.fileName}"`, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; sandbox" });
        return res.end(file.body);
      }
      const invoiceMatch = /^\/api\/invoices\/([a-z0-9-]+)$/.exec(path);
      if (req.method === 'GET' && invoiceMatch) return send(res, 200, workflow.getInvoice(actor, invoiceMatch[1]));
      const jobMatch = /^\/api\/jobs\/([a-z0-9-]+)$/.exec(path);
      if (req.method === 'GET' && jobMatch) return send(res, 200, workflow.getJob(actor, jobMatch[1]));
      const releaseMatch = /^\/api\/invoices\/([a-z0-9-]+)\/release$/.exec(path);
      if (req.method === 'POST' && releaseMatch) {
        const result = workflow.release(actor, releaseMatch[1], releaseSchema.parse(await body(req)));
        return send(res, result.created ? 201 : 200, result);
      }
      const eventMatch = /^\/api\/demo\/invoices\/([a-z0-9-]+)\/events$/.exec(path);
      if (req.method === 'POST' && eventMatch) {
        const { event } = eventSchema.parse(await body(req));
        return send(res, 200, workflow.simulate(actor, eventMatch[1], event));
      }
      if (req.method === 'POST' && path === '/api/demo/reset') {
        workflow.requireDemo(actor);
        if (actor.organizationId !== 'demo-o1') throw new ApiError(403, 'Fixture reset is scoped to demo-o1.');
        workflow.reset(); marketing.reset(); return send(res, 200, { reset: true });
      }
      throw new ApiError(404, 'Route not found.');
    } catch (error) {
      if (error instanceof ApiError) send(res, error.status, { error: error.message });
      else if (error instanceof z.ZodError) send(res, 400, { error: 'Invalid request fields. Check the required values and permitted fields for this action.' });
      else send(res, 500, { error: 'Local API error.' });
    }
  });
}
