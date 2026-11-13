import type { RetailMetrics, RetailReport, RetailStore, ReportingPeriod } from '../../shared/retail-reporting';
import { nextDay } from './period';
export interface SaleLine { productId: string; title: string; quantity: number; grossMinor: number; discountMinor: number; }
export interface RetailOrder { id: string; storeId: string; organizationId: string; placedAt: string; currency: string; status: 'paid' | 'pending' | 'canceled'; test?: boolean; deleted?: boolean; shippingMinor: number; taxMinor: number; lines: SaleLine[]; adjustments: { at: string; kind: 'refund' | 'cancellation'; shippingMinor: number; taxMinor: number; lines: { productId: string; merchandiseMinor: number; quantity: number }[] }[]; }
export function retailMetrics(store: RetailStore, orders: readonly RetailOrder[], period: ReportingPeriod): RetailReport {
  const metrics: RetailMetrics = { grossSalesMinor: 0, discountsMinor: 0, refundsMinor: 0, otherReversalsMinor: 0, netSalesMinor: 0, orderCount: 0, averageOrderValueMinor: null };
  const days = new Map<string, { date: string; netSalesMinor: number; orderCount: number }>();
  for (let date = period.from; date <= period.to; date = nextDay(date)) days.set(date, { date, netSalesMinor: 0, orderCount: 0 });
  const products = new Map<string, { id: string; title: string; netSalesMinor: number; netQuantity: number }>();
  const inPeriod = (date: string) => date >= period.startUtc && date < period.endExclusiveUtc;
  const dayKey = (at: string) => new Intl.DateTimeFormat('en-CA', { timeZone: period.timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(at));
  function product(id: string, title: string, amount: number, quantity: number) { const row = products.get(id) ?? { id, title, netSalesMinor: 0, netQuantity: 0 }; row.netSalesMinor += amount; row.netQuantity += quantity; products.set(id, row); }
  for (const order of orders) {
    if (order.storeId !== store.id || order.organizationId !== store.organizationId || order.test || order.deleted) continue;
    if (order.currency !== store.currency) throw new Error('Adapter currency differs from store currency.');
    if (inPeriod(order.placedAt)) {
      metrics.orderCount++; const daily = days.get(dayKey(order.placedAt))!; daily.orderCount++;
      for (const line of order.lines) { metrics.grossSalesMinor += line.grossMinor; metrics.discountsMinor += line.discountMinor; daily.netSalesMinor += line.grossMinor - line.discountMinor; product(line.productId, line.title, line.grossMinor - line.discountMinor, line.quantity); }
    }
    for (const reversal of order.adjustments) if (inPeriod(reversal.at)) {
      for (const line of reversal.lines) {
        if (reversal.kind === 'refund') metrics.refundsMinor += line.merchandiseMinor; else metrics.otherReversalsMinor += line.merchandiseMinor;
        days.get(dayKey(reversal.at))!.netSalesMinor -= line.merchandiseMinor;
        product(line.productId, order.lines.find(p => p.productId === line.productId)?.title ?? 'Archived product', -line.merchandiseMinor, -line.quantity);
      }
    }
  }
  metrics.netSalesMinor = metrics.grossSalesMinor - metrics.discountsMinor - metrics.refundsMinor - metrics.otherReversalsMinor;
  metrics.averageOrderValueMinor = metrics.orderCount ? Math.round((metrics.grossSalesMinor - metrics.discountsMinor) / metrics.orderCount) : null;
  for (const amount of [metrics.netSalesMinor, metrics.grossSalesMinor, metrics.discountsMinor, metrics.refundsMinor, metrics.otherReversalsMinor]) if (!Number.isSafeInteger(amount)) throw new Error('Reporting amount outside supported integer range.');
  return { demo: true, definition: 'retail-merchandise-v1', store, period, metrics, trend: [...days.values()], topProducts: [...products.values()].sort((a, b) => b.netSalesMinor - a.netSalesMinor || a.id.localeCompare(b.id)).slice(0, 10) };
}
