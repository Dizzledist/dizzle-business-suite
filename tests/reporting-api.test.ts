import { once } from 'node:events';
import { request as httpRequest } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApi } from '../server/api';
import { upsertInvoice } from '../server/sales-crm/reporting/database';
import { createSyntheticReporting, type SyntheticReporting } from '../server/sales-crm/reporting/demo';
import { invoiceDetail, mirrorInvoice } from '../server/sales-crm/zoho/invoice';
import { reportingApi, type ReportingPage } from '../shared/reporting';
import { invoicePayload } from './fixtures/zoho-invoices';
import { oauthFixture, oauthFixtureEnv } from './fixtures/zoho-oauth';

const now = Date.parse('2026-11-07T19:00:00Z');
let reporting: SyntheticReporting;
let api: ReturnType<typeof createApi>;

async function start(enabled = true, environment = 'test') {
  vi.stubEnv('SALES_CRM_ENABLED', String(enabled));
  vi.stubEnv('NODE_ENV', environment);
  const mock = oauthFixture();
  reporting = await createSyntheticReporting({ path: ':memory:', now: () => now });
  api = createApi(undefined, { config: mock.config, connection: mock.connection }, reporting);
  api.listen(0, '127.0.0.1');
  await once(api, 'listening');
  const port = (api.address() as AddressInfo).port;

  function request(path = '', identity?: string, method = 'GET', headers: Record<string, string> = {}) {
    return fetch('http://127.0.0.1:' + port + reportingApi + path,
      { method, headers: { ...(identity ? { 'X-Demo-Identity': identity } : {}), ...headers } });
  }
  async function report(path = '', identity = 'rep-a'): Promise<ReportingPage> {
    const response = await request(path, identity);
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    return response.json();
  }

  function operations(headers: Record<string, string>) {
    return new Promise<{ status: number; body: string }>((resolve, reject) => {
      const req = httpRequest({
        host: '127.0.0.1', port, path: reportingApi + '/operations',
        headers: { Host: 'localhost:3001', ...headers },
      }, response => {
        let body = '';
        response.setEncoding('utf8');
        response.on('data', chunk => { body += chunk; });
        response.on('end', () => resolve({ status: response.statusCode!, body }));
      });
      req.on('error', reject);
      req.end();
    });
  }

  return { request, report, operations, mock };
}

afterEach(async () => {
  if (api) {
    api.closeAllConnections();
    await new Promise<void>(resolve => api.close(() => resolve()));
  }
  reporting?.db.close();
  vi.unstubAllEnvs();
});

describe('Synthetic reporting API', () => {
  it('uses verified first email, groups exact money by currency, and shares the same range across cards, trend, and invoices', async () => {
    const { report, mock } = await start();
    const data = await report();
    expect(data).toMatchObject({
      source: 'synthetic', range: { selected: { start: '2026-11-01', end: '2026-11-07' },
        previous: { start: '2026-10-01', end: '2026-10-07' }, timeZone: 'America/Los_Angeles' },
      sales: [{ currency: 'CAD', subtotal: '235.50', count: 1 }, { currency: 'USD', subtotal: '1796.50', count: 3 }],
      previousSales: [{ currency: 'USD', subtotal: '640.00', count: 1 }],
      count: 4, reconciliationCount: 1,
    });
    expect(data.invoices.map(row => row.id)).toEqual(['1001', '1002', '1009', '1010']);
    expect(data.invoices[3].createdAt).toBe('2026-10-31T07:00:00.000Z');
    expect(data.trend.map(point => point.date)).toEqual(['2026-11-01', '2026-11-07']);
    expect(data.trend.flatMap(point => point.totals).reduce((sum, row) => sum + row.count, 0)).toBe(data.count);
    expect(mock.calls).toHaveLength(0);
  });

  it('combines payment and inclusive custom date filtering and applies it to detail', async () => {
    const { report, request } = await start();
    const range = '?preset=custom&start=2026-11-07&end=2026-11-07';
    const open = await report(range + '&payment=open');
    const closed = await report(range + '&payment=closed');
    const all = await report(range);
    expect(open.invoices.map(row => row.payment)).toEqual(['unpaid', 'partial']);
    expect(open.invoiceTotals).toEqual([{ currency: 'USD', subtotal: '1401.00', count: 2 }]);
    expect(open.invoices[1].balance).toBe('125.25');
    expect(closed.invoices.map(row => row.id)).toEqual(['1009']);
    expect(all.count).toBe(open.count + closed.count);
    expect(all.sales).toEqual(open.sales);
    expect((await request('/invoices/1001' + range + '&payment=open', 'rep-a')).status).toBe(200);
    expect((await request('/invoices/1001' + range + '&payment=closed', 'rep-a')).status).toBe(404);
    expect((await request('/invoices/1010' + range, 'rep-a')).status).toBe(404);
    expect((await request('/invoices/1006' + range, 'rep-a')).status).toBe(404);
  });

  it('scopes totals, search and ID lookups by credited rep and organization', async () => {
    const { report, request } = await start();
    expect((await report('?q=cedar')).count).toBe(0);
    expect((await report('', 'rep-b')).invoices.map(row => row.id)).toEqual(['1003']);
    expect((await report('', 'manager')).count).toBe(5);
    expect((await request('/invoices/1003', 'rep-a')).status).toBe(404);
    expect((await request('?repId=rep-b', 'rep-a')).status).toBe(400);
    expect((await request('?source=zoho', 'admin')).status).toBe(400);
  });

  it('paginates deterministically without affecting filtered and global summaries', async () => {
    const { report } = await start();
    for (let index = 0; index < 12; index++) {
      const id = String(2000 + index);
      const invoice = mirrorInvoice('demo-o1', invoiceDetail.parse({ invoice: invoicePayload({
        invoice_id: id, invoice_number: 'SEARCH-' + id, salesperson_id: '1',
      }) }).invoice);
      upsertInvoice(reporting.db, invoice, {
        status: 'verified', firstEmailAt: '2026-11-07T17:00:00Z', source: 'Synthetic evidence',
        id: 'evidence-' + id, subtotal: '100.23', salespersonId: '1', currency: 'USD',
      }, now);
    }
    const first = await report('?q=search-&sort=invoice');
    const next = await report('?q=SEARCH-&sort=invoice&page=2');
    expect(first).toMatchObject({ count: 12, page: 1, pageSize: 10 });
    expect(first.invoices.map(row => row.number)).toEqual(Array.from({ length: 10 }, (_, i) => 'SEARCH-' + (2000 + i)));
    expect(next.invoices.map(row => row.number)).toEqual(['SEARCH-2010', 'SEARCH-2011']);
    expect(next.sales).toEqual(first.sales);
    expect(next.invoiceTotals).toEqual(first.invoiceTotals);
  });

  it.each([undefined, 'disabled', 'warehouse', 'outside', 'revoked'] as const)('denies %s', async actor => {
    const { request } = await start();
    expect((await request('', actor)).status).toBe(actor === undefined || actor === 'disabled' ? 401 : 403);
  });

  it.each(['?preset=custom&start=2026-02-30&end=2026-03-01', '?preset=today&preset=yesterday',
    '?payment=paid', '?sort=constructor', '?page=0', '?preset=custom&start=2025-01-01&end=2026-01-03'])(
    'rejects invalid query %s', async query => {
      const { request } = await start();
      expect((await request(query, 'manager')).status).toBe(400);
    },
  );

  it('is read-only and disabled with the feature flag or production environment', async () => {
    const { request } = await start(false);
    expect((await request('', 'manager')).status).toBe(404);
    expect((await request('/invoices/1001', 'manager')).status).toBe(404);
  });

  it('does not expose the demo API even with a production flag', async () => {
    const { request } = await start(true, 'production');
    expect((await request('', 'manager')).status).toBe(404);
  });

  it('requires operator credentials for monitoring and keeps responses aggregate-only', async () => {
    const { operations, request, mock } = await start();
    const operator = { 'X-Demo-Identity': 'admin', 'X-Zoho-Local-Admin-Key': oauthFixtureEnv.ZOHO_LOCAL_ADMIN_KEY };
    expect((await operations({ 'X-Demo-Identity': 'admin' })).status).toBe(403);
    expect((await operations({ ...operator, 'X-Demo-Identity': 'rep-a' })).status).toBe(403);
    expect((await operations({ ...operator, Origin: 'http://127.0.0.1:5173' })).status).toBe(403);
    expect((await request('/operations', 'admin')).status).toBe(403);
    expect((await request('', 'admin', 'POST')).status).toBe(404);
    const result = await operations(operator);
    expect(result.status).toBe(200);
    expect(JSON.parse(result.body)).toMatchObject({
      zohoConnection: 'not-connected', source: 'synthetic', syncStatus: 'complete', recordsSynchronized: 10,
      pendingVerification: 2, failedRecords: 0, checkpoint: { initialComplete: true },
    });
    expect(result.body).not.toMatch(/demo-send|DEMO-100|Sample Store|token|secret/i);
    expect(mock.calls).toHaveLength(0);
  });
});
