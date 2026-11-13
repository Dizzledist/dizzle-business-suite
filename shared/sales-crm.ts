import type { Identity } from './contracts.ts';

export const salesCrmPath = '/sales';
export const salesCrmApiWorkspace = '/api/sales-crm/workspace';

export interface SalesCrmWorkspace {
  displayName: string;
  historicalEvidenceEnabled?: boolean;
  integrations: {
    zohoInventory: 'not-configured';
    shipStation: 'not-configured';
  };
}

export function isLocalFixtureEnabled(env: Record<string, string | undefined>) {
  return env.NODE_ENV === 'development' || env.NODE_ENV === 'test';
}

export function isSalesCrmEnabled(env: Record<string, string | undefined>) {
  return env.SALES_CRM_ENABLED === 'true' && (env.NODE_ENV === undefined || isLocalFixtureEnabled(env));
}

export function canAccessSalesCrm(actor: Identity) {
  return actor.active && actor.read && actor.organizationId === 'demo-o1' &&
    actor.roles.some(role => ['sales_rep', 'sales_manager', 'owner', 'admin'].includes(role));
}
