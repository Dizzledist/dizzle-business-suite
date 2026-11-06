export type Role = 'owner' | 'admin' | 'sales_manager' | 'sales_rep' | 'warehouse';
export interface Identity {
  id: string; name: string; organizationId: string; roles: Role[];
  active: boolean; read: boolean; release: boolean; demo: boolean;
}
export interface ReleaseAudit {
  actor: string; at: string; basis: 'verified_payment' | 'approved_terms';
  reason: string; terms: string | null; requestKey: string;
}
export interface JobView {
  id: string; invoiceId: string; invoiceNumber: string; accountName: string;
  status: 'Orders'; items: { sku: string; quantity: number; unit: string }[];
  review: string | null; releaseAudit?: ReleaseAudit;
}
export interface InvoiceView {
  id: string; number: string; accountId: string; accountName: string;
  sourceKey: { application: string; organizationId: string; invoiceId: string };
  currency: 'USD'; total: string; balance: string;
  payment: 'unpaid' | 'partial' | 'fully paid' | 'ambiguous';
  verification: 'verified' | 'stale' | 'unverified'; verifiedAt: string;
  mappingVerified: boolean; eligible: boolean;
  terms: { id: string; text: string; status: 'approved' | 'missing' | 'disputed' };
  jobId: string | null; holdReason: string | null; revision: number;
}
export interface Workspace {
  identity: Identity; invoices: InvoiceView[]; jobs: JobView[];
  fixtureNotice: string;
}
export const demoEvents = ['partial', 'full', 'replay', 'stale', 'unverified', 'unmapped', 'restore'] as const;
export type DemoEvent = typeof demoEvents[number];
