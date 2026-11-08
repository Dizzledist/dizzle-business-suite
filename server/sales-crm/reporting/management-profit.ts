import { managementInvoiceLineName } from '../../../shared/management-invoice-line';
import type { InvoiceLine } from '../../../shared/reporting';

export interface ManagementCostCatalog {
  currency: string;
  skuByItemId?: ReadonlyMap<string, string>;
  byLine?: ReadonlyMap<string, number>;
  byItem?: ReadonlyMap<string, number>;
  bySku?: ReadonlyMap<string, number>;
  byName?: ReadonlyMap<string, number>;
}

type CostLine = Pick<InvoiceLine, 'lineId' | 'productId' | 'sku' | 'name' | 'description' | 'unit' | 'quantity'>;

// Adapted from Dizzle Management lib/product-match.ts at f8da43c.
export function productMatchKey(name: string, description = '', unit = '') {
  const clean = (value: string) => value.trim().toLowerCase().replace(/\s+/g, ' ');
  return JSON.stringify([clean(name), clean(description), clean(unit)]);
}

// Pure calculation from lib/costs.ts and the SKU fallback in lib/sync.ts.
// The caller supplies a scoped catalog for a single currency. Reporting does not call this.
export function calculateManagementInvoiceCost(
  invoice: { number: string; currency: string; lines: readonly CostLine[] },
  catalog: ManagementCostCatalog,
) {
  if (invoice.currency !== catalog.currency || !invoice.lines.length) return null;

  let total = 0;
  for (const line of invoice.lines) {
    const reference = line.lineId ? invoice.number + ':' + line.lineId : null;
    const sku = line.sku || (line.productId ? catalog.skuByItemId?.get(line.productId) : undefined);
    const quantity = Number(line.quantity);
    const nameKey = !line.productId && !sku && (line.name || line.description)
      ? productMatchKey(managementInvoiceLineName(line.name, line.description), line.description ?? '', line.unit ?? '')
      : null;
    const cost = (reference ? catalog.byLine?.get(reference) : undefined) ??
      (line.productId ? catalog.byItem?.get(line.productId) : undefined) ??
      (sku ? catalog.bySku?.get(sku) : undefined) ??
      (nameKey ? catalog.byName?.get(nameKey) : undefined);
    if (cost === undefined || !Number.isFinite(cost) || cost < 0 || !Number.isFinite(quantity) || quantity < 0) {
      return null;
    }
    total += cost * quantity;
  }
  const cents = total * 100;
  return Number.isFinite(cents) ? Math.round(cents) / 100 : null;
}

// Adapted from the Management Dashboard in app/ui.tsx. The caller chooses the
// revenue basis before calling this calculation.
export function summarizeManagementProfit(
  invoices: readonly { currency: string; sales: number; cost: number | null }[], currency: string,
) {
  let count = 0;
  let sales = 0;
  let knownSales = 0;
  let cost = 0;
  let profit = 0;
  let matchedCount = 0;
  for (const invoice of invoices) {
    if (invoice.currency !== currency) continue;
    count++;
    sales += invoice.sales;
    if (invoice.cost === null) continue;
    knownSales += invoice.sales;
    cost += invoice.cost;
    profit = profit + invoice.sales - invoice.cost;
    matchedCount++;
  }
  return { count, matchedCount, sales, knownSales, cost, profit, margin: knownSales ? profit / knownSales * 100 : 0 };
}
