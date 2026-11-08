import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { z } from 'zod';
import { demoEvents } from '../shared/contracts';
import { isSalesCrmEnabled } from '../shared/sales-crm';
import { getSalesCrmWorkspace, isSalesCrmApiPath } from './sales-crm/routes';
import { handleZohoManagement, isZohoManagementPath, type ZohoManagement } from './sales-crm/zoho/routes';
import { ApiError, Workflow } from './workflow';
import { reportingApi } from '../shared/reporting';
import { getReporting } from './sales-crm/reporting/routes';
import type { SyntheticReporting } from './sales-crm/reporting/demo';

const releaseSchema = z.object({
  reason: z.string().trim().min(1).max(500), termsId: z.string().min(1).max(100),
  requestKey: z.string().min(1).max(150), expectedRevision: z.number().int().positive(),
}).strict();
const eventSchema = z.object({ event: z.enum(demoEvents) }).strict();
async function body(req: IncomingMessage): Promise<unknown> {
  if (!req.headers['content-type']?.startsWith('application/json')) throw new ApiError(415, 'JSON body required.');
  let content = '';
  for await (const chunk of req) {
    content += String(chunk);
    if (Buffer.byteLength(content) > 16_384) throw new ApiError(413, 'Request too large.');
  }
  try { return JSON.parse(content); } catch { throw new ApiError(400, 'Invalid JSON.'); }
}
function send(res: ServerResponse, status: number, data: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(JSON.stringify(data));
}
export function createApi(workflow = new Workflow(), zoho?: ZohoManagement, reporting?: SyntheticReporting) {
  const salesCrmEnabled = isSalesCrmEnabled(process.env);
  return createServer(async (req, res) => {
    try {
      const host = new URL(`http://${req.headers.host ?? ''}`);
      if (!['127.0.0.1', 'localhost', '[::1]'].includes(host.hostname)) throw new ApiError(403, 'Local host required.');
      if (req.headers.origin && !['http://127.0.0.1:5173', 'http://localhost:5173', 'http://127.0.0.1:3001'].includes(req.headers.origin))
        throw new ApiError(403, 'Local demo origin required.');
      const url = new URL(req.url ?? '/', host);
      const path = url.pathname;
      if (path === '/api/health' && req.method === 'GET') return send(res, 200, { status: 'local-fixture-only' });
      if (isZohoManagementPath(path)) {
        if (!salesCrmEnabled || !zoho) throw new ApiError(404, 'Route not found.');
        await handleZohoManagement(req, res, url, workflow, zoho);
        return;
      }
      const salesCrmRequest = isSalesCrmApiPath(path);
      if (salesCrmRequest && !salesCrmEnabled) throw new ApiError(404, 'Route not found.');
      // This header selects a SERVER-DEFINED test identity, not caller-provided roles.
      // It is deliberately not production authentication and only runs on loopback.
      const id = req.headers['x-demo-identity'];
      const actor = workflow.authenticate(typeof id === 'string' ? id : undefined);
      if (path === reportingApi || path.startsWith(reportingApi + '/')) {
        return send(res, 200, await getReporting(actor, req, url, reporting, zoho));
      }
      if (salesCrmRequest) return send(res, 200, getSalesCrmWorkspace(actor, req.method, path));
      if (req.method === 'GET' && path === '/api/workspace') return send(res, 200, workflow.workspace(actor));
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
        workflow.reset(); return send(res, 200, { reset: true });
      }
      throw new ApiError(404, 'Route not found.');
    } catch (error) {
      if (error instanceof ApiError) send(res, error.status, { error: error.message });
      else if (error instanceof z.ZodError) send(res, 400, { error: 'Invalid request fields. Required: documented terms, reason, request key and invoice revision for release; a named fixture event for simulation.' });
      else send(res, 500, { error: 'Local API error.' });
    }
  });
}
