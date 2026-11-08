import { describe, expect, it } from 'vitest';
import { invoiceResponse, mockZoho, pageResponse, testInvoiceId, testOrganizationId } from './fixtures/zoho-invoices';

describe('Zoho Inventory read-only invoice adapter', () => {
  it('requests pages in the configured organization with a header-only OAuth token', async () => {
    const { reader, requests } = mockZoho(request => {
      const page = Number(new URL(request.url).searchParams.get('page'));
      return pageResponse(page, [page === 1 ? '1001' : '1002'], page === 1);
    });
    expect(await reader.listInvoicePage(1)).toEqual({ invoiceIds: ['1001'], hasMore: true });
    expect(await reader.listInvoicePage(2)).toEqual({ invoiceIds: ['1002'], hasMore: false });
    for (const request of requests) {
      const url = new URL(request.url);
      expect(url.origin).toBe('https://www.zohoapis.com');
      expect(url.pathname).toBe('/inventory/v1/invoices');
      expect(url.searchParams.get('organization_id')).toBe(testOrganizationId);
      expect(url.searchParams.get('per_page')).toBe('200');
      expect(url.search).not.toContain('fixture-token');
      expect(request.headers.get('Authorization')).toBe('Zoho-oauthtoken fixture-token');
      expect(request.method).toBe('GET');
      expect(request.redirect).toBe('error');
    }
  });

  it('normalizes exact source amounts, keeps original IDs and discards unneeded provider fields', async () => {
    const largeId = '982000000567114000';
    const { reader } = mockZoho(() => invoiceResponse({
      invoice_id: largeId, customer_id: 801, salesperson_id: ' ',
      invoice_url: 'https://example.invalid/private-link', notes: 'discard this',
    }));
    expect(await reader.getInvoice(largeId)).toEqual({
      organizationId: testOrganizationId, invoiceId: largeId, invoiceNumber: 'TEST-001',
      customerId: '801', customerName: 'Fixture account',
      sourceSalespersonId: null, sourceSalespersonName: 'Fixture rep',
      currency: 'USD', subtotal: '100.23', total: '110.25', balance: '110.25',
      status: 'sent', emailed: true, invoiceDate: '2026-10-28',
      createdAt: '2026-10-28T10:00:00-07:00', sourceModifiedAt: '2026-11-02T10:00:00-08:00',
      paymentMade: '0', creditsApplied: '0', writeOffAmount: '0',
    });
  });

  it('treats the dated history as evidence candidates without promoting operation labels', async () => {
    const { reader, requests } = mockZoho(() => Response.json({
      code: 0,
      comments: [{
        comment_id: '601', invoice_id: testInvoiceId, comment_type: 'system', operation_type: 'Emailed',
        date: '2026-11-01', time: '1:02 AM', description: 'discard this provider text',
      }],
    }));
    expect(await reader.getInvoiceHistory(testInvoiceId)).toEqual({
      events: [{
        comment_id: '601', invoice_id: testInvoiceId, comment_type: 'system', operation_type: 'Emailed',
        date: '2026-11-01', time: '1:02 AM',
      }],
      firstSuccessfulEmailAt: null,
    });
    expect(new URL(requests[0].url).pathname).toBe('/inventory/v1/invoices/1001/comments');
  });

  it.each([
    { organization_id: '902' }, { invoice_id: '1002' },
    { invoice_id: Number.MAX_SAFE_INTEGER + 1 }, { sub_total: 'invalid' },
  ])('rejects mismatched identity or malformed source detail %#', async overrides => {
    const { reader } = mockZoho(() => invoiceResponse(overrides));
    await expect(reader.getInvoice(testInvoiceId)).rejects.toMatchObject({ kind: 'invalid-response' });
  });

  it('rejects a path-shaped invoice ID without any outbound request', async () => {
    const { reader, requests } = mockZoho(() => invoiceResponse());
    await expect(reader.getInvoice('../other')).rejects.toMatchObject({ kind: 'invalid-response' });
    expect(requests).toHaveLength(0);
  });

  it('rejects a repeated page cursor and an empty continuation', async () => {
    await expect(mockZoho(() => pageResponse(1, ['1001'], true)).reader.listInvoicePage(2))
      .rejects.toMatchObject({ kind: 'invalid-response' });
    await expect(mockZoho(() => pageResponse(1, [], true)).reader.listInvoicePage(1))
      .rejects.toMatchObject({ kind: 'invalid-response' });
  });

  it('refreshes once on token expiry and retries only the same GET', async () => {
    const { reader, refreshes, requests } = mockZoho(request =>
      request.headers.get('Authorization') === 'Zoho-oauthtoken fixture-refreshed'
        ? invoiceResponse() : new Response(null, { status: 401 }),
    );
    expect((await reader.getInvoice(testInvoiceId)).invoiceId).toBe(testInvoiceId);
    expect(refreshes).toEqual([false, true]);
    expect(requests.map(request => [request.method, request.url])).toEqual([
      ['GET', requests[0].url], ['GET', requests[0].url],
    ]);
  });

  it('stops when the refreshed token is rejected', async () => {
    const { reader, refreshes, requests } = mockZoho(() => new Response(null, { status: 401 }));
    await expect(reader.getInvoice(testInvoiceId)).rejects.toMatchObject({ kind: 'authorization' });
    expect(refreshes).toEqual([false, true]);
    expect(requests).toHaveLength(2);
  });

  it('honors Retry-After and recovers from a transient server error', async () => {
    let attempt = 0;
    const { reader, delays } = mockZoho(() => {
      attempt++;
      if (attempt === 1) return new Response(null, { status: 429, headers: { 'Retry-After': '2' } });
      if (attempt === 2) return new Response(null, { status: 503 });
      return invoiceResponse();
    });
    expect((await reader.getInvoice(testInvoiceId)).subtotal).toBe('100.23');
    expect(delays).toEqual([2000, 500]);
  });

  it('defers a long throttle window and bounds repeated failures', async () => {
    const throttled = mockZoho(() => new Response(null, { status: 429, headers: { 'Retry-After': '60' } }));
    await expect(throttled.reader.getInvoice(testInvoiceId)).rejects.toMatchObject({ kind: 'rate-limited' });
    expect(throttled.requests).toHaveLength(1);
    expect(throttled.delays).toEqual([]);

    const failing = mockZoho(() => { throw new Error('sensitive transport details'); });
    await expect(failing.reader.getInvoice(testInvoiceId)).rejects.toMatchObject({
      kind: 'unavailable', message: 'Zoho invoice read failed: unavailable',
    });
    expect(failing.requests).toHaveLength(3);
  });

  it('rejects a nonzero provider result without surfacing its message', async () => {
    const { reader, requests } = mockZoho(() => Response.json({ code: 5, message: 'private provider text' }));
    await expect(reader.getInvoice(testInvoiceId)).rejects.toMatchObject({
      kind: 'rejected', message: 'Zoho invoice read failed: rejected',
    });
    expect(requests).toHaveLength(1);
  });
});
