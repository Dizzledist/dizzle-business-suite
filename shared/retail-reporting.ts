export const reportingZone = 'America/Los_Angeles';
export const managementDashboards = ['owner', 'admin', 'sales_manager'] as const;
export type ManagementDashboard = typeof managementDashboards[number];
export interface ReportingPeriod { from: string; to: string; startUtc: string; endExclusiveUtc: string; timeZone: typeof reportingZone; }
export interface RetailStore { id: string; organizationId: string; name: string; currency: string; source: 'shopify-fixture'; updatedAt: string; available: boolean; coverageFrom: string; coverageThrough: string; }
export interface RetailMetrics { grossSalesMinor: number; discountsMinor: number; refundsMinor: number; otherReversalsMinor: number; netSalesMinor: number; orderCount: number; averageOrderValueMinor: number | null; }
export interface RetailReport { demo: true; definition: 'retail-merchandise-v1'; period: ReportingPeriod; store: RetailStore; metrics: RetailMetrics; trend: { date: string; netSalesMinor: number; orderCount: number }[]; topProducts: { id: string; title: string; netSalesMinor: number; netQuantity: number }[]; }
export interface ChannelSubtotal { channel: 'zoho' | 'shopify'; label: string; currency: string; netSalesMinor: number | null; available: boolean; updatedAt: string; }
export interface ManagementReport { demo: true; period: ReportingPeriod; dashboard: ManagementDashboard; includeShopify: boolean; wholesale: ChannelSubtotal; retail: ChannelSubtotal[]; combined: { currency: string; netSalesMinor: number } | null; explanation: string; }
