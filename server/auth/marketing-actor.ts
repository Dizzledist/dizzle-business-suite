import type { Identity, MarketingGrant } from '../../shared/contracts';
import type { EmployeeContext } from '../../shared/identity';
// Domain projection only: no Sales role, release right or assignment is inferred.
export function marketingActor(employee: EmployeeContext): Identity {
  const grants: MarketingGrant[] = ['workspace:read', 'campaign:write', 'creative:generate', 'asset:review', 'asset:publish', 'asset:read:all', 'asset:read:published'];
  return { id: employee.id, name: employee.name, organizationId: employee.organizationId,
    roles: [], departments: employee.grants.includes('workspace:read') ? ['marketing'] : [],
    marketingGrants: grants.filter(grant => employee.grants.includes(grant)), active: true, read: true, release: false, demo: false };
}
