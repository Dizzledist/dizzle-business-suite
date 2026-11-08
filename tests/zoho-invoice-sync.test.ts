import { describe, expect, it } from 'vitest';
import { ZohoInvoiceSync } from '../server/sales-crm/zoho/sync';
import { invoiceResponse, mockZoho, pageResponse, testInvoiceId, testSalespersonId } from './fixtures/zoho-invoices';

const mappedReps = new Map([[testSalespersonId, 'rep-a']]);
const syncDate = '2026-11-07T18:00:00.000Z';

describe('Zoho invoice reconciliation with synthetic reads', () => {
  it('deduplicates pages and changed-ID hints and does not assign credit from observed ownership', async () => {
    let currentSalesperson = testSalespersonId;
    const { reader, requests } = mockZoho(request => {
      const url = new URL(request.url);
      const page = Number(url.searchParams.get('page'));
      if (page) return pageResponse(page, page === 1 ? ['1001'] : ['1001', '1002'], page === 1);
      return invoiceResponse({ invoice_id: url.pathname.split('/').at(-1), salesperson_id: currentSalesperson });
    });
    const sync = new ZohoInvoiceSync(reader, mappedReps, () => new Date(syncDate));
    expect(await sync.reconcile()).toEqual({ outcome: 'synced' });
    expect(sync.status()).toEqual({ invoiceCount: 2, lastSuccessfulSyncAt: syncDate, lastFailure: null });
    expect(requests).toHaveLength(4);
    expect(sync.getInvoice('1001')?.review).toEqual(['first-email-unverified']);

    currentSalesperson = '999';
    expect(await sync.reconcile(['1001', '1001'])).toEqual({ outcome: 'synced' });
    expect(requests).toHaveLength(5);
    expect(sync.status().invoiceCount).toBe(2);
    expect(sync.getInvoice('1001')).toMatchObject({
      invoice: { sourceSalespersonId: '999' },
      review: ['first-email-unverified', 'unmapped-salesperson'],
    });
    expect(sync.getInvoice('1001')).not.toHaveProperty('creditedSalesperson');
  });

  it.each([
    ['draft', false, ['draft', 'unemailed']],
    ['sent', false, ['unemailed']],
    ['sent', true, ['first-email-unverified']],
    ['paid', null, ['first-email-unverified']],
    ['void', true, ['void-or-cancelled', 'first-email-unverified']],
  ])('holds %s with emailed=%s from verified sales', async (status, emailed, review) => {
    const { reader } = mockZoho(() => invoiceResponse({ status, is_emailed: emailed }));
    const sync = new ZohoInvoiceSync(reader, mappedReps);
    await sync.reconcile([testInvoiceId]);
    expect(sync.getInvoice(testInvoiceId)?.review).toEqual(review);
  });

  it('keeps the prior snapshot and successful sync when a later read in the batch fails', async () => {
    let failed = false;
    let now = new Date(syncDate);
    const { reader } = mockZoho(request => {
      const invoiceId = new URL(request.url).pathname.split('/').at(-1);
      if (failed && invoiceId === '1002') return new Response(null, { status: 503 });
      return invoiceResponse({ invoice_id: invoiceId, balance: failed ? '25.00' : '110.25' });
    });
    const sync = new ZohoInvoiceSync(reader, mappedReps, () => now);
    await sync.reconcile(['1001']);
    failed = true;
    now = new Date('2026-11-08T18:00:00Z');
    expect(await sync.reconcile(['1001', '1002'])).toEqual({ outcome: 'failed', kind: 'unavailable' });
    expect(sync.status()).toMatchObject({
      invoiceCount: 1, lastSuccessfulSyncAt: syncDate,
      lastFailure: { kind: 'unavailable', at: now.toISOString() },
    });
    expect(sync.getInvoice('1001')?.invoice.balance).toBe('110.25');
    expect(sync.getInvoice('1002')).toBeUndefined();

    failed = false;
    expect(await sync.reconcile(['1001', '1002'])).toEqual({ outcome: 'synced' });
    expect(sync.status()).toEqual({ invoiceCount: 2, lastSuccessfulSyncAt: now.toISOString(), lastFailure: null });
  });

  it('blocks overlapping jobs and leaves empty changed-ID hints as a no-op', async () => {
    let release = () => {};
    const pending = new Promise<void>(resolve => { release = resolve; });
    const { reader, requests } = mockZoho(async () => { await pending; return invoiceResponse(); });
    const sync = new ZohoInvoiceSync(reader, mappedReps);
    expect(await sync.reconcile([])).toEqual({ outcome: 'no-changes' });
    expect(sync.status().lastSuccessfulSyncAt).toBeNull();
    const first = sync.reconcile([testInvoiceId]);
    try {
      expect(await sync.reconcile([testInvoiceId])).toEqual({ outcome: 'busy' });
    } finally {
      release();
    }
    expect(await first).toEqual({ outcome: 'synced' });
    expect(requests).toHaveLength(1);
  });

  it('retains prior records after absent list rows or an older source revision', async () => {
    let older = false;
    const { reader } = mockZoho(request => {
      const url = new URL(request.url);
      if (url.searchParams.has('page')) return pageResponse(1, [], false);
      return older ? invoiceResponse({ last_modified_time: '2026-11-01T08:00:00Z', balance: '1.00' }) : invoiceResponse();
    });
    const sync = new ZohoInvoiceSync(reader, mappedReps);
    await sync.reconcile([testInvoiceId]);
    older = true;
    await sync.reconcile([testInvoiceId]);
    await sync.reconcile();
    expect(sync.status().invoiceCount).toBe(1);
    expect(sync.getInvoice(testInvoiceId)?.invoice.balance).toBe('110.25');
  });
});
