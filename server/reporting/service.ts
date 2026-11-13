import type { IncomingMessage, ServerResponse } from 'node:http';
import { z } from 'zod';
import type { EmployeeContext } from '../../shared/identity';
import { managementDashboards, type ChannelSubtotal, type ManagementDashboard, type ManagementReport, type ReportingPeriod } from '../../shared/retail-reporting';
import { ApiError } from '../workflow';
import { retailMetrics } from './metrics';
import { reportingPeriod } from './period';
import type { ReportingSource } from './fixtures';
import { ReportingPreferences } from './preferences';
export class ReportingService {
  constructor(private source: ReportingSource, private preferences: ReportingPreferences) {}
  close() { this.preferences.close(); }
  stores(employee: EmployeeContext) {
    if (!employee.grants.includes('retail:read') || !employee.roles.some(role => ['marketing', 'owner', 'admin', 'sales_manager'].includes(role))) throw new ApiError(403, 'Retail reporting permission required.');
    return this.source.stores().filter(store => store.organizationId === employee.organizationId && employee.retailStoreIds.includes(store.id));
  }
  retail(employee: EmployeeContext, storeId: string, period: ReportingPeriod) {
    const store = this.stores(employee).find(store => store.id === storeId); if (!store) throw new ApiError(404, 'Store not found or not authorized.');
    if (period.from < store.coverageFrom || period.to > store.coverageThrough) throw new ApiError(422, `Demo source covers ${store.coverageFrom} through ${store.coverageThrough}. Choose dates inside that coverage.`);
    if (!store.available) throw new ApiError(503, 'This store source is unavailable. No total is assumed.');
    return retailMetrics(store, this.source.orders(store), period);
  }
  private managementAccess(employee: EmployeeContext, dashboard: ManagementDashboard) { if (!employee.roles.includes(dashboard) || !employee.grants.includes('wholesale:read')) throw new ApiError(403, 'Current role and wholesale reporting permission required for this dashboard.'); }
  preference(employee: EmployeeContext, dashboard: ManagementDashboard, include?: boolean) {
    this.managementAccess(employee, dashboard);
    if (include !== undefined) { if (include && !this.stores(employee).length) throw new ApiError(403, 'No authorized retail stores are assigned.'); this.preferences.set(employee, dashboard, include); }
    return { dashboard, includeShopify: this.preferences.get(employee, dashboard) };
  }
  management(employee: EmployeeContext, dashboard: ManagementDashboard, period: ReportingPeriod): ManagementReport {
    const includeShopify = this.preference(employee, dashboard).includeShopify;
    let wholesale: ChannelSubtotal;
    try { wholesale = this.source.wholesale(employee.organizationId, period); } catch { wholesale = { channel: 'zoho', label: 'Zoho wholesale · demo', currency: '', available: false, netSalesMinor: null, updatedAt: '' }; }
    let retailAccessDenied = false;
    let scopedStores: ReturnType<ReportingService['stores']> = [];
    if (includeShopify) { try { scopedStores = this.stores(employee); } catch (error) { if (error instanceof ApiError && error.status === 403) retailAccessDenied = true; else throw error; } }
    const retail: ChannelSubtotal[] = scopedStores.map(store => { try { const report = this.retail(employee, store.id, period); return { channel: 'shopify' as const, label: store.name, currency: store.currency, netSalesMinor: report.metrics.netSalesMinor, available: true, updatedAt: store.updatedAt }; } catch { return { channel: 'shopify' as const, label: store.name, currency: store.currency, netSalesMinor: null, available: false, updatedAt: store.updatedAt }; } });
    const channels = [wholesale, ...retail];
    let explanation = includeShopify ? 'Separate wholesale and retail channels are added directly; no order matching or deduplication.' : 'Shopify is excluded. Showing Zoho wholesale only.';
    let combined: ManagementReport['combined'] = null;
    if (includeShopify) {
      if (retailAccessDenied) explanation = 'Combined total unavailable: current retail access is denied. No retail data is returned; available wholesale remains visible.';
      else if (!retail.length || channels.some(c => !c.available || c.netSalesMinor === null)) explanation = 'Combined total unavailable: a reporting source is unavailable or no stores are assigned. Available subtotals are shown.';
      else if (new Set(channels.map(c => c.currency)).size !== 1) explanation = 'Combined total unavailable: source currencies differ. No exchange-rate conversion is applied.';
      else { const total = channels.reduce((sum, c) => sum + c.netSalesMinor!, 0); if (!Number.isSafeInteger(total)) throw new ApiError(422, 'Combined amount exceeds supported integer range.'); combined = { currency: wholesale.currency, netSalesMinor: total }; }
    }
    return { demo: true, period, dashboard, includeShopify, wholesale, retail, combined, explanation };
  }
  async handle(req: IncomingMessage, res: ServerResponse, employee: EmployeeContext) {
    const url = new URL(req.url!, 'http://internal'), path = url.pathname;
    const respond = (value: unknown) => { res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); res.end(JSON.stringify(value)); };
    for (const key of url.searchParams.keys()) if (!['from', 'to', 'storeId'].includes(key) || url.searchParams.getAll(key).length !== 1) throw new ApiError(400, 'Invalid reporting query.');
    const management = /^\/api\/reporting\/management\/(owner|admin|sales_manager)(\/preference)?$/.exec(path);
    if (management?.[2]) {
      const dashboard = z.enum(managementDashboards).parse(management[1]);
      if (req.method === 'GET') return respond(this.preference(employee, dashboard));
      if (req.method === 'PATCH') { if (url.search) throw new ApiError(400, 'Preference writes do not accept query parameters.'); if (!req.headers['content-type']?.startsWith('application/json')) throw new ApiError(415, 'JSON required.'); let raw = ''; for await (const chunk of req) { raw += String(chunk); if (Buffer.byteLength(raw) > 1024) throw new ApiError(413, 'Preference payload too large.'); } let input; try { input = JSON.parse(raw); } catch { throw new ApiError(400, 'Invalid JSON.'); } const value = z.object({ includeShopify: z.boolean() }).strict().parse(input); return respond(this.preference(employee, dashboard, value.includeShopify)); }
    }
    if (req.method === 'GET' && path === '/api/reporting/retail/stores') return respond({ demo: true, stores: this.stores(employee) });
    if (req.method !== 'GET') throw new ApiError(404, 'Reporting route not found.');
    let period: ReportingPeriod; try { period = reportingPeriod(url.searchParams.get('from') ?? '', url.searchParams.get('to') ?? ''); } catch { throw new ApiError(400, 'Use valid YYYY-MM-DD dates, from ≤ to, at most 93 days.'); }
    if (path === '/api/reporting/retail') return respond(this.retail(employee, z.string().min(1).max(80).parse(url.searchParams.get('storeId')), period));
    if (management && !management[2]) return respond(this.management(employee, z.enum(managementDashboards).parse(management[1]), period));
    throw new ApiError(404, 'Reporting route not found.');
  }
}
