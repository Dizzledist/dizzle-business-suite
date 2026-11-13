import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openReportingDatabase, saveSalesperson, transaction, upsertInvoice } from '../server/sales-crm/reporting/database';
import { reportingCalendar } from '../server/sales-crm/reporting/dates';
import type { SyntheticReporting } from '../server/sales-crm/reporting/demo';
import { validatedReview } from '../server/sales-crm/reporting/evidence';
import { getReconciliation } from '../server/sales-crm/reporting/reconciliation';
import type { RecognitionEvidence } from '../server/sales-crm/reporting/model';
import { getScopedReporting } from '../server/sales-crm/reporting/routes';
import { invoiceDetail, mirrorInvoice } from '../server/sales-crm/zoho/invoice';
import { observeInvoiceHistory, prepareThreeInvoiceTest } from '../server/sales-crm/zoho/validation-plan';
import { reconciliationApi, type RevenueReview } from '../shared/reconciliation';
import { reportingApi, type ReportingPage } from '../shared/reporting';
import fixture from './fixtures/management-parity-input.json';
import management from './fixtures/management-parity-reference.json';
import { invoicePayload } from './fixtures/zoho-invoices';

const now = Date.parse('2026-11-07T19:00:00Z');
const first = '2026-10-01T07:00:00Z';
let reporting: SyntheticReporting;

beforeEach(() => {
  const db = openReportingDatabase(':memory:');
  const calendar = reportingCalendar('America/Los_Angeles');
  reporting = { db, calendar, now: () => now, coverageStart: '2026-10-01', coverageFrom: calendar.startOfDay('2026-10-01') };
  saveSalesperson(db, 'demo-o1', '301', 'rep-a', 'Original Rep');
});
afterEach(() => reporting.db.close());

function review(): RevenueReview {
  const common = { status: 'verified' as const, source: 'Synthetic archived receipt', type: 'synthetic-receipt' as const,
    reference: 'archive-1001', eventId: 'sent-1001', verifiedAt: '2026-11-06T20:00:00Z', notes: 'Reviewed synthetic original receipt.' };
  return { send: { ...common, value: first, successful: true, firstSend: true }, amount: { ...common, value: '100' } };
}
function proof(extra: Partial<RevenueReview> = {}): Extract<RecognitionEvidence, { status: 'verified' }> {
  return { status: 'verified', firstEmailAt: first, source: 'Synthetic receipt', id: 'original-1001',
    subtotal: '100', salespersonId: '301', currency: 'USD', originalLineRevision: first, review: { ...review(), ...extra } };
}
function write(fields: Record<string, unknown> = {}, evidence: RecognitionEvidence = proof()) {
  const source = mirrorInvoice('demo-o1', invoiceDetail.parse({ invoice: invoicePayload({
    sub_total: '100', total: '110', balance: '110', created_time: '2026-09-25T19:00:00Z',
    date: '2026-09-25', last_modified_time: first, discount_type: 'item_level', is_inclusive_tax: false,
    shipping_charge: '10', line_items: [{ line_item_id: '1', item_id: '2', sku: 'SYNTHETIC',
      name: 'Fixture product', quantity: '2', rate: '50', item_total: '100' }], ...fields,
  }) }).invoice);
  transaction(reporting.db, () => upsertInvoice(reporting.db, source, evidence, now));
}
const report = (query = '?preset=last-month') =>
  getReconciliation(new URL('http://localhost' + reconciliationApi + query), reporting, 'demo-o1');
const normal = () => getScopedReporting(new URL('http://localhost' + reportingApi + '?preset=last-month'), reporting,
  { organizationId: 'demo-o1', credit: 'all' }, true) as ReportingPage;

describe('Independent first-email and original amount evidence', () => {
  it('recognizes a September creation first emailed at local October midnight and captures immutable lines and adjustments', () => {
    write();
    expect(normal()).toMatchObject({ count: 1, sales: [{ currency: 'USD', subtotal: '100.00', count: 1 }] });
    expect(report().invoices[0]).toMatchObject({
      invoiceDate: '2026-09-25', firstEmailAt: '2026-10-01T07:00:00.000Z', originalSubtotal: '100.00',
      crmPeriod: '2026-10', managementPeriod: '2026-09', managementIncluded: false, crmIncluded: true,
      sendEvidence: { status: 'verified' }, amountEvidence: { status: 'verified' }, originalLinesAvailable: true,
      reasons: expect.arrayContaining(['different-reporting-date', 'subtotal-versus-total', 'tax-or-shipping']),
    });
    const original = reporting.db.prepare("SELECT original_snapshot FROM reporting_invoices WHERE invoice_id = '1001'").get();
    expect(JSON.parse(String(original?.original_snapshot))).toMatchObject({ subtotal: '100', shippingCharge: '10',
      lineItems: [{ quantity: '2' }] });
  });

  it.each(['pending', 'unavailable', 'conflicting'] as const)('excludes %s original amount even with a verified email', status => {
    write({}, proof({ amount: { ...review().amount, status } }));
    expect(normal().count).toBe(0);
    expect(report().invoices[0]).toMatchObject({ sendEvidence: { status: 'verified' }, amountEvidence: { status }, crmIncluded: false });
  });

  it('retains the first candidate without recognizing an unverified email', () => {
    write({}, proof({ send: { ...review().send, status: 'pending', successful: false, firstSend: false } }));
    expect(normal().count).toBe(0);
    expect(report().invoices[0]).toMatchObject({ firstEmailCandidate: first, firstEmailAt: null,
      sendEvidence: { status: 'pending' }, amountEvidence: { status: 'verified' } });
  });

  it.each([
    { successful: false }, { firstSend: false }, { value: '2026-10-01T07:00:00' },
    { type: 'unclassified-history' as const }, { reference: null }, { verifiedAt: null }, { notes: '' },
  ])('rejects insufficient verified send evidence %#', send => {
    write({}, proof({ send: { ...review().send, ...send } }));
    expect(normal().count).toBe(0);
    expect(report('?preset=custom&start=2026-09-01&end=2026-10-31').invoices[0].sendEvidence.status).toBe('conflicting');
  });

  it('rejects amount proof that differs from the claimed original subtotal', () => {
    write({}, proof({ amount: { ...review().amount, value: '110' } }));
    expect(normal().count).toBe(0);
    expect(report().invoices[0].verification).toBe('conflicting');
  });

  it('rejects malformed amounts and a verification timestamp before the candidate', () => {
    expect(validatedReview({ ...review(), amount: { ...review().amount, value: '1e5' } }, now).amount.status).toBe('conflicting');
    expect(validatedReview({ ...review(), send: { ...review().send, verifiedAt: '2026-09-30T19:00:00Z' } }, now).send.status)
      .toBe('conflicting');
  });

  it('preserves original subtotal, quantities and credit after edits, resend reads, payment and reassignment', () => {
    write();
    write();
    const count = () => reporting.db.prepare('SELECT COUNT(*) AS count FROM reporting_evidence_reviews').get()?.count;
    expect(count()).toBe(1);
    saveSalesperson(reporting.db, 'demo-o1', '301', 'rep-b', 'Later Rep');
    write({ sub_total: '160', total: '176', balance: '0', payment_made: '176', status: 'paid', salesperson_id: '302',
      last_modified_time: '2026-11-01T20:00:00Z',
      line_items: [{ line_item_id: '2', item_id: '3', name: 'Changed fixture', quantity: '4', rate: '40', item_total: '160' }],
    }, { status: 'pending' });
    write(); // Older payload cannot restore current values.
    expect(report().invoices[0]).toMatchObject({
      originalSubtotal: '100.00', currentSubtotal: '160.00', currentTotal: '176', payment: 'paid',
      originalSalesperson: 'Original Rep',
      reasons: expect.arrayContaining(['edited-after-send', 'salesperson-difference']),
    });
    expect(normal().sales).toEqual([{ currency: 'USD', subtotal: '100.00', count: 1 }]);
    const snapshot = reporting.db.prepare('SELECT original_snapshot FROM reporting_invoices').get()!.original_snapshot;
    expect(JSON.parse(String(snapshot)).lineItems[0].quantity).toBe('2');
    expect(count()).toBe(1);
  });

  it('audits conflicting re-attestations and withholds the frozen original from recognized totals', () => {
    write();
    write({ last_modified_time: '2026-11-01T20:00:00Z' }, {
      ...proof(), review: { ...review(), send: { ...review().send, value: '2026-10-02T07:00:00Z' } },
    });
    expect(normal().count).toBe(0);
    expect(report().invoices[0]).toMatchObject({ originalSubtotal: '100.00', verification: 'conflicting' });
    expect(reporting.db.prepare('SELECT COUNT(*) AS count FROM reporting_evidence_reviews').get()?.count).toBe(2);
  });

  it('keeps pre-October first sends outside coverage while supporting a later explicit backfill', () => {
    const earlier = '2026-10-01T06:59:59Z';
    write({}, { ...proof(), firstEmailAt: earlier,
      review: { ...review(), send: { ...review().send, value: earlier } }, originalLineRevision: earlier });
    expect(normal().count).toBe(0);
    const selected = '?preset=custom&start=2026-09-01&end=2026-10-31';
    expect(report(selected)).toMatchObject({ coverageIncomplete: true, crm: [] });
    expect(report(selected).invoices[0].crmPeriod).toBe('2026-09');
  });
});

describe('Current settlement and calendar reconciliation', () => {
  it.each([
    ['paid', '0', '110', 'paid', true],
    ['sent', '110', '0', 'unpaid', true],
    ['partially_paid', '40', '70', 'partial', true],
    ['draft', '110', '0', 'review', false],
    ['void', '110', '0', 'review', false],
    ['canceled', '110', '0', 'review', false],
    ['unknown', '110', '0', 'review', false],
    ['paid', '10', '110', 'review', false],
  ] as const)('keeps %s payment independent of recognition', (status, balance, paid, payment, qualifies) => {
    write({ status, balance, payment_made: paid, date: '2026-10-01' });
    expect(report().invoices[0]).toMatchObject({ payment, crmIncluded: qualifies });
    if (status === 'draft') expect(report().invoices[0].managementIncluded).toBe(true);
    if (status === 'void') expect(report().invoices[0].managementIncluded).toBe(false);
  });

  it.each(['mtd', 'last-month', 'this-quarter', 'last-quarter', 'ytd', 'custom'])('uses the shared calendar for %s', preset => {
    write();
    const query = preset === 'custom' ? '?preset=custom&start=2026-10-01&end=2026-10-31' : '?preset=' + preset;
    const expected = reporting.calendar.resolve(preset === 'custom'
      ? { preset, start: '2026-10-01', end: '2026-10-31' } : { preset: preset as 'mtd' }, now);
    expect(report(query).range.selected).toEqual(expected.selected);
    expect(report(query).range.timeZone).toBe('America/Los_Angeles');
  });

  it('reproduces the approved Management and CRM October baseline using persisted original receipts', () => {
    for (const item of fixture.invoices) {
      const source = mirrorInvoice('demo-o1', invoiceDetail.parse({ invoice: item.zoho }).invoice);
      saveSalesperson(reporting.db, 'demo-o1', '501', 'parity', 'Fixture Rep');
      const evidence: RecognitionEvidence = item.firstEmailAt && item.originalSubtotal ? {
        status: 'verified', firstEmailAt: item.firstEmailAt, subtotal: item.originalSubtotal,
        source: 'Synthetic receipt', id: 'receipt-' + item.zoho.invoice_id, salespersonId: '501', currency: 'USD',
      } : { status: 'pending' };
      transaction(reporting.db, () => upsertInvoice(reporting.db, source, evidence, now));
    }
    expect(report()).toMatchObject({ management: [{ currency: 'USD', count: management.filters.all.count, subtotal: '414.00' }],
      crm: [{ currency: 'USD', count: 3, subtotal: '300.00' }], differences: [{ currency: 'USD', amount: '114.00' }] });
  });

  it('keeps currency totals separate and flags a changed current currency without relabeling its original snapshot', () => {
    write({ date: '2026-10-01' });
    write({ invoice_id: '1002', currency_code: 'CAD', date: '2026-10-01' }, { ...proof(), currency: 'CAD', id: 'original-1002' });
    expect(report().crm).toEqual([
      { currency: 'CAD', count: 1, subtotal: '100.00' }, { currency: 'USD', count: 1, subtotal: '100.00' },
    ]);
    write({ currency_code: 'EUR', date: '2026-10-01', last_modified_time: '2026-11-01T20:00:00Z' }, { status: 'pending' });
    expect(report().management.map(value => value.currency)).toEqual(['CAD', 'EUR']);
    expect(report().crm).toEqual([{ currency: 'CAD', count: 1, subtotal: '100.00' }]);
    expect(report().invoices.find(value => value.id === '1001')).toMatchObject({
      currency: 'USD', currentCurrency: 'EUR', originalSubtotal: '100.00', verification: 'conflicting', crmIncluded: false,
    });
  });

  it('isolates tenants and rejects organization switching and invalid query inputs', () => {
    const url = (query: string) => new URL('http://localhost' + reconciliationApi + query);
    expect(() => getReconciliation(url(''), reporting, 'another-tenant')).toThrow('unavailable for this tenant');
    expect(() => getReconciliation(url('?organizationId=821729823'), reporting, 'demo-o1')).toThrow('Invalid');
    expect(() => getReconciliation(url('?preset=mtd&preset=ytd'), reporting, 'demo-o1')).toThrow('Invalid');
    expect(() => getReconciliation(url('?page=0'), reporting, 'demo-o1')).toThrow('Invalid');
  });
});

describe('Bounded history preparation', () => {
  it('prepares only seven fixed GETs for exactly three IDs without PDF, listing or retry requests', () => {
    const plan = prepareThreeInvoiceTest(['101', '102', '103']);
    expect(plan.requests.map(row => row.path)).toEqual(['/organizations',
      '/invoices/101?organization_id=821729823', '/invoices/101/comments?organization_id=821729823',
      '/invoices/102?organization_id=821729823', '/invoices/102/comments?organization_id=821729823',
      '/invoices/103?organization_id=821729823', '/invoices/103/comments?organization_id=821729823']);
    expect(plan.requests.every(row => row.method === 'GET')).toBe(true);
    expect(plan).toMatchObject({ requiresSeparateApproval: true, inventoryRetries: 0, maxInventoryAttempts: 7 });
    expect(() => prepareThreeInvoiceTest(['101', '101', '103'])).toThrow();
    expect(() => prepareThreeInvoiceTest(['101', '../102', '103'])).toThrow();
    expect(() => prepareThreeInvoiceTest(['101'])).toThrow();
  });

  it('keeps failed, sent and resent labels unverified and refuses to invent timezone information', () => {
    const events = ['Failed email', 'Email sent', 'Resent'].map((operation, index) => ({
      comment_id: String(index + 1), operation_type: operation, comment_type: 'system', date: '2026-10-01', time: '2:38 AM',
    }));
    expect(observeInvoiceHistory(events)).toEqual(events.map(event => expect.objectContaining({
      sourceEventId: event.comment_id, candidateAt: null, successful: null, firstSend: null, verification: 'pending',
    })));
  });
});
