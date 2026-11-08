import { isLocalFixtureEnabled } from './sales-crm.ts';

export const salesAuthApi = '/api/sales-crm/auth';
export const salesRoles = ['sales_rep', 'sales_manager', 'admin'] as const;
export const accountStatuses = ['pending', 'active', 'disabled'] as const;
export type SalesRole = typeof salesRoles[number];
export type AccountStatus = typeof accountStatuses[number];

export const salesRoleLabels: Record<SalesRole, string> = {
  sales_rep: 'Sales representative',
  sales_manager: 'Sales manager',
  admin: 'Administrator',
};

export function isSalesAuthEnabled(env: Record<string, string | undefined>) {
  return env.SALES_CRM_AUTH_ENABLED === 'true' &&
    isLocalFixtureEnabled(env);
}

export interface SalesSessionView {
  displayName: string;
  role: SalesRole;
  csrfToken: string;
  expiresAt: string;
}

export interface SalesDirectory {
  users: {
    id: string;
    name: string;
    email: string;
    role: SalesRole;
    department: string;
    team: string | null;
    status: AccountStatus;
    zohoSalespersonId: string | null;
    lastLogin: string | null;
  }[];
  audit: {
    action: string;
    at: string;
    actorId: string | null;
    targetId: string;
  }[];
}
