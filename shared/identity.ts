export const employeeGrants = ['workspace:read', 'campaign:write', 'creative:generate', 'asset:review', 'asset:publish', 'asset:read:all', 'asset:read:published', 'sales:read', 'identity:admin'] as const;
export type EmployeeGrant = typeof employeeGrants[number];
export interface EmployeeContext { id: string; organizationId: string; name: string; email: string; grants: EmployeeGrant[]; }
export interface GooglePrincipal { issuer: 'https://accounts.google.com'; subject: string; hostedDomain: string; email: string; name: string; }
export interface PublishingResource { organizationId: string; approvedBy: string; fingerprint: string; approvalCurrent: boolean; destinationMatches: boolean; }
export type PublishingResourceResolver = (jobId: string) => Promise<PublishingResource | null>;
