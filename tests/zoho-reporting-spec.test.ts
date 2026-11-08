import { describe, expect, it } from 'vitest';

// Executable examples only. Production code has no verified-send source or
// reporting engine and never imports this synthetic acceptance model.
const reportingZone = 'America/Los_Angeles';
const repMapping = new Map([['301', 'rep-a'], ['302', 'rep-b']]);
type Settlement = 'unpaid' | 'partially-paid' | 'fully-paid' | 'review';
type Filter = 'open' | 'closed' | 'all';

interface SendEvidence {
  id: string;
  successful: boolean;
  at: string;
  subtotal: string;
  sourceRep: string;
}

interface InvoiceFixture {
  organization: string;
  id: string;
  createdAt: string;
  status: 'draft' | 'sent' | 'void';
  emailed: boolean;
  currentSubtotal: string;
  total: string;
  currency: string;
  accountOwner: string;
  currentSourceRep: string;
  sends: SendEvidence[];
  settlement: Settlement;
}

function invoiceFixture(overrides: Partial<InvoiceFixture> = {}): InvoiceFixture {
  return {
    organization: '901',
    id: '1001',
    createdAt: '2026-10-28T17:00:00Z',
    status: 'sent',
    emailed: true,
    currentSubtotal: '100.23',
    total: '110.25',
    currency: 'USD',
    accountOwner: 'rep-a',
    currentSourceRep: '301',
    sends: [{ id: 'first', successful: true, at: '2026-11-01T08:30:00Z', subtotal: '100.23', sourceRep: '301' }],
    settlement: 'unpaid',
    ...overrides,
  };
}

const monthFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: reportingZone, year: 'numeric', month: '2-digit',
});

function reportingMonth(timestamp: string) {
  const parts = monthFormatter.formatToParts(new Date(timestamp));
  return parts.find(part => part.type === 'year')!.value + '-' + parts.find(part => part.type === 'month')!.value;
}

interface FixtureSale {
  organization: string;
  creditedRep: string;
  firstSentAt: string;
  subtotal: string;
  currency: string;
  settlement: Settlement;
}

function synthesizeSales(events: InvoiceFixture[]) {
  const sales = new Map<string, FixtureSale>();
  const exceptions = new Set<string>();
  for (const invoice of events) {
    const key = invoice.organization + ':' + invoice.id;
    const existing = sales.get(key);
    if (invoice.status === 'draft' || !invoice.emailed) continue;
    // Keep original evidence and hold a void out of Open and Closed.
    // Historical All presentation and net adjustments await finance approval.
    if (invoice.status === 'void') {
      if (existing) sales.set(key, { ...existing, settlement: 'review' });
      exceptions.add(key);
      continue;
    }
    if (existing) {
      sales.set(key, { ...existing, settlement: invoice.settlement });
      continue;
    }
    const first = invoice.sends.filter(send => send.successful)
      .sort((a, b) => Date.parse(a.at) - Date.parse(b.at))[0];
    const creditedRep = first && repMapping.get(first.sourceRep);
    if (!first || !creditedRep) {
      exceptions.add(key);
      continue;
    }
    sales.set(key, {
      organization: invoice.organization,
      creditedRep, firstSentAt: first.at, subtotal: first.subtotal, currency: invoice.currency,
      settlement: invoice.settlement,
    });
  }

  function report(reps: readonly string[], months: readonly string[], filter: Filter, organization = '901') {
    const rows = [...sales.values()].filter(sale => sale.organization === organization && reps.includes(sale.creditedRep) &&
      months.includes(reportingMonth(sale.firstSentAt)) &&
      (filter === 'all' || (filter === 'closed' && sale.settlement === 'fully-paid') ||
        (filter === 'open' && ['unpaid', 'partially-paid'].includes(sale.settlement))));
    const subtotals: Record<string, bigint> = {};
    for (const row of rows) {
      // The test inputs have exactly two decimal places. No cross-currency sum.
      subtotals[row.currency] = (subtotals[row.currency] ?? 0n) + BigInt(row.subtotal.replace('.', ''));
    }
    return { count: rows.length, subtotals, rows };
  }

  return { sales, exceptions, report };
}

describe('synthetic examples for the future verified sales report', () => {
  it('excludes drafts, unemailed records, and records without successful send evidence', () => {
    const sales = synthesizeSales([
      invoiceFixture({ id: '1001', status: 'draft' }),
      invoiceFixture({ id: '1002', emailed: false }),
      invoiceFixture({ id: '1003', sends: [] }),
      invoiceFixture({ id: '1004', sends: [{ ...invoiceFixture().sends[0], successful: false }] }),
      invoiceFixture({ id: '1005' }),
    ]);
    expect([...sales.sales.keys()]).toEqual(['901:1005']);
    expect([...sales.exceptions]).toEqual(['901:1003', '901:1004']);
  });

  it('uses first successful email and original subtotal in the explicit fixture timezone', () => {
    const first = { ...invoiceFixture().sends[0], at: '2026-11-01T06:59:59Z' };
    const justAfter = { ...first, id: 'next', at: '2026-11-01T07:00:00Z', subtotal: '90.00' };
    const october = invoiceFixture({ createdAt: '2026-09-30T10:00:00Z', sends: [justAfter, first] });
    const november = invoiceFixture({ id: '1002', sends: [justAfter] });
    const { report } = synthesizeSales([october, november]);
    expect(report(['rep-a'], ['2026-09'], 'all').count).toBe(0);
    expect(report(['rep-a'], ['2026-10'], 'all').subtotals).toEqual({ USD: 10023n });
    expect(report(['rep-a'], ['2026-11'], 'all').subtotals).toEqual({ USD: 9000n });
    expect(report(['rep-a'], ['2026-10', '2026-11'], 'all')).toMatchObject({
      count: 2, subtotals: { USD: 19023n },
    });
  });

  it('keeps one original sale through resends, invoice edits and account reassignment', () => {
    const original = invoiceFixture();
    const resend = { ...original.sends[0], id: 'resent', at: '2026-12-01T10:00:00Z', subtotal: '200.23', sourceRep: '302' };
    const edited = invoiceFixture({
      accountOwner: 'rep-b', currentSourceRep: '302', currentSubtotal: '200.23', sends: [resend],
      settlement: 'fully-paid',
    });
    const { report } = synthesizeSales([original, edited, edited]);
    expect(report(['rep-a'], ['2026-11'], 'closed')).toMatchObject({ count: 1, subtotals: { USD: 10023n } });
    expect(report(['rep-a'], ['2026-12'], 'all').count).toBe(0);
    expect(report(['rep-b'], ['2026-11', '2026-12'], 'all').count).toBe(0);
  });

  it('flags an unmapped original salesperson and scopes reports to credited reps', () => {
    const unmapped = invoiceFixture({
      id: '1003', sends: [{ ...invoiceFixture().sends[0], sourceRep: '999' }], accountOwner: 'rep-b',
    });
    const repB = invoiceFixture({ id: '1002', sends: [{ ...invoiceFixture().sends[0], sourceRep: '302' }] });
    const { report, exceptions } = synthesizeSales([invoiceFixture(), repB, unmapped]);
    expect([...exceptions]).toEqual(['901:1003']);
    expect(report(['rep-a'], ['2026-11'], 'all').rows.map(row => row.creditedRep)).toEqual(['rep-a']);
    expect(report(['rep-a', 'rep-b'], ['2026-11'], 'all').count).toBe(2);
  });

  it('uses one filter for count and subtotal, with currency-separated totals', () => {
    const { report } = synthesizeSales([
      invoiceFixture(),
      invoiceFixture({ id: '1002', settlement: 'partially-paid' }),
      invoiceFixture({ id: '1003', settlement: 'fully-paid' }),
      invoiceFixture({ id: '1004', currency: 'CAD', settlement: 'fully-paid' }),
      invoiceFixture({ id: '1001', organization: '902', settlement: 'fully-paid' }),
    ]);
    expect(report(['rep-a'], ['2026-11'], 'open')).toMatchObject({ count: 2, subtotals: { USD: 20046n } });
    expect(report(['rep-a'], ['2026-11'], 'closed')).toMatchObject({ count: 2, subtotals: { USD: 10023n, CAD: 10023n } });
    expect(report(['rep-a'], ['2026-11'], 'all')).toMatchObject({ count: 4, subtotals: { USD: 30069n, CAD: 10023n } });
    expect(report(['rep-a'], ['2026-11'], 'all', '902')).toMatchObject({ count: 1, subtotals: { USD: 10023n } });
  });

  it('preserves evidence and holds uncertain void, credit or refund settlement for review', () => {
    const { sales, exceptions, report } = synthesizeSales([
      invoiceFixture({ settlement: 'fully-paid' }),
      invoiceFixture({ status: 'void' }),
      invoiceFixture({ id: '1002', settlement: 'review' }),
    ]);
    expect(sales.get('901:1001')).toMatchObject({ subtotal: '100.23', settlement: 'review' });
    expect([...exceptions]).toEqual(['901:1001']);
    expect(report(['rep-a'], ['2026-11'], 'closed').count).toBe(0);
    expect(report(['rep-a'], ['2026-11'], 'open').count).toBe(0);
  });
});
