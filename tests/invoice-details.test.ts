import type { ServerResponse } from 'node:http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { saveSalesperson, transaction, upsertInvoice } from '../server/sales-crm/reporting/database';
import { createSyntheticReporting, type SyntheticReporting } from '../server/sales-crm/reporting/demo';
import { maxInvoicePdfBytes, sendInvoicePdf, syntheticInvoicePdf } from '../server/sales-crm/reporting/invoice-pdf';
import { demoOrganization, type RecognitionEvidence } from '../server/sales-crm/reporting/model';
import { getScopedReporting } from '../server/sales-crm/reporting/routes';
import { invoiceDetail, mirrorInvoice } from '../server/sales-crm/zoho/invoice';
import { normalizeInvoiceLines } from '../server/sales-crm/zoho/invoice-lines';
import { reportingApi, type ReportingInvoiceDetail, type ReportingPage } from '../shared/reporting';
import { invoicePayload } from './fixtures/zoho-invoices';

const at = Date.parse('2026-11-07T19:00:00Z');
const revision = '2026-10-01T07:00:00.000Z';
const organization = { organizationId: demoOrganization, credit: 'all' } as const;
const line = {
  line_item_id: '200', item_id: '201', name: 'Fixture product', description: 'One synthetic line',
  quantity: '0.100001', unit: 'case', rate: '3.333333', discount: '10%', discount_amount: '0.033333',
  tax_id: '501', tax_name: 'Fixture tax', tax_type: 'tax', tax_percentage: '9.5', tax_amount: '0.0285',
  item_total: '0.300001', category_id: '301', category_name: 'Fixture category',
};
const evidence = {
  status: 'verified', firstEmailAt: revision, source: 'Synthetic receipt', id: 'original-2001',
  subtotal: '0.50', currency: 'USD', salespersonId: '1', originalLineRevision: revision,
} as const satisfies RecognitionEvidence;
let reporting: SyntheticReporting;

beforeEach(async () => { reporting = await createSyntheticReporting({ path: ':memory:', now: () => at }); });
afterEach(() => reporting.db.close());

function write(overrides: Record<string, unknown> = {}, proof: RecognitionEvidence = evidence) {
  const source = invoiceDetail.parse({ invoice: invoicePayload({
    invoice_id: '2001', customer_id: '405', customer_name: 'Original buyer', salesperson_id: '1',
    date: '2026-09-25', created_time: '2026-09-25T19:00:00Z', last_modified_time: revision,
    sub_total: '0.50', total: '0.50', balance: '0.50', is_inclusive_tax: false, discount_type: 'item_level',
    line_items: [line, { ...line, line_item_id: '202', item_id: '', item_total: '0.199999' }], ...overrides,
  }) }).invoice;
  transaction(reporting.db, () => upsertInvoice(reporting.db, mirrorInvoice(demoOrganization, source), proof, at));
}

function report<T>(path = '', start = '2026-10-01', end = '2026-10-01', database = reporting): T {
  const url = new URL('http://localhost' + reportingApi + path + '?preset=custom&start=' + start + '&end=' + end);
  return getScopedReporting(url, database, organization, true) as T;
}
const detail = () => report<ReportingInvoiceDetail>('/invoices/2001');

describe('Initial invoice reporting baseline', () => {
  it('uses the local October boundary and earlier creation, and can extend coverage later', () => {
    write();
    const earlier = '2026-10-01T06:59:59.999Z';
    write({ invoice_id: '2002', last_modified_time: earlier },
      { ...evidence, firstEmailAt: earlier, id: 'earlier-send', originalLineRevision: earlier });
    write({ invoice_id: '2003', created_time: '2026-10-02T19:00:00Z' }, { status: 'pending' });
    const before = report<ReportingPage>('', '2026-09-30', '2026-09-30');
    expect(before.coverage.selected).toBe('before-baseline');
    expect(before.count).toBe(0);
    const mixed = report<ReportingPage>('', '2026-09-30', '2026-10-03');
    expect(mixed.coverage).toEqual({ from: '2026-10-01', selected: 'partial', previous: 'before-baseline' });
    expect(mixed.invoices.map(row => row.id)).toContain('2001');
    expect(mixed.invoices.map(row => row.id)).not.toContain('2002');
    expect(mixed.invoices.map(row => row.id)).not.toContain('2003');
    expect(detail()).toMatchObject({ invoiceDate: '2026-09-25', firstEmailAt: revision, subtotal: '0.50' });
    const extended = { ...reporting, coverageStart: '2026-09-30', coverageFrom: reporting.calendar.startOfDay('2026-09-30') };
    expect(report<ReportingPage>('', '2026-09-30', '2026-09-30', extended).invoices.map(row => row.id)).toEqual(['2002']);
  });
});

describe('Structured invoice lines and product reporting', () => {
  it('retains exact high-precision strings and refuses ambiguous JSON numeric precision', () => {
    expect(normalizeInvoiceLines([{ ...line, rate: '9007199254.740991' }])?.[0].unitPrice).toBe('9007199254.740991');
    expect(normalizeInvoiceLines([{ ...line, rate: 9007199254.740992 }])).toBeNull();
  });

  it('rejects an original revision dated after the verified email and blocks provider IDs as CRM tenants', () => {
    const later = '2026-10-01T07:01:00.000Z';
    write({ last_modified_time: later }, { ...evidence, originalLineRevision: later });
    expect(report('/products')).toMatchObject({ invoicesWithoutOriginalLines: 1 });
    const providerId = '821729823';
    const invoice = mirrorInvoice(providerId, invoiceDetail.parse({ invoice: invoicePayload({
      salesperson_id: '1', created_time: '2026-09-30T16:00:00Z',
    }) }).invoice);
    saveSalesperson(reporting.db, providerId, '1', 'external-user', 'Provider fixture');
    transaction(reporting.db, () => upsertInvoice(reporting.db, invoice, evidence, at));
    const result = getScopedReporting(new URL('http://localhost' + reportingApi + '?preset=last-month'), reporting,
      { organizationId: providerId, credit: 'all' }, true);
    expect(result).toMatchObject({ count: 0, invoices: [] });
  });
  it('normalizes exact amounts and unknown identifiers, then freezes historical product revenue through edits and replays', () => {
    write();
    write();
    expect(detail()).toMatchObject({ lineState: 'reconciled', subtotalDifference: '0.00',
      lineItems: [
        { lineId: '200', productId: '201', sku: null, quantity: '0.100001', amount: '0.300001',
          discount: '10%', discountAmount: '0.033333', taxPercentage: '9.5', sourceRevision: revision },
        { lineId: '202', productId: null, sku: null, amount: '0.199999' },
      ],
    });
    const products = () => report<{
      products: unknown[]; skus: unknown[]; categories: unknown[]; purchaseHistory: unknown[];
      customers: unknown[]; salespeople: unknown[];
    }>('/products');
    const original = products();
    expect(original.products).toContainEqual(expect.objectContaining({ id: '201', currency: 'USD',
      quantity: '0.100001', allocatedRevenue: '0.300001', unit: 'case' }));
    expect(original.skus).toContainEqual(expect.objectContaining({ id: null, quantity: '0.200002', allocatedRevenue: '0.50' }));
    expect(original.categories).toContainEqual(expect.objectContaining({ id: '301', allocatedRevenue: '0.50' }));
    expect(original.customers).toContainEqual(expect.objectContaining({ id: '405', subtotal: '0.50' }));
    expect(original.purchaseHistory).toContainEqual(expect.objectContaining({ invoiceId: '2001', firstEmailAt: revision }));
    const latest = '2026-11-02T07:00:00Z';
    write({ last_modified_time: latest, customer_id: '406', customer_name: 'Edited buyer', sub_total: '0.60',
      balance: '0', total: '0.60', payment_made: '0.60', status: 'paid',
      line_items: [{ ...line, sku: 'EDITED', item_total: '0.60' }] }, { status: 'pending' });
    write(); // Older payload cannot roll back current payment or restore removed lines.
    expect(detail()).toMatchObject({ firstEmailAt: revision, subtotal: '0.50', currentSubtotal: '0.60', payment: 'paid',
      lineItems: [{ lineId: '200', sku: 'EDITED', sourceRevision: latest }] });
    expect(products()).toEqual(original);
    write({ last_modified_time: '2026-11-03T07:00:00Z', sub_total: '0', line_items: [] }, { status: 'pending' });
    expect(detail()).toMatchObject({ lineState: 'reconciled', lineItems: [] });
    expect(products()).toEqual(original);
  });

  it('reconciles an explicit invoice-level discount but holds product revenue without a line allocation', () => {
    write({ discount_type: 'entity_level', discount_amount: '0.10', sub_total: '0.40',
      adjustment: '0.25', shipping_charge: '0.15' }, { ...evidence, subtotal: '0.40' });
    expect(detail()).toMatchObject({ lineState: 'reconciled', invoiceDiscount: '0.10',
      invoiceAdjustment: '0.25', shippingCharge: '0.15', subtotalDifference: '0.00' });
    expect(report('/products')).toMatchObject({
      invoiceDiscountsUnallocated: 1,
      products: expect.arrayContaining([expect.objectContaining({ id: '201', quantity: '0.100001',
        allocatedRevenue: '0.00', linesWithoutRevenue: 1 })]),
      customers: expect.arrayContaining([expect.objectContaining({ id: '405', subtotal: '0.40' })]),
    });
  });

  it('separates currencies and holds unproven or discrepant snapshots out of SKU revenue', () => {
    write();
    write({ invoice_id: '2002', currency_code: 'CAD' }, { ...evidence, id: 'cad-2002', currency: 'CAD' });
    write({ invoice_id: '2003', line_items: [line] }, { ...evidence, id: 'different-2003' });
    write({ invoice_id: '2004' }, { ...evidence, id: 'missing-revision-2004', originalLineRevision: undefined });
    expect(report<ReportingInvoiceDetail>('/invoices/2003')).toMatchObject({
      lineState: 'difference', subtotalDifference: '0.199999',
    });
    expect(report('/products')).toMatchObject({
      invoicesWithoutOriginalLines: 2,
      products: expect.arrayContaining(['USD', 'CAD'].map(currency =>
        expect.objectContaining({ id: '201', currency, allocatedRevenue: '0.300001' }))),
    });
  });

  it('quarantines duplicate and malformed snapshots without deleting historical rows', () => {
    write();
    write({ last_modified_time: '2026-11-02T07:00:00Z', line_items: [line, line] });
    expect(detail()).toMatchObject({ lineState: 'invalid', lineItems: [] });
    write({ last_modified_time: '2026-11-03T07:00:00Z', line_items: undefined });
    expect(detail()).toMatchObject({ lineState: 'unavailable', lineItems: [] });
    expect(report('/products')).toMatchObject({ invoicesWithoutOriginalLines: 0 });
  });
});

describe('PDF media and response safety', () => {
  it.each([
    [404, 'application/pdf', null, 'Invoice PDF is unavailable.'],
    [200, 'text/html', '<h1>error</h1>', 'Invoice PDF could not be validated.'],
    [200, 'application/pdf', '%PDF-1.4\ntruncated', 'Invoice PDF could not be validated.'],
    [302, 'application/pdf', '%PDF-1.4\n%%EOF', 'Invoice PDF could not be validated.'],
  ] as const)('fails closed for status %s and media %s', async (status, type, body, message) => {
    const response = { writeHead: vi.fn(), end: vi.fn() };
    await expect(sendInvoicePdf(response as unknown as ServerResponse,
      new Response(body, { status, headers: { 'Content-Type': type } }))).rejects.toThrow(message);
    expect(response.writeHead).not.toHaveBeenCalled();
  });

  it('rejects oversized streamed bytes without relying on Content-Length', async () => {
    const response = { writeHead: vi.fn(), end: vi.fn() };
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array(maxInvoicePdfBytes));
        controller.enqueue(new Uint8Array(1));
        controller.close();
      },
    });
    await expect(sendInvoicePdf(response as unknown as ServerResponse, new Response(body, {
      headers: { 'Content-Type': 'application/pdf' },
    }))).rejects.toThrow('Invoice PDF could not be validated.');
    expect(response.writeHead).not.toHaveBeenCalled();
  });

  it('serves validated bytes with a fixed name and no shared caching', async () => {
    const response = { writeHead: vi.fn(), end: vi.fn() };
    const fixture = syntheticInvoicePdf('1001')!;
    await sendInvoicePdf(response as unknown as ServerResponse, new Response(new Uint8Array(fixture), {
      headers: { 'Content-Type': 'application/pdf;charset=UTF-8', 'Content-Disposition': 'attachment; filename=untrusted.pdf' },
    }));
    expect(response.writeHead).toHaveBeenCalledWith(200, expect.objectContaining({
      'Content-Disposition': 'inline; filename="invoice.pdf"', 'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff', 'Cross-Origin-Resource-Policy': 'same-origin',
    }));
    expect(response.end).toHaveBeenCalledWith(fixture);
  });
});
