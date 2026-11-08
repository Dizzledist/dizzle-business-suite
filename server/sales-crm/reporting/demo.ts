import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { calendarDayMs } from '../../../shared/reporting';
import type { ZohoInvoice } from '../zoho/invoice';
import { normalizeInvoiceLines } from '../zoho/invoice-lines';
import { defaultReportingTimeZone, reportingCalendar } from './dates';
import { openReportingDatabase, saveSalesperson, transaction } from './database';
import { demoOrganization, type RecognitionEvidence } from './model';
import { ReportingSync } from './sync';


export async function createSyntheticReporting({
  path = resolve('.sales-reporting-demo', 'invoices.sqlite'),
  timeZone = defaultReportingTimeZone,
  coverageStart = '2026-10-01',
  now = Date.now,
} = {}) {
  const calendar = reportingCalendar(timeZone);
  const coverageFrom = calendar.startOfDay(coverageStart);
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = openReportingDatabase(path);
  try {
    const start = now();
    const dates = calendar.resolve({ preset: 'mtd' }, start);
    const today = calendar.resolve({ preset: 'today' }, start).selected;
    const invoices = new Map<string, ZohoInvoice>();
    const evidence = new Map<string, RecognitionEvidence>();
    const put = (id: string, owner: '1' | '2', amount: string, balance: string, paid: string, first: number,
      status = 'sent', verified = true, currency = 'USD') => {
      const name = owner === '1' ? 'Juniper Sample Store' : 'Cedar Sample Store';
      const date = new Date(first - calendarDayMs).toISOString();
      const originalLineRevision = new Date(first).toISOString();
      const lineItems = normalizeInvoiceLines([{
        line_item_id: id + '1', item_id: owner,
        sku: owner === '1' ? 'SAMPLE-JUNIPER' : 'SAMPLE-CEDAR',
        name: owner === '1' ? 'Juniper case' : 'Cedar case',
        quantity: '1', unit: 'case', rate: amount, item_total: amount,
        discount: '0%', category_id: '1', category_name: 'Sample catalog',
      }]);
      invoices.set(id, {
        organizationId: demoOrganization, invoiceId: id, invoiceNumber: 'DEMO-' + id, customerId: owner,
        customerName: name, sourceSalespersonId: owner, sourceSalespersonName: null, currency,
        subtotal: amount, total: amount, balance, status, emailed: status !== 'draft',
        invoiceDate: date.slice(0, 10), createdAt: date, sourceModifiedAt: originalLineRevision,
        lineItems, discountType: 'item_level', inclusiveTax: false,
        paymentMade: paid, creditsApplied: '0', writeOffAmount: '0',
      });
      evidence.set(id, verified ? {
        status: 'verified', firstEmailAt: new Date(first).toISOString(), source: 'Synthetic send receipt',
        id: 'demo-send-' + id, subtotal: amount, salespersonId: owner, currency, originalLineRevision,
      } : { status: 'pending' });
    };

    const current = Math.max(today.from, start - 60 * 60_000);
    put('1001', '1', '925.75', '925.75', '0.00', current);
    put('1002', '1', '475.25', '125.25', '350.00', current, 'partially_paid');
    put('1003', '2', '1500.00', '0.00', '1500.00', current, 'paid');
    put('1004', '1', '640.00', '0.00', '640.00', dates.previous.from + 12 * 60 * 60_000, 'paid');
    put('1005', '2', '280.00', '280.00', '0.00', dates.previous.from + 12 * 60 * 60_000);
    put('1006', '1', '830.00', '830.00', '0.00', current, 'sent', false);
    put('1007', '2', '720.00', '720.00', '0.00', current, 'draft', false);
    put('1008', '1', '310.00', '0.00', '0.00', current, 'void', true);
    put('1009', '1', '235.50', '0.00', '235.50', current, 'paid', true, 'CAD');
    put('1010', '1', '395.50', '395.50', '0.00', dates.selected.from, 'sent');

    transaction(db, () => {
      saveSalesperson(db, demoOrganization, '1', 'rep-a', 'Rep A');
      saveSalesperson(db, demoOrganization, '2', 'rep-b', 'Rep B');
    });
    const sync = new ReportingSync(db, {
      organizationId: demoOrganization,
      async listInvoicePage(page, perPage = 20) {
        const ids = [...invoices.keys()];
        return { invoiceIds: ids.slice((page - 1) * perPage, page * perPage), hasMore: page * perPage < ids.length };
      },
      async getInvoice(id) {
        const invoice = invoices.get(id);
        if (!invoice) throw new Error('Missing synthetic invoice.');
        return invoice;
      },
    }, now, evidence);
    const checkpoint = db.prepare(`SELECT initial_done,
      EXISTS (SELECT 1 FROM reporting_sync_queue WHERE organization_id = ?) AS queued
      FROM reporting_sync_state WHERE organization_id = ?`).get(demoOrganization, demoOrganization);
    if ((!checkpoint?.initial_done || checkpoint.queued) && await sync.run('initial') !== 'complete') {
      throw new Error('Synthetic sync did not finish.');
    }
    return { db, calendar, now, coverageStart, coverageFrom };
  } catch (error) {
    db.close();
    throw error;
  }
}

export type SyntheticReporting = Awaited<ReturnType<typeof createSyntheticReporting>>;
