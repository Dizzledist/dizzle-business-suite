export type Role = 'owner' | 'admin' | 'sales_manager' | 'sales_rep' | 'warehouse' | 'marketing';
export type Department = 'sales' | 'marketing' | 'warehouse';
export type MarketingGrant = 'workspace:read' | 'campaign:write' | 'creative:generate' | 'asset:review' | 'asset:publish' | 'asset:read:all' | 'asset:read:published';
export interface Identity {
  id: string; name: string; organizationId: string; roles: Role[];
  departments: Department[]; marketingGrants: MarketingGrant[];
  active: boolean; read: boolean; release: boolean; demo: boolean;
}
export interface ReleaseAudit {
  actor: string; at: string; basis: 'verified_payment' | 'approved_terms';
  reason: string; terms: string | null; requestKey: string;
}
export interface JobView {
  id: string; invoiceId: string; invoiceNumber: string; accountName: string;
  status: 'Orders'; items: { sku: string; quantity: number; unit: string }[];
  review: string | null; releaseAudit?: ReleaseAudit;
}
export interface InvoiceView {
  id: string; number: string; accountId: string; accountName: string;
  sourceKey: { application: string; organizationId: string; invoiceId: string };
  currency: 'USD'; total: string; balance: string;
  payment: 'unpaid' | 'partial' | 'fully paid' | 'ambiguous';
  verification: 'verified' | 'stale' | 'unverified'; verifiedAt: string;
  mappingVerified: boolean; eligible: boolean;
  terms: { id: string; text: string; status: 'approved' | 'missing' | 'disputed' };
  jobId: string | null; holdReason: string | null; revision: number;
}
export interface Workspace {
  identity: Identity; invoices: InvoiceView[]; jobs: JobView[];
  fixtureNotice: string;
}
export const demoEvents = ['partial', 'full', 'replay', 'stale', 'unverified', 'unmapped', 'restore'] as const;
export type DemoEvent = typeof demoEvents[number];

export type ContentStatus = 'draft' | 'in_review' | 'approved' | 'scheduled';
export type AssetVersionStatus = 'draft' | 'in_review' | 'approved' | 'retired';
export type AssetKind = 'creative' | 'price_list' | 'coa' | 'reference';
export interface Brand { id: string; name: string; }
export interface Campaign {
  id: string; organizationId: string; brandId: string; title: string; objective: string; owner: string; createdBy: string; createdAt: string;
}
export interface ContentItem {
  id: string; organizationId: string; campaignId: string; brandId: string; title: string; objective: string; owner: string;
  channel: string; plannedAt: string; destinationAccount: string; caption: string;
  linkedAssetId: string | null; linkedVersionId: string | null; status: ContentStatus;
  createdBy: string; editedBy: string; approvedBy: string | null; approvedAt: string | null; approvalSnapshot: string | null;
  reviewNote: string | null; scheduledAt: string | null;
}
export interface AssetVersion {
  id: string; organizationId: string; assetId: string; number: number; status: AssetVersionStatus; mimeType: string;
  width: number | null; height: number | null; createdBy: string; createdAt: string;
  reviewedBy: string | null; reviewedAt: string | null; reviewNote: string | null;
  provenance: string; sourceType: 'generated_artwork' | 'uploaded_document' | 'original_reference';
}
export interface AssetPublication {
  id: string; organizationId: string; assetId: string; versionId: string; audienceMode: 'all' | 'selected'; repIds: string[];
  status: 'published' | 'retired'; publishedBy: string; publishedAt: string;
  retiredBy: string | null; retiredAt: string | null; retireReason: string | null;
}
export interface MarketingAsset {
  id: string; organizationId: string; brandId: string; kind: AssetKind; title: string; campaignId: string | null;
  productSku: string | null; batchId: string | null; restrictedAccountId: string | null;
  createdBy: string; sourceType: AssetVersion['sourceType']; versions: AssetVersion[];
  publications: AssetPublication[];
}
export interface GenerationJob {
  id: string; organizationId: string; assetId: string; versionId: string | null; campaignId: string; prompt: string;
  referenceAssetIds: string[]; width: number; height: number;
  status: 'succeeded' | 'failed'; error: string | null; attempts: number; createdBy: string; createdAt: string;
}
export interface MarketingWorkspaceData {
  identity: Identity; brands: Brand[]; campaigns: Campaign[]; content: ContentItem[];
  assets: MarketingAsset[]; generationJobs: GenerationJob[]; eligibleReps: { id: string; name: string }[];
  fixtureNotice: string;
}
export interface SalesAssetView {
  assetId: string; versionId: string; title: string; kind: AssetKind; brand: string;
  version: number; campaign: string | null; productSku: string | null; batchId: string | null;
  provenance: string; fileName: string; publication: AssetPublication;
}
