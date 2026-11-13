import { z } from 'zod';
import type { IncomingMessage } from 'node:http';
import { salesAuthApi } from '../../../shared/sales-auth';
import { readJsonBody } from '../../http-body';
import { ApiError } from '../../workflow';
import type { SalesIdentityStore } from './store';
import { hasSessionMutationProtection } from './sessions';

export const zohoBindingApi = salesAuthApi + '/admin/zoho-binding';
export interface ZohoBindingPolicy { tenantId: string; approvalReference: string }
const reference = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/);
const tenant = z.string().regex(/^[A-Za-z][A-Za-z0-9_-]{0,79}$/)
  .refine(value => !/^(?:demo|test|sample|fixture)(?:[-_]|$)/i.test(value));
export function loadZohoBindingPolicy(env: NodeJS.ProcessEnv): ZohoBindingPolicy | undefined {
  if (!env.SALES_ZOHO_TENANT_ID && !env.SALES_ZOHO_APPROVAL_REFERENCE) return undefined;
  return { tenantId: tenant.parse(env.SALES_ZOHO_TENANT_ID), approvalReference: reference.parse(env.SALES_ZOHO_APPROVAL_REFERENCE) };
}
const change = z.object({ action: z.enum(['approve', 'revoke']), expectedRevision: z.number().int().min(0),
  approvalReference: reference }).strict();

export async function manageZohoBinding(
  req: IncomingMessage, url: URL, token: string, identity: SalesIdentityStore, origins: readonly string[],
) {
  if (url.search) throw new ApiError(400, 'Organization binding accepts no query parameters.');
  if (req.method === 'GET') return identity.zohoBinding(token);
  if (req.method !== 'PUT') throw new ApiError(404, 'Route not found.');
  if (!hasSessionMutationProtection(req, token, origins)) throw new ApiError(403, 'Binding request could not be verified.');
  const input = change.safeParse(await readJsonBody(req));
  if (!input.success) throw new ApiError(400, 'Enter only the approved binding action, revision and reference.');
  return identity.changeZohoBinding(token, input.data);
}
