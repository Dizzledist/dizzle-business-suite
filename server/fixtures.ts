import type { Identity, InvoiceView } from '../shared/contracts';

export const FIXTURE_NOTICE = 'Synthetic fixtures only. Zoho origin, payment/credit semantics, event ordering and freshness thresholds remain unverified. Demo freshness: 5 minutes; demo source versions are ordered snapshots, not Zoho guarantees.';
export const FRESHNESS_MS = 5 * 60 * 1000;
export function identityFixtures(): Identity[] {
  const make = (id: string, name: string, roles: Identity['roles'], release = false, demo = false): Identity =>
    ({ id, name, roles, organizationId: 'demo-o1', active: true, read: true, release, demo });
  return [
    make('manager', 'Sales manager', ['sales_manager'], true, true),
    make('rep-a', 'Rep A · Juniper accounts', ['sales_rep']),
    make('rep-b', 'Rep B · Cedar accounts', ['sales_rep']),
    make('warehouse', 'Warehouse worker', ['warehouse']),
    make('owner', 'Owner', ['owner'], true, true),
    make('admin', 'Admin', ['admin'], true, true),
    { ...make('disabled', 'Disabled manager', ['sales_manager'], true, true), active: false },
    { ...make('revoked', 'Revoked manager', ['sales_manager']), read: false },
    { ...make('outside', 'Other organization manager', ['sales_manager'], true, true), organizationId: 'demo-o2' },
  ];
}
export interface InvoiceRecord {
  id: string; organizationId: string; accountId: string; accountName: string;
  assignedRep: string; number: string; totalMinor: number; paidMinor: number;
  status: 'open' | 'draft' | 'credit_only'; verification: InvoiceView['verification'];
  verifiedAt: string; mappingVerified: boolean; sourceVersion: number; revision: number;
  terms: InvoiceView['terms'];
}
export function invoiceFixtures(now: number): InvoiceRecord[] {
  const make = (id: string, number: string, overrides: Partial<InvoiceRecord> = {}): InvoiceRecord => ({
    id, number, organizationId: 'demo-o1', accountId: 'account-a', accountName: 'Juniper Market',
    assignedRep: 'rep-a', totalMinor: 10000, paidMinor: 0, status: 'open',
    verification: 'verified', verifiedAt: new Date(now).toISOString(), mappingVerified: true,
    sourceVersion: 0, revision: 1,
    terms: { id: 'terms-a-net15', text: 'Approved net 15 · fixture agreement A', status: 'approved' },
    ...overrides,
  });
  return [
    make('inv-open', 'DZ-1001'),
    make('inv-partial', 'DZ-1002', { paidMinor: 4000, sourceVersion: 1 }),
    make('inv-stale', 'DZ-1003', { verification: 'stale', verifiedAt: new Date(now - FRESHNESS_MS - 1000).toISOString() }),
    make('inv-b', 'DZ-1004', { accountId: 'account-b', accountName: 'Cedar Supply', assignedRep: 'rep-b' }),
    make('inv-disputed', 'DZ-1005', { terms: { id: 'terms-disputed', text: 'Terms disputed · explicit approval required', status: 'disputed' } }),
    make('inv-missing', 'DZ-1009', { terms: { id: 'terms-missing', text: 'No documented terms · explicit approval required', status: 'missing' } }),
    make('inv-unmapped', 'DZ-1006', { mappingVerified: false }),
    make('inv-credit', 'DZ-1007', { status: 'credit_only' }),
    make('inv-draft', 'DZ-1008', { status: 'draft' }),
    make('inv-outside', 'OTHER-1001', { organizationId: 'demo-o2', accountId: 'other-account', accountName: 'Other organization', assignedRep: 'outside' }),
  ];
}
