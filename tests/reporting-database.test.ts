import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openReportingDatabase, saveSalesperson, transaction, upsertInvoice } from '../server/sales-crm/reporting/database';
import { decimalAmount, moneyUnits, settlement, type RecognitionEvidence } from '../server/sales-crm/reporting/model';
import { ReportingSync } from '../server/sales-crm/reporting/sync';
import { invoiceDetail, mirrorInvoice } from '../server/sales-crm/zoho/invoice';
import { ZohoReadError } from '../server/sales-crm/zoho/reader';
import { openSqliteDatabase } from '../server/sqlite';
import { invoicePayload, invoiceResponse, mockZoho, pageResponse, testOrganizationId } from './fixtures/zoho-invoices';

const now = Date.parse('2026-11-05T18:00:00Z');
const invoice = (overrides: Record<string, unknown> = {}) =>
  mirrorInvoice(testOrganizationId, invoiceDetail.parse({ invoice: invoicePayload(overrides) }).invoice);
const evidence = {
  status: 'verified', firstEmailAt: '2026-11-01T08:30:00Z', source: 'Synthetic send receipt',
  id: 'first-send-1001', subtotal: '100.23', salespersonId: '301', currency: 'USD',
} as const satisfies RecognitionEvidence;

let db: DatabaseSync;
let folder: string;
let file: string;
beforeEach(() => {
  folder = mkdtempSync(join(tmpdir(), 'dizzle-reporting-'));
  file = join(folder, 'test.sqlite');
  db = openReportingDatabase(file);
});
afterEach(() => {
  db.close();
  rmSync(folder, { recursive: true });
});

function row() {
  return db.prepare(`SELECT invoice_id, verification, first_email_at, credited_user_id, customer_id,
    CAST(recognized_subtotal AS TEXT) AS amount, CAST(open_balance AS TEXT) AS balance, payment, review_reason
    FROM reporting_invoices WHERE organization_id = ? AND invoice_id = '1001'`).get(testOrganizationId);
}

describe('Reporting persistence and recognition', () => {
  it('upgrades a version-one copy without changing its existing recognized invoice', () => {
    const oldFile = join(folder, 'legacy.sqlite');
    const old = openSqliteDatabase(oldFile,
      [new URL('../server/sales-crm/reporting/migrations/001-invoice-reporting.sql', import.meta.url)]);
    try {
      old.prepare(`INSERT INTO reporting_invoices (
        organization_id, invoice_id, invoice_number, customer_id, currency, subtotal, recognized_subtotal,
        first_email_at, evidence_source, evidence_id, verification, payment, open_balance, invoice_status, last_sync_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
        'demo-o1', '701', 'LEGACY-701', '1', 'USD', 5000000, 5000000, now, 'Fixture proof', 'proof-701',
        'verified', 'paid', 0, 'paid', now,
      );
    } finally {
      old.close();
    }
    const upgraded = openReportingDatabase(oldFile);
    try {
      expect(upgraded.prepare(`SELECT verification, first_email_at, recognized_subtotal, line_state,
        send_verification, amount_verification, original_snapshot, current_snapshot, send_evidence, amount_evidence
        FROM reporting_invoices WHERE invoice_id = '701'`).get()).toMatchObject({
        verification: 'verified', first_email_at: now, recognized_subtotal: 5000000, line_state: 'unavailable',
        send_verification: 'verified', amount_verification: 'verified', original_snapshot: null, current_snapshot: null,
        send_evidence: null, amount_evidence: null,
      });
      expect(upgraded.prepare('SELECT COUNT(*) AS count FROM reporting_invoice_lines').get()).toMatchObject({ count: 0 });
    } finally {
      upgraded.close();
    }
  });
  it('migrates once and persists one invoice after replay, payment and customer/salesperson reassignment', () => {
    saveSalesperson(db, testOrganizationId, '301', 'rep-a', 'Rep A');
    transaction(db, () => upsertInvoice(db, invoice(), evidence, now));
    saveSalesperson(db, testOrganizationId, '301', 'rep-b', 'Rep B');
    upsertInvoice(db, invoice({
      customer_id: '803', salesperson_id: '302', sub_total: '150.00', balance: '60.25', payment_made: '50.00',
      last_modified_time: '2026-11-04T10:00:00Z',
    }), evidence, now);
    upsertInvoice(db, invoice(), { status: 'pending' }, now); // older snapshot cannot roll back settlement
    db.close();
    db = openReportingDatabase(file);
    expect(db.prepare('PRAGMA user_version').get()).toMatchObject({ user_version: 3 });
    expect(db.prepare('SELECT COUNT(*) AS count FROM reporting_invoices').get()).toMatchObject({ count: 1 });
    expect(row()).toMatchObject({ verification: 'verified', credited_user_id: 'rep-a', customer_id: '803',
      first_email_at: Date.parse(evidence.firstEmailAt), amount: '100230000', balance: '60250000', payment: 'partial' });
  });

  it('preserves the captured first send on later provider refresh and flags competing first-send evidence', () => {
    saveSalesperson(db, testOrganizationId, '301', 'rep-a', 'Rep A');
    upsertInvoice(db, invoice(), evidence, now);
    upsertInvoice(db, invoice(), { status: 'unavailable' }, now);
    expect(row()?.verification).toBe('verified');
    upsertInvoice(db, invoice(), { ...evidence, id: 'conflicting-candidate', firstEmailAt: '2026-11-03T00:00:00Z' }, now);
    expect(row()).toMatchObject({ verification: 'conflicting', first_email_at: Date.parse(evidence.firstEmailAt) });
    upsertInvoice(db, invoice(), evidence, now);
    expect(row()?.verification).toBe('conflicting');
  });

  it.each(['2026-02-30T00:00:00Z', '2026-11-02T10:00:00', '2026-10-01T00:00:00Z', '2026-11-06T00:00:00Z'])(
    'holds invalid first-send timestamp %s', firstEmailAt => {
      upsertInvoice(db, invoice(), { ...evidence, firstEmailAt }, now);
      expect(row()).toMatchObject({ verification: 'conflicting', first_email_at: null });
    },
  );

  it.each(['pending', 'unavailable', 'conflicting'] as const)('does not infer a timestamp from email flag or creation when %s', status => {
    upsertInvoice(db, invoice(), { status }, now);
    expect(row()).toMatchObject({ verification: status, first_email_at: null });
  });

  it.each([
    [{ status: 'paid', balance: '0', payment_made: '110.25' }, 'paid', null],
    [{ status: 'sent', balance: '60.25', payment_made: '50' }, 'partial', null],
    [{ status: 'sent' }, 'unpaid', null],
    [{ status: 'draft', is_emailed: false }, 'review', 'draft'],
    [{ status: 'sent', is_emailed: false }, 'review', 'email-unconfirmed'],
    [{ status: 'void' }, 'review', 'adjustment'],
    [{ status: 'refunded' }, 'review', 'adjustment'],
    [{ status: 'paid', balance: '0', credits_applied: '110.25' }, 'review', 'ambiguous-settlement'],
    [{ status: 'paid', balance: '0', write_off_amount: '110.25' }, 'review', 'ambiguous-settlement'],
    [{ status: 'paid', balance: '0', payment_made: null }, 'review', 'ambiguous-settlement'],
  ] as const)('classifies payment using current settlement evidence %#', (fields, payment, reason) => {
    expect(settlement(invoice(fields))).toEqual({ payment, reason });
  });

  it('keeps money precise and rejects fractions that exceed the supported scale', () => {
    expect(decimalAmount(moneyUnits('9007199254.740991') + moneyUnits('0.000001'))).toBe('9007199254.740992');
    expect(decimalAmount(moneyUnits('0.10') + moneyUnits('0.20'))).toBe('0.30');
    expect(() => moneyUnits('0.0000001')).toThrow(RangeError);
  });
});

describe('Durable sync', () => {
  it('checkpoints a bounded import, resumes from disk, reuses GET retries/refresh and upserts duplicates', async () => {
    let pageTwo = 0;
    let detail = 0;
    const mock = mockZoho(request => {
      const url = new URL(request.url);
      if (url.pathname.endsWith('/invoices')) {
        expect(url.searchParams.get('per_page')).toBe('20');
        if (url.searchParams.get('page') === '1') return pageResponse(1, ['1001'], true);
        if (++pageTwo === 1) return new Response(null, { status: 429, headers: { 'Retry-After': '1' } });
        return pageResponse(2, ['1001', '1002'], false);
      }
      if (detail++ === 0) return new Response(null, { status: 401 });
      return invoiceResponse({ invoice_id: url.pathname.split('/').at(-1) });
    });
    expect(await new ReportingSync(db, mock.reader, () => now).run('initial', 1)).toBe('partial');
    db.close();
    db = openReportingDatabase(file);
    const sync = new ReportingSync(db, mock.reader, () => now);
    expect(await sync.run('initial')).toBe('complete');
    sync.enqueueChanges(['1001', '1001']);
    expect(await sync.run('incremental')).toBe('complete');
    expect(db.prepare('SELECT COUNT(*) AS count FROM reporting_invoices').get()).toMatchObject({ count: 2 });
    expect(db.prepare('SELECT * FROM reporting_sync_state').get()).toMatchObject({
      next_page: 3, initial_done: 1, status: 'complete', records_processed: 4, last_success_at: now,
    });
    expect(mock.delays).toContain(1000);
    expect(mock.refreshes).toContain(true);
    expect(mock.requests.every(request => request.method === 'GET' && !request.url.includes('/comments'))).toBe(true);
  });

  it('keeps failed work durable, applies backoff and permits explicit replay after retry exhaustion', async () => {
    let clock = now;
    let fail = true;
    const sync = new ReportingSync(db, {
      organizationId: testOrganizationId,
      async listInvoicePage() { throw new Error('Incremental jobs do not scan pages.'); },
      async getInvoice() {
        if (fail) throw new ZohoReadError('unavailable');
        return invoice();
      },
    }, () => clock);
    sync.enqueueChanges(['1001']);
    expect(await sync.run('incremental')).toBe('failed');
    expect(await sync.run('incremental')).toBe('failed'); // too early to retry
    expect(db.prepare('SELECT attempts, error_category FROM reporting_sync_queue').get())
      .toMatchObject({ attempts: 1, error_category: 'unavailable' });
    clock += 1000;
    expect(await sync.run('incremental')).toBe('failed');
    clock += 2000;
    expect(await sync.run('incremental')).toBe('failed');
    expect(db.prepare('SELECT attempts FROM reporting_sync_queue').get()).toMatchObject({ attempts: 3 });
    fail = false;
    clock += 10_000;
    expect(await sync.run('incremental')).toBe('failed'); // exhausted
    sync.enqueueChanges(['1001']);
    expect(await sync.run('incremental')).toBe('complete');
    expect(row()?.verification).toBe('pending');
    expect(db.prepare('SELECT * FROM reporting_sync_state').get())
      .toMatchObject({ retries: 2, last_error: null, last_success_at: clock });
  });

  it('fences an interrupted worker after lease takeover and keeps the replacement snapshot', async () => {
    let clock = now;
    let release!: () => void;
    const suspended = new Promise<void>(resolve => { release = resolve; });
    const worker = new ReportingSync(db, {
      organizationId: testOrganizationId,
      async listInvoicePage() { return { invoiceIds: ['1001'], hasMore: false }; },
      async getInvoice() { await suspended; return invoice({ balance: '110.25' }); },
    }, () => clock);
    const oldRun = worker.run('initial');
    await Promise.resolve(); // discovery has committed before the first detail request
    const secondDb = openReportingDatabase(file);
    try {
      const replacement = new ReportingSync(secondDb, {
        organizationId: testOrganizationId,
        async listInvoicePage() { throw new Error('The page checkpoint should have survived.'); },
        async getInvoice() { return invoice({ balance: '90.25', payment_made: '20.00' }); },
      }, () => clock);
      expect(await replacement.run('initial')).toBe('busy');
      clock += 61_000;
      expect(await replacement.run('initial')).toBe('complete');
      release();
      expect(await oldRun).toBe('interrupted');
      expect(row()).toMatchObject({ payment: 'partial', balance: '90250000' });
    } finally {
      release();
      await oldRun;
      secondDb.close();
    }
  });
});
