import { describe, expect, it } from 'vitest';
import { retailMetrics, type RetailOrder } from '../server/reporting/metrics';
import { reportingPeriod } from '../server/reporting/period';
import { retailStores } from '../server/reporting/fixtures';
const store = retailStores[0];
function order(id: string, placedAt: string, grossMinor: number, discountMinor = 0): RetailOrder { return { id, placedAt, organizationId: store.organizationId, storeId: store.id, currency: 'USD', status: 'paid', shippingMinor: 500, taxMinor: 800, lines: [{ productId: id, title: id, quantity: 2, grossMinor, discountMinor }], adjustments: [] }; }
function data() {
  const a = order('a', '2026-11-01T07:00:00.000Z', 10_000, 1_000); a.adjustments.push({ at: '2026-11-01T12:00:00.000Z', kind: 'refund', shippingMinor: 100, taxMinor: 450, lines: [{ productId: 'a', quantity: 1, merchandiseMinor: 4500 }] });
  const b = order('b', '2026-11-01T08:00:00.000Z', 4000, 500); b.status = 'canceled'; b.adjustments.push({ at: '2026-11-01T11:00:00.000Z', kind: 'cancellation', shippingMinor: 500, taxMinor: 800, lines: [{ productId: 'b', quantity: 2, merchandiseMinor: 3500 }] });
  const c = order('c', '2026-11-02T07:59:59.999Z', 2000); c.status = 'pending';
  const old = order('old', '2026-10-01T20:00:00.000Z', 5000); old.adjustments.push({ at: '2026-11-01T14:00:00.000Z', kind: 'refund', shippingMinor: 0, taxMinor: 0, lines: [{ productId: 'old', quantity: 1, merchandiseMinor: 2500 }] });
  return [a, b, c, old, { ...order('test', a.placedAt, 999_999), test: true }, { ...order('deleted', a.placedAt, 999_999), deleted: true }, order('end-exclusive', '2026-11-02T08:00:00.000Z', 999_999)];
}
describe('retail merchandise metric contract', () => {
  const period = reportingPeriod('2026-11-01', '2026-11-01');
  it('uses a 25-hour Pacific DST day with inclusive start and exclusive next midnight', () => { expect(period.startUtc).toBe('2026-11-01T07:00:00.000Z'); expect(period.endExclusiveUtc).toBe('2026-11-02T08:00:00.000Z'); expect((Date.parse(period.endExclusiveUtc) - Date.parse(period.startUtc)) / 3600000).toBe(25); });
  it('uses discounts, later refunds and cancellations exactly once; AOV excludes later adjustments', () => {
    const report = retailMetrics(store, data(), period);
    expect(report.metrics).toEqual({ grossSalesMinor: 16000, discountsMinor: 1500, refundsMinor: 7000, otherReversalsMinor: 3500, netSalesMinor: 4000, orderCount: 3, averageOrderValueMinor: 4833 });
    expect(report.trend).toEqual([{ date: '2026-11-01', netSalesMinor: 4000, orderCount: 3 }]); expect(report.topProducts.map(p => [p.id, p.netSalesMinor])).toEqual([['a', 4500], ['c', 2000], ['b', 0], ['old', -2500]]);
  });
  it('does not count an old order again when its refund is processed in the current period', () => { const report = retailMetrics(store, [data()[3]], period); expect(report.metrics).toMatchObject({ netSalesMinor: -2500, orderCount: 0, averageOrderValueMinor: null }); });
  it('keeps canceled/unpaid original orders; a canceled status alone does not invent a reversal', () => { const rows = data(); rows[1].adjustments = []; expect(retailMetrics(store, rows, period).metrics).toMatchObject({ netSalesMinor: 7500, orderCount: 3 }); });
  it('never includes shipping or tax, including refunded shipping/tax, in any merchandise KPI', () => { const changed = data(); for (const r of changed) { r.shippingMinor += 999999; r.taxMinor += 999999; for (const a of r.adjustments) { a.shippingMinor += 999999; a.taxMinor += 999999; } } expect(retailMetrics(store, changed, period).metrics).toEqual(retailMetrics(store, data(), period).metrics); });
  it('excludes test/deleted orders and their reversals, and unrelated stores/organizations', () => { const ignored = data()[0]; ignored.test = true; expect(retailMetrics(store, [ignored, { ...data()[0], organizationId: 'foreign' }, { ...data()[0], storeId: 'foreign' }], period).metrics.netSalesMinor).toBe(0); });
  it('fills empty days, returns zero sales and no AOV/top products rather than an invented order', () => { const r = retailMetrics(store, [], reportingPeriod('2026-11-01', '2026-11-03')); expect(r.trend).toHaveLength(3); expect(r.metrics.averageOrderValueMinor).toBeNull(); expect(r.topProducts).toEqual([]); });
  it('rejects currencies that do not match the selected store', () => { expect(() => retailMetrics(store, [{ ...data()[0], currency: 'CAD' }], period)).toThrow('currency'); });
  it.each([['2026-02-30', '2026-03-01'], ['2026-11-02', '2026-11-01'], ['2026-01-01', '2026-11-01'], ['2026-1-1', '2026-01-02']])('rejects invalid or excessive range %s through %s', (from, to) => { expect(() => reportingPeriod(from, to)).toThrow(); });
  it('uses 23 hours for the spring transition', () => { const p = reportingPeriod('2026-03-08', '2026-03-08'); expect((Date.parse(p.endExclusiveUtc) - Date.parse(p.startUtc)) / 3600000).toBe(23); });
});
