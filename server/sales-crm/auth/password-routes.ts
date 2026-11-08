import type { IncomingMessage, ServerResponse } from 'node:http';
import { z } from 'zod';
import { passwordAuthApi, salesAuthApi } from '../../../shared/sales-auth';
import { readJsonBody } from '../../http-body';
import { ApiError } from '../../workflow';
import type { PasswordAuth } from './passwords';
import { hasSessionMutationProtection, requestSession, sessionCookie } from './sessions';
import type { SalesIdentityStore } from './store';

const email = z.string().trim().max(254).pipe(z.email()).transform(value => value.toLowerCase());
const password = z.string().min(1).max(1024);
const login = z.object({ email, password }).strict();
const forgot = z.object({ email }).strict();
const redeem = z.object({ email, code: z.string().regex(/^[A-Za-z0-9_-]{43}$/), password }).strict();
const change = z.object({ current: password, password }).strict();

export function isPublicPasswordPath(path: string) {
  return ['/status', '/login', '/forgot', '/redeem'].some(suffix => path === passwordAuthApi + suffix);
}

export async function handlePublicPassword(
  req: IncomingMessage, res: ServerResponse, url: URL, service: PasswordAuth | undefined, origins: readonly string[],
) {
  const route = url.pathname.slice(passwordAuthApi.length);
  if (url.search) throw new ApiError(400, 'Invalid password request.');
  if (route === '/status' && req.method === 'GET') return { configured: !!service };
  if (!service || req.method !== 'POST') throw new ApiError(404, 'Password sign-in is unavailable.');
  if (!origins.includes(url.origin) || req.headers.origin !== url.origin ||
      req.headers.host !== url.host || req.headers['x-demo-identity'] !== undefined) {
    throw new ApiError(403, 'Password request origin could not be verified.');
  }
  try {
    const input = await readJsonBody(req);
    if (route === '/login') {
      const credentials = login.parse(input);
      const session = await service.login(credentials.email, credentials.password, requestSession(req));
      res.setHeader('Set-Cookie', sessionCookie(session));
      return { signedIn: true };
    }
    if (route === '/forgot') {
      service.forgot(forgot.parse(input).email);
      return { received: true };
    }
    if (route === '/redeem') {
      const details = redeem.parse(input);
      await service.redeem(details.email, details.code, details.password);
      res.setHeader('Set-Cookie', sessionCookie(null));
      return { updated: true };
    }
  } catch (error) {
    if (error instanceof z.ZodError) throw new ApiError(400, 'Enter valid password request fields.');
    throw error;
  }
  throw new ApiError(404, 'Route not found.');
}

export async function changeOwnPassword(
  req: IncomingMessage, res: ServerResponse, url: URL, token: string, service: PasswordAuth, origins: readonly string[],
) {
  if (url.search || !hasSessionMutationProtection(req, token, origins)) {
    throw new ApiError(403, 'Password change request could not be verified.');
  }
  const input = change.safeParse(await readJsonBody(req));
  if (!input.success) throw new ApiError(400, 'Enter valid password change fields.');
  await service.change(token, input.data.current, input.data.password);
  res.setHeader('Set-Cookie', sessionCookie(null));
  return { updated: true };
}

export async function managePasswordEmployee(
  req: IncomingMessage, url: URL, token: string, identity: SalesIdentityStore, origins: readonly string[],
) {
  if (url.search || !hasSessionMutationProtection(req, token, origins)) {
    throw new ApiError(403, 'Employee management request could not be verified.');
  }
  try {
    if (req.method === 'POST' && url.pathname === salesAuthApi + '/admin/users') {
      const input = await readJsonBody(req);
      return identity.invitePasswordEmployee(token, input as Parameters<SalesIdentityStore['invitePasswordEmployee']>[1]);
    }
    const match = /^\/api\/sales-crm\/auth\/admin\/users\/([a-f0-9-]{36})\/(access|credential|revoke)$/.exec(url.pathname);
    if (!match) throw new ApiError(404, 'Route not found.');
    const [, userId, action] = match;
    if (action === 'access' && req.method === 'PUT') {
      const input = await readJsonBody(req);
      identity.changeAccess(token, userId, input as Parameters<SalesIdentityStore['changeAccess']>[2]);
      return { updated: true };
    }
    if (action !== 'access' && req.method === 'POST' && !req.headers['transfer-encoding'] &&
        Number(req.headers['content-length'] ?? 0) === 0) {
      if (action === 'credential') return identity.issueEmployeePasswordCode(token, userId);
      identity.revokeEmployeeSessions(token, userId);
      return { updated: true };
    }
  } catch (error) {
    if (error instanceof z.ZodError) throw new ApiError(400, 'Enter valid employee fields.');
    throw error;
  }
  throw new ApiError(404, 'Route not found.');
}
