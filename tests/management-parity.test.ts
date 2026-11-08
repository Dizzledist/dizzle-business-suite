import { describe, expect, it } from 'vitest';
import { managementInvoiceLineName } from '../shared/management-invoice-line';
import { defaultRange, reportingApi, type ReportingInvoiceDetail, type ReportingPage } from '../shared/reporting';
import { saveSalesperson, transaction, upsertInvoice } from '../server/sales-crm/reporting/database';
import { createSyntheticReporting } from '../server/sales-crm/reporting/demo';
import {
  calculateManagementInvoiceCost, productMatchKey, summarizeManagementProfit,
} from '../server/sales-crm/reporting/management-profit';
import { demoOrganization, type RecognitionEvidence } from '../server/sales-crm/reporting/model';
import { getScopedReporting } from '../server/sales-crm/reporting/routes';
import { invoiceDetail, mirrorInvoice } from '../server/sales-crm/zoho/invoice';
import fixture from './fixtures/management-parity-input.json';
import management from './fixtures/management-parity-reference.json';

const catalog = {
  currency: 'USD',
  skuByItemId: new Map([
    ...fixture.catalog.items.map(row => [row.item_id, row.sku] as const),
    ...Object.entries(fixture.catalog.itemLookups),
  ]),
  byLine: new Map(fixture.catalog.lines.map(row => [row.reference, row.cost])),
  byItem: new Map(fixture.catalog.items.map(row => [row.item_id, row.cost])),
  bySku: new Map(fixture.catalog.products.map(row => [row.sku, row.cost])),
  byName: new Map(fixture.catalog.names.map(row => [row.match_key, row.cost])),
};

function invoice(input: (typeof fixture.invoices)[number]) {
  return mirrorInvoice(demoOrganization, invoiceDetail.parse({ invoice: input.zoho }).invoice);
}

function cost(source: ReturnType<typeof invoice>) {
  return calculateManagementInvoiceCost({
    number: source.invoiceNumber, currency: source.currency, lines: source.lineItems ?? [],
  }, catalog);
}

describe('Dizzle Management reference parity', () => {
  it('matches structured identities, display names and quantities while retaining exact price and discount fields', () => {
    const source = invoice(fixture.invoices[1]);
    const lines = source.lineItems!;
    const reference = management.rows.find(row => row.id === source.invoiceId)!;
    expect(lines.map(line => ({
      itemId: line.productId ?? undefined,
      sku: line.sku ?? (line.productId ? catalog.skuByItemId.get(line.productId) : undefined) ?? '',
      name: managementInvoiceLineName(line.name, line.description),
      description: line.description ?? '',
      unit: line.unit ?? '',
      quantity: Number(line.quantity),
      reference: source.invoiceNumber + ':' + line.lineId,
    }))).toEqual(reference.lines);
    expect(management.providerItemReads).toEqual(['items/990']);
    expect(lines[2]).toMatchObject({ productId: '990', sku: null, name: null });
    expect(lines[0]).toMatchObject({ quantity: '2', unitPrice: '25', discount: '20%', discountAmount: '10', amount: '40' });
    expect(source.subtotal).toBe('115');
    expect(source.total).toBe('126');
  });

  it('matches the reviewed cost precedence, missing-cost handling and invoice rounding', () => {
    const source = invoice(fixture.invoices[1]);
    const lines = source.lineItems!;
    const [first, , , exact] = lines;
    const compare = (items: typeof lines, currency = 'USD') =>
      calculateManagementInvoiceCost({ number: source.invoiceNumber, currency, lines: items }, catalog);
    expect(productMatchKey(' Named   PRODUCT ', ' Batch  A ', 'Case')).toBe(management.productKey);
    expect(compare([first])).toBe(management.costCases.override);
    expect(compare([{ ...first, lineId: null }])).toBe(management.costCases.item);
    expect(compare([{ ...first, lineId: null, productId: null }])).toBe(management.costCases.sku);
    expect(compare([exact])).toBe(management.costCases.exactName);
    expect(compare([{ ...exact, sku: 'UNKNOWN' }])).toBe(management.costCases.unknownSku);
    expect(compare([])).toBe(management.costCases.empty);
    expect(compare([{ ...first, quantity: '-1' }])).toBe(management.costCases.negativeQuantity);
    expect(compare([{ ...first, quantity: '0.111' }, { ...first, quantity: '0.111' }])).toBe(management.costCases.roundOnce);
    expect(compare(lines, 'CAD')).toBeNull();
    expect(cost(source)).toBe(management.rows.find(row => row.id === source.invoiceId)!.cost);
  });

  it.each(['all', 'open', 'closed'] as const)('matches Management profit for the same %s invoice selection', filter => {
    const { ids, ...expected } = management.filters[filter];
    const rows = fixture.invoices.filter(row => ids.includes(row.zoho.invoice_id)).reverse().map(row => {
      const source = invoice(row);
      return { currency: source.currency, sales: Number(source.total), cost: cost(source) };
    });
    expect(summarizeManagementProfit([...rows, { currency: 'CAD', sales: 900, cost: 1 }], 'USD')).toEqual(expected);
  });

  it('keeps October first-email, original subtotal, and settlement policy separate from the Management reference', async () => {
    const now = () => Date.parse(fixture.now);
    const reporting = await createSyntheticReporting({ path: ':memory:', now });
    try {
      transaction(reporting.db, () => {
        saveSalesperson(reporting.db, demoOrganization, '501', 'management-parity', 'Fixture Representative');
        for (const row of fixture.invoices) {
          const evidence: RecognitionEvidence = row.firstEmailAt && row.originalSubtotal ? {
            status: 'verified', firstEmailAt: row.firstEmailAt, id: 'fixture-email-' + row.zoho.invoice_id,
            source: 'Synthetic send receipt', subtotal: row.originalSubtotal, salespersonId: '501', currency: 'USD',
          } : { status: 'pending' };
          upsertInvoice(reporting.db, invoice(row), evidence, now());
        }
      });
      const scope = { organizationId: demoOrganization, credit: 'selected', userIds: ['management-parity'] } as const;
      const report = (filter: 'all' | 'open' | 'closed', detail = '') =>
        getScopedReporting(new URL('http://localhost' + reportingApi + detail + '?preset=custom&start=' +
          fixture.start + '&end=' + fixture.end + '&payment=' + filter), reporting, scope, true);
      const expected = {
        all: { ids: ['5001', '5002', '5003'], subtotal: '300.00' },
        open: { ids: ['5001', '5003'], subtotal: '200.00' },
        closed: { ids: ['5002'], subtotal: '100.00' },
      };
      expect(defaultRange).toEqual({ preset: 'mtd' });
      expect(reporting.coverageStart).toBe(fixture.start);
      expect(management.dateEligibility).toEqual([false, true, true, false]);
      expect(management.statusLabels).toEqual(['unknown', 'paid', 'open', 'open', 'open', 'open']);
      for (const filter of ['all', 'open', 'closed'] as const) {
        const data = report(filter) as ReportingPage;
        expect(data.count).toBe(expected[filter].ids.length);
        expect(data.invoices.map(row => row.id).sort()).toEqual(expected[filter].ids);
        expect(data.invoiceTotals).toEqual([{ currency: 'USD', subtotal: expected[filter].subtotal, count: data.count }]);
      }
      expect(management.filters.all).toMatchObject({ ids: ['5002', '5003', '5004', '5005'], count: 4, sales: 414 });
      expect(management.filters.closed).toMatchObject({ ids: ['5002'], count: 1, sales: 126 });
      expect(report('closed', '/invoices/5002') as ReportingInvoiceDetail).toMatchObject({
        subtotal: '100.00', currentSubtotal: '115.00', balance: '0.00', payment: 'paid',
        lineItems: expect.arrayContaining([expect.objectContaining({ discount: '20%', discountAmount: '10' })]),
      });
    } finally {
      reporting.db.close();
    }
  });
});
