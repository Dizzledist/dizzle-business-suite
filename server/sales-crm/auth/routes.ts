import type { IncomingMessage, ServerResponse } from 'node:http';
import { ZodError } from 'zod';
import { salesAuthApi, type SalesSessionView } from '../../../shared/sales-auth';
import { reportingApi } from '../../../shared/reporting';
import { salesCrmApiWorkspace } from '../../../shared/sales-crm';
import { readJsonBody } from '../../http-body';
import { ApiError } from '../../workflow';
import type { SyntheticReporting } from '../reporting/demo';
import { getScopedReporting } from '../reporting/routes';
import type { SalesIdentityStore } from './store';
import { csrfToken, hasSessionMutationProtection, requestSession, sessionCookie } from './sessions';
import { googleIssuer } from './google/config';
import type { GoogleLogin } from './google/routes';

function acceptsNoBody(req: IncomingMessage) {
  return !req.headers['transfer-encoding'] && Number(req.headers['content-length'] ?? 0) === 0;
}

async function manageEmployee(
  req: IncomingMessage, url: URL, token: string, identity: SalesIdentityStore, google: GoogleLogin,
) {
  if (url.search || !hasSessionMutationProtection(req, token, [google.origin])) {
    throw new ApiError(403, 'Employee management request could not be verified.');
  }
  try {
    if (req.method === 'POST' && url.pathname === salesAuthApi + '/admin/users') {
      const input = await readJsonBody(req);
      return identity.inviteGoogleEmployee(token, input as Parameters<SalesIdentityStore['inviteGoogleEmployee']>[1]);
    }
    const match = /^\/api\/sales-crm\/auth\/admin\/users\/([a-f0-9-]{36})\/(access|mapping|invitation)$/.exec(url.pathname);
    if (!match) throw new ApiError(404, 'Route not found.');
    const [, userId, action] = match;
    if (action === 'invitation' && req.method === 'POST' && acceptsNoBody(req)) return identity.renewGoogleInvitation(token, userId);
    if (req.method !== 'PUT' || action === 'invitation') throw new ApiError(404, 'Route not found.');
    const input = await readJsonBody(req);
    if (action === 'access') identity.changeAccess(token, userId, input as Parameters<SalesIdentityStore['changeAccess']>[2]);
    else identity.setZohoMapping(token, userId, input as Parameters<SalesIdentityStore['setZohoMapping']>[2]);
    return { updated: true };
  } catch (error) {
    if (error instanceof ZodError) throw new ApiError(400, 'Invalid employee fields.');
    throw error;
  }
}

export async function getAuthenticatedSalesCrm(
  req: IncomingMessage, res: ServerResponse, url: URL, identity: SalesIdentityStore | undefined,
  reporting: SyntheticReporting | undefined, localOrigins: readonly string[], google?: GoogleLogin,
) {
  if (!identity) throw new ApiError(503, 'Company sign-in is unavailable.');
  if (req.headers['x-demo-identity'] !== undefined) throw new ApiError(401, 'Company sign-in required.');
  const token = requestSession(req);
  const logout = req.method === 'POST' && url.pathname === salesAuthApi + '/logout';
  const user = identity.resolveSession(token, !logout);
  if (!token || !user || (google ? url.origin !== google.origin || user.issuer !== googleIssuer || user.google_policy !== google.sessionPolicy
    : user.issuer === googleIssuer)) throw new ApiError(401, 'Company sign-in required.');

  if (logout) {
    if (url.search || !acceptsNoBody(req) || !hasSessionMutationProtection(req, token, google ? [google.origin] : localOrigins)) {
      throw new ApiError(403, 'Logout request could not be verified.');
    }
    identity.logout(token);
    res.setHeader('Set-Cookie', sessionCookie(null));
    return { signedOut: true };
  }

  if (google && req.method !== 'GET' && url.pathname.startsWith(salesAuthApi + '/admin/users')) {
    if (user.role !== 'admin') throw new ApiError(403, 'Administrator access required.');
    return manageEmployee(req, url, token, identity, google);
  }
  if (req.method !== 'GET') throw new ApiError(404, 'Route not found.');
  if (url.pathname === salesAuthApi + '/session' && !url.search) {
    const result: SalesSessionView = {
      displayName: user.name, role: user.role, csrfToken: csrfToken(token), expiresAt: new Date(user.expires_at).toISOString(),
      ...(google ? { email: user.email } : {}),
    };
    return result;
  }
  if (url.pathname === salesAuthApi + '/admin' && !url.search) return identity.directory(token, !!google);
  if (url.pathname === salesCrmApiWorkspace) {
    return {
      displayName: user.name,
      integrations: { zohoInventory: 'not-configured', shipStation: 'not-configured' },
    };
  }
  if (url.pathname === reportingApi || url.pathname.startsWith(reportingApi + '/invoices/')) {
    return getScopedReporting(url, reporting, identity.reportingScope(user));
  }
  throw new ApiError(404, 'Route not found.');
}
