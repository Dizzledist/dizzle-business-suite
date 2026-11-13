import type { RetailStore, ReportingPeriod, ChannelSubtotal } from '../../shared/retail-reporting';
import type { RetailOrder } from './metrics';
const updatedAt = '2026-11-13T18:00:00.000Z';
export const retailStores: RetailStore[] = [
  { id: 'fixture-cheddr-us', organizationId: 'pilot-org', name: 'Cheddr retail · US demo', currency: 'USD', source: 'shopify-fixture', updatedAt, coverageFrom: '2026-09-30', coverageThrough: '2026-11-13', available: true },
  { id: 'fixture-cheddr-events', organizationId: 'pilot-org', name: 'Cheddr events · demo', currency: 'USD', source: 'shopify-fixture', updatedAt, coverageFrom: '2026-09-30', coverageThrough: '2026-11-13', available: true },
  { id: 'fixture-cheddr-ca', organizationId: 'pilot-org', name: 'Cheddr Canada · demo', currency: 'CAD', source: 'shopify-fixture', updatedAt, coverageFrom: '2026-09-30', coverageThrough: '2026-11-13', available: true },
  { id: 'fixture-foreign', organizationId: 'other-org', name: 'Other organization · demo', currency: 'USD', source: 'shopify-fixture', updatedAt, coverageFrom: '2026-09-30', coverageThrough: '2026-11-13', available: true },
];
const catalog = [{ id: 'sleep-bites', title: 'Cheddr Sleep Bites · 20 count', price: 3499 }, { id: 'blue-razz', title: 'Cheddr Blue Razz · 20 count', price: 2999 }, { id: 'citrus-gummies', title: 'Cheddr Citrus Gummies · 10 count', price: 1999 }, { id: 'variety-pack', title: 'Cheddr Variety Pack', price: 6499 }];
export function retailFixtureOrders(): RetailOrder[] {
  const orders: RetailOrder[] = [];
  for (const [storeIndex, store] of retailStores.entries()) for (let day = 0; day < 45; day++) {
    const date = new Date(Date.UTC(2026, 8, 30 + day)).toISOString().slice(0, 10);
    for (let index = 0; index < 5 + (day * 7 + storeIndex) % 9; index++) {
      const product = catalog[(day + index) % catalog.length], quantity = 1 + index % 3, grossMinor = product.price * quantity;
      const placedAt = date + 'T' + String(15 + index % 8).padStart(2, '0') + ':30:00.000Z';
      const discountMinor = index % 4 === 0 ? Math.round(grossMinor * .15) : 0;
      const order: RetailOrder = { id: `fixture-${storeIndex}-${day}-${index}`, storeId: store.id, organizationId: store.organizationId, currency: store.currency, placedAt, status: index === 1 && day % 6 === 0 ? 'canceled' : index === 2 && day % 7 === 0 ? 'pending' : 'paid', shippingMinor: 599, taxMinor: Math.round((grossMinor - discountMinor) * .08), lines: [{ productId: product.id, title: product.title, quantity, grossMinor, discountMinor }], adjustments: [] };
      if (order.status === 'canceled') order.adjustments.push({ at: date + 'T23:30:00.000Z', kind: 'cancellation', shippingMinor: 599, taxMinor: order.taxMinor, lines: [{ productId: product.id, merchandiseMinor: grossMinor - discountMinor, quantity }] });
      else if (index === 0 && day % 4 === 0) order.adjustments.push({ at: new Date(Date.parse(placedAt) + 3 * 86_400_000).toISOString(), kind: 'refund', shippingMinor: 0, taxMinor: Math.round(order.taxMinor / quantity), lines: [{ productId: product.id, merchandiseMinor: Math.round((grossMinor - discountMinor) / quantity), quantity: 1 }] });
      if (index === 3 && day % 13 === 0) order.test = true;
      if (index === 4 && day % 17 === 0) order.deleted = true;
      order.adjustments = order.adjustments.filter(a => a.at <= updatedAt);
      if (order.placedAt <= updatedAt) orders.push(order);
    }
  }
  return orders;
}
export interface ReportingSource { readonly mode: 'fixture'; stores(): RetailStore[]; orders(store: RetailStore): readonly RetailOrder[]; wholesale(organizationId: string, period: ReportingPeriod): ChannelSubtotal; }
export class FixtureReportingSource implements ReportingSource {
  readonly mode = 'fixture'; private data = retailFixtureOrders();
  stores() { return structuredClone(retailStores); }
  orders(_store: RetailStore) { return this.data; }
  wholesale(organizationId: string, period: ReportingPeriod): ChannelSubtotal {
    if (period.from < '2026-09-30' || period.to > '2026-11-13') throw new Error('Fixture period is outside source coverage.');
    // Separate synthetic Zoho merchandise events; no Shopify order matching or deduplication.
    let total = 0; for (let day = 0; day < 45; day++) { const at = new Date(Date.UTC(2026, 8, 30 + day, 19)).toISOString(); if (at >= period.startUtc && at < period.endExclusiveUtc && at <= updatedAt) total += 125_000 + day % 7 * 17_500 - (day % 5 === 0 ? 12_500 : 0); }
    return { channel: 'zoho', label: 'Zoho wholesale · demo', currency: 'USD', netSalesMinor: organizationId === 'pilot-org' ? total : 0, available: true, updatedAt };
  }
}
