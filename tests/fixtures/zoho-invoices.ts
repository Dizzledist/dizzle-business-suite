import { createZohoInvoiceReader } from '../../server/sales-crm/zoho/reader';

export const testOrganizationId = '901';
export const testInvoiceId = '1001';
export const testSalespersonId = '301';

export function invoicePayload(overrides: Record<string, unknown> = {}) {
  return {
    invoice_id: testInvoiceId,
    invoice_number: 'TEST-001',
    customer_id: '801',
    customer_name: 'Fixture account',
    salesperson_id: testSalespersonId,
    salesperson_name: 'Fixture rep',
    currency_code: 'USD',
    sub_total: '100.23',
    total: '110.25',
    balance: '110.25',
    status: 'sent',
    is_emailed: true,
    date: '2026-10-28',
    created_time: '2026-10-28T10:00:00-07:00',
    last_modified_time: '2026-11-02T10:00:00-08:00',
    payment_made: '0',
    credits_applied: '0',
    write_off_amount: '0',
    ...overrides,
  };
}

export function invoiceResponse(overrides: Record<string, unknown> = {}) {
  return Response.json({ code: 0, invoice: invoicePayload(overrides) });
}

export function pageResponse(page: number, invoiceIds: string[], hasMore: boolean) {
  return Response.json({
    code: 0,
    invoices: invoiceIds.map(invoiceId => ({ invoice_id: invoiceId })),
    page_context: { page, has_more_page: hasMore },
  });
}

export function mockZoho(handler: (request: Request) => Response | Promise<Response>) {
  const requests: Request[] = [];
  const delays: number[] = [];
  const refreshes: boolean[] = [];
  const reader = createZohoInvoiceReader({
    region: 'com',
    organizationId: testOrganizationId,
    transport: async (input, init) => {
      const request = new Request(input, init);
      requests.push(request);
      return handler(request);
    },
    accessToken: async refresh => {
      refreshes.push(refresh);
      return refresh ? 'fixture-refreshed' : 'fixture-token';
    },
    wait: async delay => { delays.push(delay); },
  });

  return { reader, requests, delays, refreshes };
}
