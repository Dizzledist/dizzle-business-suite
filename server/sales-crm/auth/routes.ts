import type { IncomingMessage, ServerResponse } from 'node:http';
import { passwordAuthApi, salesAuthApi, type SalesSessionView } from '../../../shared/sales-auth';
import { reportingApi } from '../../../shared/reporting';
import { salesCrmApiWorkspace } from '../../../shared/sales-crm';
import { ApiError } from '../../workflow';
import type { SyntheticReporting } from '../reporting/demo';
import { getScopedReporting } from '../reporting/routes';
import type { SalesIdentityStore } from './store';
import { csrfToken, hasSessionMutationProtection, requestSession, sessionCookie } from './sessions';
import { changeOwnPassword, managePasswordEmployee } from './password-routes';
import { manageZohoBinding, zohoBindingApi } from './zoho-binding';
import { reconciliationApi } from '../../../shared/reconciliation';
import { getReconciliation } from '../reporting/reconciliation';
import type { PasswordAuth } from './passwords';
import { evidenceApi, methodsApi, isHistoricalEvidenceEnabled } from '../../../shared/historical-evidence';
import { reportingMethod } from '../reporting/methods';
import { evidenceRoute } from '../reporting/documents';

export async function getAuthenticatedSalesCrm(
  req: IncomingMessage, res: ServerResponse, url: URL, identity: SalesIdentityStore | undefined,
  reporting: SyntheticReporting | undefined, origins: readonly string[],
  passwordMode: boolean, passwords?: PasswordAuth,
) {
  if (!identity) throw new ApiError(503, 'Company sign-in is unavailable.');
  if (req.headers['x-demo-identity'] !== undefined) throw new ApiError(401, 'Company sign-in required.');
  const token = requestSession(req);
  const logout = req.method === 'POST' && url.pathname === salesAuthApi + '/logout';
  const user = identity.resolveSession(token, !logout);
  if (!token || !user || user.password_authenticated !== Number(passwordMode)) throw new ApiError(401, 'Company sign-in required.');

  if (logout) {
    if (url.search || req.headers['transfer-encoding'] || Number(req.headers['content-length'] ?? 0) !== 0 ||
        !hasSessionMutationProtection(req, token, origins)) throw new ApiError(403, 'Logout request could not be verified.');
    identity.logout(token);
    res.setHeader('Set-Cookie', sessionCookie(null));
    return { signedOut: true };
  }

  if (url.pathname === methodsApi || url.pathname === evidenceApi || url.pathname.startsWith(evidenceApi + '/')) {
    if (!isHistoricalEvidenceEnabled(process.env)) throw new ApiError(404, 'Route not found.');
    if (!passwordMode || user.role !== 'admin') throw new ApiError(403, 'Password administrator access required.');
    if (url.pathname === methodsApi) {
      if (req.method !== 'GET') throw new ApiError(404, 'Route not found.');
      return reportingMethod(url, reporting, user.organization_id);
    }
    return evidenceRoute(req, url, reporting, { tenant: user.organization_id, id: user.id },
      hasSessionMutationProtection(req, token, origins));
  }

  if (url.pathname === zohoBindingApi || url.pathname === reconciliationApi) {
    if (!passwordMode || user.role !== 'admin') throw new ApiError(403, 'Password administrator access required.');
    if (url.pathname === zohoBindingApi) return manageZohoBinding(req, url, token, identity, origins);
    if (req.method !== 'GET') throw new ApiError(404, 'Route not found.');
    return getReconciliation(url, reporting, user.organization_id);
  }

  if (passwords && req.method === 'POST' && url.pathname === passwordAuthApi + '/change') {
    return changeOwnPassword(req, res, url, token, passwords, origins);
  }
  if (passwords && req.method !== 'GET' && url.pathname.startsWith(salesAuthApi + '/admin/users')) {
    if (user.role !== 'admin') throw new ApiError(403, 'Administrator access required.');
    return managePasswordEmployee(req, url, token, identity, origins);
  }
  if (req.method !== 'GET') throw new ApiError(404, 'Route not found.');
  if (url.pathname === salesAuthApi + '/session' && !url.search) {
    const result: SalesSessionView = {
      displayName: user.name, role: user.role, csrfToken: csrfToken(token), expiresAt: new Date(user.expires_at).toISOString(),
      ...(passwordMode ? { email: user.email } : {}),
    };
    return result;
  }
  if (url.pathname === salesAuthApi + '/admin' && !url.search) return identity.directory(token, passwordMode);
  if (url.pathname === salesCrmApiWorkspace) {
    return {
      displayName: user.name,
      ...(passwordMode && user.role === 'admin' && isHistoricalEvidenceEnabled(process.env) ? { historicalEvidenceEnabled: true } : {}),
      integrations: { zohoInventory: 'not-configured', shipStation: 'not-configured' },
    };
  }
  if (url.pathname === reportingApi || url.pathname === reportingApi + '/products' ||
      url.pathname.startsWith(reportingApi + '/invoices/')) {
    return getScopedReporting(url, reporting, identity.reportingScope(user), passwordMode);
  }
  throw new ApiError(404, 'Route not found.');
}
