import { basename, isAbsolute } from 'node:path';
import { openSalesIdentity } from '../../server/sales-crm/auth/store';
import { createSyntheticReporting } from '../../server/sales-crm/reporting/demo';
import { saveSalesperson, upsertInvoice } from '../../server/sales-crm/reporting/database';
import { invoiceDetail, mirrorInvoice } from '../../server/sales-crm/zoho/invoice';
import { invoicePayload } from './zoho-invoices';
import type { SalesRole } from '../../shared/sales-auth';

export const testTenant = 'test-company';
export const testIssuer = 'https://identity.example.test';
export const testTime = Date.parse('2026-11-07T19:00:00Z');

export function requireE2eIdentityPath(path: string | undefined) {
  if (!path || !isAbsolute(path) || !/^dizzle-identity-e2e-[a-f0-9-]{36}\.sqlite$/.test(basename(path))) {
    throw new Error('Use a dedicated synthetic identity test path.');
  }
  return path;
}

export function testAccount(subject: string, name = subject) {
  return { issuer: testIssuer, subject, name, email: subject + '@example.test', department: 'sales', team: null };
}

export async function salesAuthFixture({ path = ':memory:', now = () => testTime } = {}) {
  const store = openSalesIdentity(path, now);
  const ids = { admin: store.bootstrapAdministrator(testTenant, testAccount('admin', 'Sample Admin')) };
  const token = (subject: string) => store.startSession({ issuer: testIssuer, subject });
  const admin = token('admin');
  function add(subject: string, name: string, team: string | null, role: SalesRole) {
    return store.provisionUser(admin, { ...testAccount(subject, name), team, role, status: 'active' });
  }
  const manager = add('manager', 'North Manager', 'north', 'sales_manager');
  const north = add('north', 'North Rep', 'north', 'sales_rep');
  const south = add('south', 'South Rep', 'south', 'sales_rep');
  const unmapped = add('unmapped', 'Unmapped Rep', 'north', 'sales_rep');
  const other = store.bootstrapAdministrator('other-company', testAccount('other', 'Other Admin'));
  store.setZohoMapping(admin, north, { salespersonId: '501', verificationReference: 'fixture-501' });
  store.setZohoMapping(admin, south, { salespersonId: '502', verificationReference: 'fixture-502' });
  store.setZohoMapping(admin, manager, { salespersonId: '503', verificationReference: 'fixture-503' });
  const otherToken = token('other');
  store.setZohoMapping(otherToken, other, { salespersonId: '501', verificationReference: 'other-501' });

  const reporting = await createSyntheticReporting({ path: ':memory:', now });
  const rows = [
    ['9001', testTenant, '501', north, 'North Sample'],
    ['9002', testTenant, '502', south, 'South Sample'],
    ['9003', testTenant, '503', manager, 'Manager Sample'],
    ['9004', testTenant, '504', unmapped, 'Unmapped Sample'],
    ['9005', 'other-company', '501', other, 'Other Sample'],
    ['9006', testTenant, '505', null, 'Uncredited Sample'],
  ] as const;
  for (const [invoiceId, organization, salespersonId, userId, customer] of rows) {
    if (userId) saveSalesperson(reporting.db, organization, salespersonId, userId, 'Sample salesperson');
    const at = now();
    const before = new Date(at - 120_000).toISOString();
    const firstEmailAt = new Date(at - 60_000).toISOString();
    const invoice = mirrorInvoice(organization, invoiceDetail.parse({ invoice: invoicePayload({
      invoice_id: invoiceId, invoice_number: 'AUTH-' + invoiceId, customer_name: customer, salesperson_id: salespersonId,
      created_time: before, last_modified_time: firstEmailAt,
    }) }).invoice);
    upsertInvoice(reporting.db, invoice, {
      status: 'verified', firstEmailAt, source: 'Synthetic receipt', id: 'receipt-' + invoiceId,
      subtotal: '100.23', currency: 'USD', salespersonId,
    }, at);
  }

  return {
    store, reporting, admin, token,
    ids: { ...ids, north, south, manager, unmapped, other },
    close() { reporting.db.close(); store.close(); },
  };
}
