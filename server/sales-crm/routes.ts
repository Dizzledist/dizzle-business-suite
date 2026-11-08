import { canAccessSalesCrm, salesCrmApiWorkspace, type SalesCrmWorkspace } from '../../shared/sales-crm';
import type { Identity } from '../../shared/contracts';
import { ApiError } from '../workflow';

export function isSalesCrmApiPath(path: string) {
  return path === '/api/sales-crm' || path.startsWith('/api/sales-crm/');
}

export function getSalesCrmWorkspace(actor: Identity, method: string | undefined, path: string): SalesCrmWorkspace {
  if (path !== salesCrmApiWorkspace || method !== 'GET') throw new ApiError(404, 'Route not found.');
  if (!canAccessSalesCrm(actor)) throw new ApiError(403, 'Sales CRM access is unavailable for this identity.');
  return {
    displayName: actor.name,
    integrations: { zohoInventory: 'not-configured', shipStation: 'not-configured' },
  };
}
