import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { z } from 'zod';
import type { PublishingResourceResolver } from '../../shared/identity';
import { ApiError } from '../workflow';
import { IdentityStore } from './store';
import type { GoogleOidc } from './google';
import { absoluteLifetime, cookieValue, csrfToken, isSessionToken, mutationProtected, newSessionToken, oidcCookieName, secureCookie, sessionCookieName } from './sessions';

async function body(req: IncomingMessage) {
  if (!req.headers['content-type']?.startsWith('application/json')) throw new ApiError(415, 'JSON required.');
  let text = ''; for await (const chunk of req) { text += String(chunk); if (Buffer.byteLength(text) > 4096) throw new ApiError(413, 'Request too large.'); }
  try { return JSON.parse(text); } catch { throw new ApiError(400, 'Invalid JSON.'); }
}
function send(res: ServerResponse, status: number, value: unknown) { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'", 'Referrer-Policy': 'no-referrer' }); res.end(JSON.stringify(value)); }
export interface SharedAuthOptions {
  store: IdentityStore; google: GoogleOidc; origin: string; organizationId: string;
  resolvePublishingResource?: PublishingResourceResolver;
  allowLoopbackHttp?: boolean;
  workerOrigin?: string;
}
export function createSharedAuthApi(options: SharedAuthOptions) {
  const { store, google, origin, organizationId } = options, publicUrl = new URL(origin);
  if (publicUrl.origin !== origin || publicUrl.username || publicUrl.password || publicUrl.protocol !== 'https:' && !(options.allowLoopbackHttp && publicUrl.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(publicUrl.hostname))) throw new Error('Configure exact HTTPS auth origin; HTTP is explicit loopback-test-only.');
  const workerUrl = new URL(options.workerOrigin ?? origin);
  if (workerUrl.origin !== (options.workerOrigin ?? origin) || !['127.0.0.1', 'localhost'].includes(workerUrl.hostname)) throw new Error('Configure an exact loopback worker origin.');
  const starts = new Map<string, { at: number; count: number }>();
  return createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', origin);
      if (url.origin !== origin) throw new ApiError(400, 'Invalid request target.');
      const internal = url.pathname === '/api/internal/publishing/authorize';
      if (req.headers.host !== (internal ? workerUrl.host : publicUrl.host) || (req.url?.length ?? 0) > 8192) throw new ApiError(400, 'Invalid request host or URL.');
      if (req.headers['x-demo-identity'] !== undefined) throw new ApiError(401, 'Fixture identities are not accepted.');
      if (url.pathname === '/api/auth/google/start' && req.method === 'POST') {
        if (req.headers.origin !== origin || req.headers.authorization || Number(req.headers['content-length'] ?? 0) !== 0 || req.headers['transfer-encoding']) throw new ApiError(403, 'Sign-in request origin could not be verified.');
        const key = req.socket.remoteAddress ?? 'unknown', at = Date.now(), previous = starts.get(key);
        if (starts.size > 1000) starts.clear();
        if (previous && at - previous.at < 60_000 && previous.count >= 20) throw new ApiError(429, 'Please wait before another sign-in attempt.');
        starts.set(key, previous && at - previous.at < 60_000 ? { at: previous.at, count: previous.count + 1 } : { at, count: 1 });
        const state = newSessionToken(), binding = newSessionToken(), nonce = newSessionToken(), verifier = newSessionToken(); store.createFlow(state, binding, nonce, verifier);
        res.writeHead(302, { Location: google.authorizationUrl(state, nonce, verifier), 'Set-Cookie': secureCookie(oidcCookieName, binding, 300), 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' }); res.end(); return;
      }
      if (url.pathname === '/api/auth/google/callback' && req.method === 'GET') {
        const state = url.searchParams.get('state'), binding = cookieValue(req, oidcCookieName), code = url.searchParams.get('code');
        if (!isSessionToken(state) || !binding || !code || code.length > 2048 || url.searchParams.has('error') || url.searchParams.getAll('code').length !== 1 || url.searchParams.getAll('state').length !== 1) throw new ApiError(401, 'Invalid sign-in callback.');
        const flow = store.consumeFlow(state, binding); const principal = await google.verify(code, flow.nonce, flow.verifier);
        const token = store.startSession(principal, organizationId, cookieValue(req));
        res.writeHead(302, { Location: '/api/auth/session', 'Set-Cookie': [secureCookie(sessionCookieName, token, absoluteLifetime / 1000), secureCookie(oidcCookieName, null, 0)], 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' }); res.end(); return;
      }
      if (url.pathname === '/api/internal/publishing/authorize' && req.method === 'POST') {
        if (url.search) throw new ApiError(400, 'Worker authorization does not accept query parameters.');
        if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress ?? '')) throw new ApiError(403, 'Local worker connection required.');
        if (req.headers.cookie || req.headers.origin || !/^Bearer [A-Za-z0-9_-]{43}$/.test(req.headers.authorization ?? '')) throw new ApiError(401, 'Worker credentials required.');
        const raw = req.headers.authorization!.slice(7), workload = store.workload(raw);
        if (workload.organizationId !== organizationId) throw new ApiError(403, 'Worker outside this organization.');
        const input = z.object({ jobId: z.string().min(1).max(100).regex(/^[A-Za-z0-9-]+$/), fingerprint: z.string().regex(/^[a-f0-9]{64}$/) }).strict().parse(await body(req));
        if (!options.resolvePublishingResource) throw new ApiError(503, 'Publishing consumer has not been adopted.');
        const resource = await options.resolvePublishingResource(input.jobId); const currentWorker = store.workload(raw);
        if (!resource || resource.organizationId !== organizationId || currentWorker.organizationId !== resource.organizationId) throw new ApiError(403, 'Publishing resource outside worker scope.');
        const employee = store.employee(resource.approvedBy, organizationId);
        if (!employee || !employee.grants.includes('asset:publish') || !employee.grants.includes('asset:review')) throw new ApiError(403, 'Current employee publishing authority denied.');
        if (!resource.approvalCurrent || !resource.destinationMatches || resource.fingerprint !== input.fingerprint) throw new ApiError(409, 'Approved job or destination changed.');
        send(res, 200, { jobId: input.jobId, fingerprint: resource.fingerprint }); return;
      }
      if (url.pathname === '/api/auth/session' && req.method === 'GET' && !url.search) {
        if (req.headers.authorization) throw new ApiError(401, 'Employee session required.'); const token = cookieValue(req), result = store.session(token, organizationId);
        send(res, 200, { employee: result.employee, csrfToken: csrfToken(token!), expiresAt: new Date(result.expiresAt).toISOString() }); return;
      }
      if (url.pathname === '/api/auth/logout' && req.method === 'POST' && !url.search) {
        if (req.headers.authorization) throw new ApiError(401, 'Employee session required.');
        const token = cookieValue(req); store.session(token, organizationId); if (!mutationProtected(req, token!, origin)) throw new ApiError(403, 'CSRF validation failed.'); store.logout(token!); res.setHeader('Set-Cookie', secureCookie(sessionCookieName, null, 0)); send(res, 200, { signedOut: true }); return;
      }
      throw new ApiError(404, 'Route not found.');
    } catch (error) { if (error instanceof ApiError) send(res, error.status, { error: error.message }); else if (error instanceof z.ZodError) send(res, 400, { error: 'Invalid request fields.' }); else send(res, 503, { error: 'Shared authorization unavailable.' }); }
  });
}
