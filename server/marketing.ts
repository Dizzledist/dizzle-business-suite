import { randomUUID } from 'node:crypto';
import type {
  AssetPublication, AssetVersion, Brand, Campaign, ContentItem, GenerationJob, Identity,
  MarketingAsset, MarketingGrant, MarketingWorkspaceData, SalesAssetView,
} from '../shared/contracts';
import { ApiError, Workflow } from './workflow';

const organizationId = 'demo-o1';
const fixtureNotice = 'Synthetic marketing fixtures. Sample generation is local SVG artwork; publishing is internal only. Data resets on API restart or Reset demo.';
const brands: Brand[] = [
  { id: 'dizzle', name: 'Dizzle Dist' }, { id: 'cheddr', name: 'Cheddr' },
  { id: 'puffr', name: 'Puffr' }, { id: 'frosty', name: 'Frosty' },
  { id: 'georgia-hemp', name: 'Georgia Hemp Co' },
];
type FileRecord = { mimeType: string; body: string; fileName: string };
type CampaignInput = { brandId: string; title: string; objective: string; owner: string };
type ContentInput = {
  campaignId: string; title: string; objective: string; owner: string; channel: string;
  plannedAt: string; destinationAccount: string; caption: string; linkedAssetId: string | null; linkedVersionId: string | null;
};
type GenerationInput = {
  brandId: string; campaignId: string; prompt: string; referenceAssetIds: string[];
  width: number; height: number; simulateTransientError: boolean; assetId?: string;
};

const escapeXml = (value: string) => value.replace(/[<>&"']/g, character => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[character]!);
function artwork(brand: string, prompt: string, width: number, height: number, version: number) {
  const title = escapeXml(prompt.trim().split(/\s+/).slice(0, 7).join(' '));
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="#211b1b"/><path d="M0 ${height * .72} Q${width * .42} ${height * .35} ${width} ${height * .6} V${height} H0Z" fill="#8b1825"/><circle cx="${width * .78}" cy="${height * .23}" r="${Math.min(width, height) * .13}" fill="#dd3946"/><text x="8%" y="18%" fill="#f2eeee" font-family="Georgia,serif" font-size="${Math.max(20, width * .052)}">${escapeXml(brand)}</text><text x="8%" y="48%" fill="white" font-family="Georgia,serif" font-size="${Math.max(28, width * .074)}">${title}</text><text x="8%" y="90%" fill="#f7cbd0" font-family="sans-serif" font-size="${Math.max(12, width * .022)}">SAMPLE ARTWORK · VERSION ${version}</text></svg>`;
}

export interface GenerationAdapter {
  render(brand: string, prompt: string, width: number, height: number, version: number): string;
}

export class MarketingService {
  private campaigns: Campaign[] = [];
  private content: ContentItem[] = [];
  private assets: MarketingAsset[] = [];
  private jobs: GenerationJob[] = [];
  private files = new Map<string, FileRecord>();

  constructor(private workflow: Workflow, private generator: GenerationAdapter = { render: artwork }) { this.reset(); }

  reset() {
    this.campaigns = [];
    this.content = [];
    this.assets = [];
    this.jobs = [];
    this.files.clear();
    this.seed();
  }

  private require(actor: Identity, grant: MarketingGrant) {
    if (!actor.active || !actor.read || actor.organizationId !== organizationId) throw new ApiError(403, 'Marketing access is not available in this organization.');
    if (!actor.marketingGrants.includes(grant)) throw new ApiError(403, 'This action is not authorized for the current identity.');
  }

  private reps(asset?: MarketingAsset) {
    return this.workflow.identities.filter(identity => identity.active && identity.organizationId === organizationId &&
      identity.roles.includes('sales_rep') && identity.marketingGrants.includes('asset:read:published') &&
      (!asset?.restrictedAccountId || this.workflow.isAssignedToAccount(identity, asset.restrictedAccountId)));
  }

  workspace(actor: Identity): MarketingWorkspaceData {
    this.require(actor, 'workspace:read');
    return {
      identity: { ...actor }, brands: brands.map(brand => ({ ...brand })),
      campaigns: this.campaigns.map(campaign => ({ ...campaign })),
      content: this.content.map(item => ({ ...item })),
      assets: this.assets.filter(asset => !['price_list', 'coa'].includes(asset.kind) || actor.marketingGrants.includes('asset:read:all')).map(asset => ({ ...asset, versions: asset.versions.map(version => ({ ...version })), publications: asset.publications.map(publication => ({ ...publication, repIds: [...publication.repIds] })) })),
      generationJobs: this.jobs.map(job => ({ ...job, referenceAssetIds: [...job.referenceAssetIds] })),
      eligibleReps: this.reps().map(rep => ({ id: rep.id, name: rep.name })), fixtureNotice,
    };
  }

  createCampaign(actor: Identity, input: CampaignInput) {
    this.require(actor, 'campaign:write');
    this.brand(input.brandId);
    const campaign: Campaign = { id: `campaign-${randomUUID()}`, organizationId, ...input, createdBy: actor.id, createdAt: new Date().toISOString() };
    this.campaigns.push(campaign);
    return { ...campaign };
  }

  createContent(actor: Identity, input: ContentInput) {
    this.require(actor, 'campaign:write');
    const campaign = this.campaign(input.campaignId);
    this.validateLinkedVersion(input.linkedAssetId, input.linkedVersionId, campaign.brandId);
    const item: ContentItem = {
      id: `content-${randomUUID()}`, organizationId, ...input, campaignId: campaign.id, brandId: campaign.brandId,
      status: 'draft', createdBy: actor.id, editedBy: actor.id, approvedBy: null, approvedAt: null,
      approvalSnapshot: null, reviewNote: null, scheduledAt: null,
    };
    this.content.push(item);
    return { ...item };
  }

  updateContent(actor: Identity, id: string, input: ContentInput) {
    this.require(actor, 'campaign:write');
    const item = this.contentItem(id);
    const campaign = this.campaign(input.campaignId);
    this.validateLinkedVersion(input.linkedAssetId, input.linkedVersionId, campaign.brandId);
    Object.assign(item, input, { editedBy: actor.id, campaignId: campaign.id, brandId: campaign.brandId, status: 'draft',
      approvedBy: null, approvedAt: null, approvalSnapshot: null, reviewNote: null, scheduledAt: null });
    return { ...item };
  }

  submitContent(actor: Identity, id: string) {
    this.require(actor, 'campaign:write');
    const item = this.contentItem(id);
    if (item.status !== 'draft') throw new ApiError(409, 'Only draft content can be submitted.');
    item.status = 'in_review';
    item.reviewNote = null;
    return { ...item };
  }

  reviewContent(actor: Identity, id: string, decision: 'approve' | 'return', notes: string) {
    this.require(actor, 'asset:review');
    const item = this.contentItem(id);
    if (item.status !== 'in_review') throw new ApiError(409, 'Content must be in review.');
    if (actor.id === item.createdBy || actor.id === item.editedBy) throw new ApiError(403, 'Self-approval is disabled in this local demo.');
    item.reviewNote = notes.trim() || null;
    if (decision === 'return') {
      item.status = 'draft'; item.approvedBy = null; item.approvedAt = null; item.approvalSnapshot = null;
    } else {
      item.status = 'approved'; item.approvedBy = actor.id; item.approvedAt = new Date().toISOString();
      item.approvalSnapshot = this.contentSnapshot(item);
    }
    return { ...item };
  }

  scheduleContent(actor: Identity, id: string) {
    this.require(actor, 'campaign:write');
    const item = this.contentItem(id);
    if (item.status !== 'approved' || item.approvalSnapshot !== this.contentSnapshot(item))
      throw new ApiError(409, 'Content needs current approval before it can be scheduled.');
    this.validateLinkedVersion(item.linkedAssetId, item.linkedVersionId, item.brandId);
    item.status = 'scheduled'; item.scheduledAt = new Date().toISOString();
    return { ...item };
  }

  createGeneration(actor: Identity, input: GenerationInput) {
    this.require(actor, 'creative:generate');
    const campaign = this.campaign(input.campaignId);
    if (campaign.brandId !== input.brandId) throw new ApiError(400, 'Campaign and brand must match.');
    for (const referenceId of input.referenceAssetIds) {
      const reference = this.asset(referenceId);
      if (reference.kind !== 'reference' || reference.brandId !== input.brandId) throw new ApiError(400, 'References must be original files from this brand.');
    }
    let asset: MarketingAsset;
    if (input.assetId) {
      asset = this.asset(input.assetId);
      if (asset.kind !== 'creative' || asset.brandId !== input.brandId || asset.campaignId !== campaign.id)
        throw new ApiError(400, 'A variation must remain in the same brand and campaign.');
    } else {
      asset = this.newAsset({ brandId: input.brandId, kind: 'creative', title: `Creative · ${campaign.title}`, campaignId: campaign.id,
        productSku: null, batchId: null, restrictedAccountId: null, createdBy: actor.id, sourceType: 'generated_artwork' });
      this.assets.push(asset);
    }
    const job: GenerationJob = {
      id: `generation-${randomUUID()}`, organizationId, assetId: asset.id, versionId: null,
      campaignId: campaign.id, prompt: input.prompt.trim(), referenceAssetIds: [...input.referenceAssetIds],
      width: input.width, height: input.height, status: 'succeeded', error: null, attempts: 1,
      createdBy: actor.id, createdAt: new Date().toISOString(),
    };
    if (input.simulateTransientError) {
      job.status = 'failed'; job.error = 'Sample adapter transient error. Retry this job to complete the same request.';
    } else this.completeGeneration(job, asset);
    this.jobs.unshift(job);
    return { ...job, referenceAssetIds: [...job.referenceAssetIds] };
  }

  retryGeneration(actor: Identity, id: string) {
    this.require(actor, 'creative:generate');
    const job = this.jobs.find(candidate => candidate.id === id);
    if (!job) throw new ApiError(404, 'Generation job not found.');
    if (job.createdBy !== actor.id) throw new ApiError(404, 'Generation job not found.');
    if (job.status === 'succeeded') return { ...job, referenceAssetIds: [...job.referenceAssetIds] };
    job.attempts++;
    job.status = 'succeeded'; job.error = null;
    this.completeGeneration(job, this.asset(job.assetId));
    return { ...job, referenceAssetIds: [...job.referenceAssetIds] };
  }

  submitVersion(actor: Identity, id: string) {
    this.require(actor, 'campaign:write');
    const version = this.version(id);
    if (version.createdBy !== actor.id) throw new ApiError(404, 'Asset version not found.');
    if (version.status !== 'draft') throw new ApiError(409, 'Only a draft version can be submitted.');
    version.status = 'in_review';
    return { ...version };
  }

  reviewVersion(actor: Identity, id: string, decision: 'approve' | 'return', notes: string) {
    this.require(actor, 'asset:review');
    const version = this.version(id);
    if (version.status !== 'in_review') throw new ApiError(409, 'Asset version must be in review.');
    if (actor.id === version.createdBy) throw new ApiError(403, 'Self-approval is disabled in this local demo.');
    version.reviewedBy = actor.id; version.reviewedAt = new Date().toISOString(); version.reviewNote = notes.trim() || null;
    version.status = decision === 'approve' ? 'approved' : 'draft';
    return { ...version };
  }

  publishVersion(actor: Identity, id: string, audienceMode: 'all' | 'selected', repIds: string[]) {
    this.require(actor, 'asset:publish');
    const version = this.version(id);
    const asset = this.asset(version.assetId);
    if (version.status !== 'approved') throw new ApiError(409, 'Only the approved version can be published.');
    const eligible = this.reps(asset);
    const selected = audienceMode === 'all' ? eligible.map(rep => rep.id).sort() : [...new Set(repIds)].sort();
    if (audienceMode === 'selected' && (selected.length === 0 || selected.some(repId => !eligible.some(rep => rep.id === repId))))
      throw new ApiError(403, 'Selected audience includes an ineligible representative.');
    const existing = asset.publications.find(publication => publication.versionId === id && publication.audienceMode === audienceMode &&
      publication.repIds.join(',') === selected.join(',') && publication.status === 'published');
    if (existing) return { ...existing, repIds: [...existing.repIds] };
    const publication: AssetPublication = {
      id: `publication-${randomUUID()}`, organizationId, assetId: asset.id, versionId: id,
      audienceMode, repIds: selected, status: 'published', publishedBy: actor.id,
      publishedAt: new Date().toISOString(), retiredBy: null, retiredAt: null, retireReason: null,
    };
    asset.publications.push(publication);
    return { ...publication, repIds: [...publication.repIds] };
  }

  retirePublication(actor: Identity, id: string, reason: string) {
    this.require(actor, 'asset:publish');
    const publication = this.publication(id);
    if (publication.status === 'retired') return { ...publication, repIds: [...publication.repIds] };
    publication.status = 'retired'; publication.retiredBy = actor.id;
    publication.retiredAt = new Date().toISOString(); publication.retireReason = reason.trim();
    return { ...publication, repIds: [...publication.repIds] };
  }

  publishedAssets(actor: Identity): SalesAssetView[] {
    if (actor.organizationId !== organizationId) throw new ApiError(403, 'Asset access is not available in this organization.');
    const isRep = actor.roles.includes('sales_rep') && actor.marketingGrants.includes('asset:read:published');
    const canReadAll = actor.marketingGrants.includes('asset:read:all');
    if (!isRep && !canReadAll) throw new ApiError(403, 'Published Assets access is required.');
    return this.assets.flatMap(asset => asset.publications.filter(publication => publication.status === 'published')
      .filter(publication => canReadAll || this.isVisibleToRep(actor, asset, publication))
      .map(publication => {
        const version = asset.versions.find(candidate => candidate.id === publication.versionId)!;
        return { assetId: asset.id, versionId: version.id, title: asset.title, kind: asset.kind,
          brand: brands.find(brand => brand.id === asset.brandId)!.name, version: version.number,
          campaign: this.campaigns.find(campaign => campaign.id === asset.campaignId)?.title ?? null,
          productSku: asset.productSku, batchId: asset.batchId, provenance: version.provenance,
          fileName: this.files.get(version.id)?.fileName ?? asset.title,
          publication: { ...publication, repIds: [...publication.repIds] } };
      }));
  }

  publishedFile(actor: Identity, assetId: string, versionId: string): FileRecord {
    const asset = this.asset(assetId);
    const version = asset.versions.find(candidate => candidate.id === versionId);
    const canReadAll = actor.organizationId === asset.organizationId && actor.marketingGrants.includes('asset:read:all');
    if (!version || version.status !== 'approved' || !asset.publications.some(publication =>
      publication.versionId === versionId && publication.status === 'published' && (canReadAll || this.isVisibleToRep(actor, asset, publication))))
      throw new ApiError(404, 'Asset not found.');
    return this.files.get(versionId)!;
  }

  marketingFile(actor: Identity, id: string): FileRecord {
    this.require(actor, 'workspace:read');
    const asset = this.assets.find(candidate => candidate.organizationId === actor.organizationId && candidate.versions.some(version => version.id === id));
    if (!asset || ((asset.kind === 'price_list' || asset.kind === 'coa') && !actor.marketingGrants.includes('asset:read:all')))
      throw new ApiError(404, 'Asset version not found.');
    const file = this.files.get(id);
    if (!file) throw new ApiError(404, 'Asset version not found.');
    return file;
  }

  private isVisibleToRep(actor: Identity, asset: MarketingAsset, publication: AssetPublication) {
    return actor.active && actor.organizationId === asset.organizationId && actor.roles.includes('sales_rep') &&
      actor.marketingGrants.includes('asset:read:published') &&
      publication.repIds.includes(actor.id) &&
      (!asset.restrictedAccountId || this.workflow.isAssignedToAccount(actor, asset.restrictedAccountId));
  }

  private completeGeneration(job: GenerationJob, asset: MarketingAsset) {
    const versionNumber = Math.max(0, ...asset.versions.map(version => version.number)) + 1;
    const id = `version-${randomUUID()}`;
    const version: AssetVersion = {
      id, organizationId, assetId: asset.id, number: versionNumber, status: 'draft', mimeType: 'image/svg+xml',
      width: job.width, height: job.height, createdBy: job.createdBy, createdAt: new Date().toISOString(),
      reviewedBy: null, reviewedAt: null, reviewNote: null, provenance: 'Local sample generation adapter; not an AI/provider result.',
      sourceType: 'generated_artwork',
    };
    asset.versions.push(version);
    job.versionId = id;
    this.files.set(id, { mimeType: version.mimeType, body: this.generator.render(brands.find(brand => brand.id === asset.brandId)!.name, job.prompt, job.width, job.height, versionNumber), fileName: `sample-artwork-v${versionNumber}.svg` });
  }

  private newAsset(input: Pick<MarketingAsset, 'brandId' | 'kind' | 'title' | 'campaignId' | 'productSku' | 'batchId' | 'restrictedAccountId' | 'createdBy' | 'sourceType'>): MarketingAsset {
    return { id: `asset-${randomUUID()}`, organizationId, brandId: input.brandId, kind: input.kind, title: input.title,
      campaignId: input.campaignId, productSku: input.productSku, batchId: input.batchId,
      restrictedAccountId: input.restrictedAccountId, createdBy: input.createdBy, sourceType: input.sourceType,
      versions: [], publications: [] };
  }

  private seed() {
    const now = new Date().toISOString();
    const campaign: Campaign = { id: 'campaign-cheddr-launch', organizationId, brandId: 'cheddr', title: 'Cheddr autumn launch', objective: 'Introduce the seasonal wholesale collection.', owner: 'Cheddr Marketing', createdBy: 'marketing', createdAt: now };
    this.campaigns.push(campaign);
    const scheduled: ContentItem = {
      id: 'content-scheduled-sample', organizationId, campaignId: campaign.id, brandId: campaign.brandId,
      title: 'Autumn collection preview', objective: 'Build awareness with wholesale buyers.', owner: 'Cheddr Marketing',
      channel: 'Instagram', plannedAt: '2026-11-18T19:00:00.000Z', destinationAccount: '@cheddr',
      caption: 'A new season is taking shape. Ask your Dizzle representative for the collection details.',
      linkedAssetId: null, linkedVersionId: null, status: 'scheduled', createdBy: 'marketing', editedBy: 'marketing', approvedBy: 'owner',
      approvedAt: now, approvalSnapshot: null, reviewNote: null, scheduledAt: now,
    };
    scheduled.approvalSnapshot = this.contentSnapshot(scheduled);
    this.content.push(scheduled);
    const creative = this.seedAsset({ brandId: 'cheddr', kind: 'creative', title: 'Cheddr autumn campaign image', campaignId: campaign.id,
      productSku: 'CH-AUTUMN-01', batchId: null, restrictedAccountId: null, createdBy: 'marketing', sourceType: 'generated_artwork',
      mimeType: 'image/svg+xml', body: artwork('Cheddr', 'Autumn collection preview', 1080, 1350, 1), fileName: 'cheddr-autumn-v1.svg', provenance: 'Seeded approved campaign creative; sample data.' });
    this.publishSeed(creative, 'all', []);
    const priceList = this.seedAsset({ brandId: 'dizzle', kind: 'price_list', title: 'Juniper Market wholesale price list', campaignId: null,
      productSku: null, batchId: null, restrictedAccountId: 'account-a', createdBy: 'owner', sourceType: 'uploaded_document',
      mimeType: 'text/csv', body: 'SKU,Product,Wholesale price\nDZ-LEMON-001,Sample lemon product,12.00\n', fileName: 'sample-price-list.csv', provenance: 'Synthetic account-scoped demo document; not a current price quote.' });
    this.publishSeed(priceList, 'selected', ['rep-a']);
    const coa = this.seedAsset({ brandId: 'puffr', kind: 'coa', title: 'Batch BATCH-26-044 COA', campaignId: null,
      productSku: 'PF-MINT-001', batchId: 'BATCH-26-044', restrictedAccountId: null, createdBy: 'owner', sourceType: 'uploaded_document',
      mimeType: 'text/plain', body: 'SAMPLE CERTIFICATE OF ANALYSIS\nProduct: PF-MINT-001\nBatch: BATCH-26-044\nSource: Synthetic uploaded-document fixture\nStatus: Demonstration only; not a laboratory result.\n',
      fileName: 'sample-BATCH-26-044-coa.txt', provenance: 'Synthetic uploaded-document fixture. COAs are never generated creative.' });
    this.publishSeed(coa, 'all', []);
    this.seedAsset({ brandId: 'cheddr', kind: 'reference', title: 'Original Cheddr logo reference', campaignId: null,
      productSku: null, batchId: null, restrictedAccountId: null, createdBy: 'owner', sourceType: 'original_reference',
      mimeType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200"><rect width="100%" height="100%" fill="#211b1b"/><text x="30" y="120" fill="white" font-size="64">CHEDDR · ORIGINAL</text></svg>',
      fileName: 'original-cheddr-logo.svg', provenance: 'Original reference fixture; kept separate and unchanged.' });
    this.seedAsset({ brandId: 'cheddr', kind: 'reference', title: 'Original product render reference', campaignId: null,
      productSku: 'CH-AUTUMN-01', batchId: null, restrictedAccountId: null, createdBy: 'owner', sourceType: 'original_reference',
      mimeType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><rect width="100%" height="100%" fill="#eee"/><rect x="110" y="55" width="180" height="290" rx="8" fill="#8b1825"/><rect x="125" y="125" width="150" height="130" fill="#fff"/><text x="140" y="195" fill="#211b1b" font-size="22">PRODUCT RENDER</text></svg>',
      fileName: 'original-product-render.svg', provenance: 'Original product render fixture; packaging art is not altered by the sample adapter.' });
  }

  private seedAsset(input: Parameters<MarketingService['newAsset']>[0] & { mimeType: string; body: string; fileName: string; provenance: string }) {
    const asset = this.newAsset(input);
    const version: AssetVersion = { id: `version-${randomUUID()}`, organizationId, assetId: asset.id, number: 1,
      status: 'approved', mimeType: input.mimeType, width: input.kind === 'creative' ? 1080 : null,
      height: input.kind === 'creative' ? 1350 : null, createdBy: input.createdBy, createdAt: new Date().toISOString(),
      reviewedBy: 'owner', reviewedAt: new Date().toISOString(), reviewNote: 'Approved sample fixture.',
      provenance: input.provenance, sourceType: input.sourceType };
    asset.versions.push(version); this.assets.push(asset);
    this.files.set(version.id, { mimeType: input.mimeType, body: input.body, fileName: input.fileName });
    return asset;
  }

  private publishSeed(asset: MarketingAsset, audienceMode: 'all' | 'selected', repIds: string[]) {
    asset.publications.push({ id: `publication-${randomUUID()}`, organizationId, assetId: asset.id,
      versionId: asset.versions[0].id, audienceMode, repIds: audienceMode === 'all' ? this.reps(asset).map(rep => rep.id).sort() : repIds, status: 'published', publishedBy: 'owner',
      publishedAt: new Date().toISOString(), retiredBy: null, retiredAt: null, retireReason: null });
  }

  private contentSnapshot(item: ContentItem) {
    return JSON.stringify([item.campaignId, item.brandId, item.title, item.objective, item.owner, item.channel,
      item.plannedAt, item.destinationAccount, item.caption, item.linkedAssetId, item.linkedVersionId]);
  }
  private brand(id: string) { const brand = brands.find(candidate => candidate.id === id); if (!brand) throw new ApiError(404, 'Brand not found.'); return brand; }
  private campaign(id: string) { const item = this.campaigns.find(candidate => candidate.id === id); if (!item) throw new ApiError(404, 'Campaign not found.'); return item; }
  private contentItem(id: string) { const item = this.content.find(candidate => candidate.id === id); if (!item) throw new ApiError(404, 'Content item not found.'); return item; }
  private asset(id: string) { const item = this.assets.find(candidate => candidate.id === id); if (!item) throw new ApiError(404, 'Asset not found.'); return item; }
  private version(id: string): AssetVersion { const version = this.assets.flatMap(asset => asset.versions).find(candidate => candidate.id === id); if (!version) throw new ApiError(404, 'Asset version not found.'); return version; }
  private publication(id: string) { const publication = this.assets.flatMap(asset => asset.publications).find(candidate => candidate.id === id); if (!publication) throw new ApiError(404, 'Publication not found.'); return publication; }
  private validateLinkedVersion(assetId: string | null, versionId: string | null, brandId: string) {
    if (!assetId && !versionId) return;
    const asset = assetId ? this.asset(assetId) : null;
    const version = versionId ? this.version(versionId) : null;
    if (!asset || !version || asset.kind !== 'creative' || asset.brandId !== brandId || version.assetId !== asset.id || version.status !== 'approved')
      throw new ApiError(409, 'Content can link only to an approved creative version from the same brand.');
  }
}