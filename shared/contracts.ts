export type Role = 'owner' | 'admin' | 'sales_manager' | 'sales_rep' | 'warehouse';
export interface Identity {
  id: string; name: string; organizationId: string; roles: Role[];
  active: boolean; read: boolean; release: boolean; demo: boolean; move: boolean;
}
export interface ReleaseAudit {
  actor: string; at: string; basis: 'verified_payment' | 'approved_terms';
  reason: string; terms: string | null; requestKey: string;
}
export interface JobView {
  id: string; invoiceId: string; invoiceNumber: string; accountName: string;
  status: WarehouseStatus; items: { sku: string; quantity: number; unit: string }[];
  review: string | null; releaseAudit?: ReleaseAudit;
  assignedRep: string; shippingType: 'Shipping' | 'Pickup'; priority: 'Normal' | 'Urgent';
  notes: string; createdAt: string; updatedAt: string; revision: number;
  shipment: Shipment | null; alert: SlackAlert | null;
}
export const warehouseStatuses = ['Orders', 'Partially Shipped', 'Shipped', 'Dropoff/Pickup'] as const;
export type WarehouseStatus = typeof warehouseStatuses[number];
export interface Shipment { id: string; tracking: string; savedAt: string; actor: string }
export interface SlackAlert {
  id: string; status: 'queued' | 'sent' | 'failed'; attempts: number;
  message: string; error: string | null;
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
