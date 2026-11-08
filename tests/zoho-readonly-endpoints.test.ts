import { describe, expect, it } from 'vitest';
import { mockZoho, testInvoiceId } from './fixtures/zoho-invoices';

describe('allowlisted Zoho Inventory resources', () => {
  it('supports customer and item list/detail and invoice payment reads only', async () => {
    const contact = { contact_id: '801', contact_type: 'customer', contact_name: 'Fixture account', notes: 'discard' };
    const item = { item_id: '501', name: 'Fixture item', sku: 'TEST', rate: 12 };
    const payment = { payment_id: '901', invoice_id: testInvoiceId, amount: 2.5, description: 'discard' };
    const page_context = { page: 2, has_more_page: false };
    const { reader, requests } = mockZoho(request => {
      const { pathname } = new URL(request.url);
      const bodies: Record<string, object> = {
        '/inventory/v1/contacts': { contacts: [contact], page_context },
        '/inventory/v1/contacts/801': { contact },
        '/inventory/v1/items': { items: [item], page_context },
        '/inventory/v1/items/501': { item },
        '/inventory/v1/invoices/1001/payments': { payments: [payment] },
      };
      return Response.json({ code: 0, ...bodies[pathname] });
    });
    expect((await reader.listContacts(2, 1)).contacts.map(row => row.contact_id)).toEqual(['801']);
    expect(await reader.getContact('801')).toMatchObject({ contact_name: 'Fixture account' });
    expect((await reader.listItems(2, 1)).items.map(row => row.item_id)).toEqual(['501']);
    expect(await reader.getItem('501')).not.toHaveProperty('rate');
    expect(await reader.getInvoicePayments('1001')).toEqual([{
      payment_id: '901', invoice_id: '1001', invoice_payment_id: null, amount: '2.5', date: null,
    }]);
    expect(requests.every(request => request.method === 'GET' &&
      new URL(request.url).searchParams.get('organization_id') === '901')).toBe(true);
    expect(new URL(requests[0].url).searchParams.get('contact_type')).toBe('customer');
  });

  it('rejects route injection, writes and unbounded paging before transport', async () => {
    const { reader, requests } = mockZoho(() => Response.json({ code: 0 }));
    await expect(reader.getInvoice('1001/email')).rejects.toMatchObject({ kind: 'invalid-response' });
    await expect(reader.getContact('https://example.invalid')).rejects.toMatchObject({ kind: 'invalid-response' });
    await expect(reader.getItem('../delete')).rejects.toMatchObject({ kind: 'invalid-response' });
    await expect(reader.listItems(1, 201)).rejects.toMatchObject({ kind: 'rejected' });
    expect(Object.keys(reader)).not.toContain('request');
    expect(Object.keys(reader)).not.toContain('write');
    expect(requests).toHaveLength(0);
  });

  it('rejects an overlarge sample response or a payment for another invoice', async () => {
    const { reader } = mockZoho(() => Response.json({
      code: 0, items: [{ item_id: '501' }, { item_id: '502' }], page_context: { page: 1, has_more_page: false },
      payments: [{ payment_id: '901', invoice_id: '1002' }],
    }));
    await expect(reader.listItems(1, 1)).rejects.toMatchObject({ kind: 'invalid-response' });
    await expect(reader.getInvoicePayments('1001')).rejects.toMatchObject({ kind: 'invalid-response' });
  });
});
