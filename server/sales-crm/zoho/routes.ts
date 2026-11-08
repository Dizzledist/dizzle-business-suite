import { timingSafeEqual } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { canAccessSalesCrm } from '../../../shared/sales-crm';
import { ApiError, type Workflow } from '../../workflow';
import { zohoIntegrationPath, type ZohoConfig } from './config';
import { ZohoConnectionError, type ZohoConnection } from './connection';

const cookieName = 'dizzle_zoho_flow';

export interface ZohoManagement {
  config: ZohoConfig;
  connection: ZohoConnection;
}

export function isZohoManagementPath(path: string) {
  return path === zohoIntegrationPath || path.startsWith(zohoIntegrationPath + '/');
}

function admin(req: IncomingMessage, workflow: Workflow, key: Buffer) {
  const identity = req.headers['x-demo-identity'];
  const actor = workflow.authenticate(typeof identity === 'string' ? identity : undefined);
  const supplied = req.headers['x-zoho-local-admin-key'];
  if (req.headers.origin || !canAccessSalesCrm(actor) || !actor.roles.includes('admin') ||
      typeof supplied !== 'string' || !/^[0-9a-f]{64}$/i.test(supplied) ||
      !timingSafeEqual(key, Buffer.from(supplied, 'hex'))) {
    throw new ApiError(403, 'Zoho local operator authorization required.');
  }
}

function browserNonce(req: IncomingMessage) {
  const cookies = req.headers.cookie?.split(';').map(cookie => cookie.trim()) ?? [];
  const matching = cookies.filter(cookie => cookie.startsWith(cookieName + '='));
  return matching.length === 1 ? matching[0].slice(cookieName.length + 1) : null;
}

function setFlowCookie(res: ServerResponse, value: string, maxAge: number) {
  res.setHeader('Set-Cookie', cookieName + '=' + value +
    '; Path=' + zohoIntegrationPath + '; HttpOnly; SameSite=Lax; Max-Age=' + maxAge);
}

function json(res: ServerResponse, data: unknown) {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function redirect(res: ServerResponse, url: string) {
  res.writeHead(303, { Location: url });
  res.end();
}

export async function handleZohoManagement(
  req: IncomingMessage, res: ServerResponse, url: URL, workflow: Workflow, management: ZohoManagement,
) {
  const { config, connection } = management;
  const callback = new URL(config.redirectUri);
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.socket.remoteAddress !== '127.0.0.1' || req.headers.host !== callback.host || url.origin !== callback.origin) {
    throw new ApiError(403, 'Use the configured direct localhost Zoho API address.');
  }

  const route = url.pathname.slice(zohoIntegrationPath.length);
  try {
    if (req.method === 'GET' && route === '/start') {
      const ticket = url.searchParams.getAll('ticket');
      const start = connection.openStart(ticket.length === 1 ? ticket[0] : null);
      setFlowCookie(res, start.browser, start.maxAge);
      return redirect(res, start.url);
    }
    if (req.method === 'GET' && route === '/callback') {
      await connection.complete(url.searchParams, browserNonce(req));
      setFlowCookie(res, '', 0);
      return redirect(res, zohoIntegrationPath + '/complete');
    }
    if (req.method === 'GET' && route === '/complete') {
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Zoho authorization finished. Check status in the local administrator terminal.');
    }

    const status = req.method === 'GET' && route === '/status';
    const authorize = req.method === 'POST' && route === '/authorize';
    const sample = req.method === 'POST' && route === '/sample';
    if (!status && !authorize && !sample) throw new ApiError(404, 'Route not found.');
    admin(req, workflow, config.adminKey);
    if (url.search || req.headers['transfer-encoding'] || Number(req.headers['content-length'] ?? 0) !== 0) {
      throw new ApiError(400, 'This Zoho operation accepts no inputs.');
    }
    if (status) return json(res, await connection.status());
    if (authorize) return json(res, { startUrl: connection.issueStart() });
    return json(res, await connection.sample());
  } catch (error) {
    if (!(error instanceof ZohoConnectionError)) throw error;
    const status = error.kind === 'busy' || error.kind === 'not-connected' ? 409 :
      error.kind === 'unavailable' || error.kind === 'rate-limited' || error.kind === 'token-store' ? 502 : 400;
    throw new ApiError(status, error.message);
  }
}
