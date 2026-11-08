import { isLocalFixtureEnabled } from './sales-crm.ts';

export const salesAuthApi = '/api/sales-crm/auth';
export const passwordAuthApi = salesAuthApi + '/password';
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

export function isSalesPasswordEnabled(env: Record<string, string | undefined>) {
  return env.SALES_CRM_PASSWORD_ENABLED === 'true' && isSalesAuthEnabled(env);
}

export interface SalesSessionView {
  displayName: string;
  role: SalesRole;
  csrfToken: string;
  expiresAt: string;
  email?: string;
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
    passwordStatus?: 'unenrolled' | 'setup-required' | 'ready';
    resetRequestedAt?: string | null;
  }[];
  audit: {
    action: string;
    at: string;
    actorId: string | null;
    targetId: string;
  }[];
}
