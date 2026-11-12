import { randomUUID, createHash } from 'node:crypto';
import sharp from 'sharp';
import { assertPublishingAuthority, publishingFingerprint, PublishingHold } from './publishing/authorization';
import { PublishingQueue } from './publishing/queue';
import { OpenAICaptionDrafter, type CaptionDrafter } from './publishing/drafts';
import { testAccounts } from './publishing/adapters';
import type { SocialAccount } from '../shared/publishing';
import { ImageGenerationError, OpenAIImageGenerator, type ImageGenerator, type GeneratedImage } from './image-generation';
import { MarketingStore } from './marketing-store';
import type {
  AssetPublication, AssetVersion, Brand, Campaign, ContentItem, GenerationJob, Identity,
  MarketingAsset, MarketingGrant, MarketingWorkspaceData, SalesAssetView, BrandKit,
} from '../shared/contracts';
import { ApiError } from './workflow';

export interface MarketingAuthority { identities: Identity[]; isAssignedToAccount(actor: Identity, accountId: string): boolean; }
const fixtureNotice = 'Synthetic business fixtures and isolated test images. Live social publishing is OFF; test destinations simulate posts. Ephemeral test state resets on API restart or Reset demo.';
const brands: Brand[] = [
  { id: 'dizzle', name: 'Dizzle Dist' }, { id: 'cheddr', name: 'Cheddr' },
  { id: 'puffr', name: 'Puffr' }, { id: 'frosty', name: 'Frosty' },
  { id: 'georgia-hemp', name: 'Georgia Hemp Co' },
];
type FileRecord = { mimeType: string; body: string | Buffer; fileName: string };
type CampaignInput = { brandId: string; title: string; objective: string; owner: string };
type ContentInput = {
  campaignId: string; title: string; objective: string; owner: string; channel: string;
  destinationAccountId?: string | null; plannedAt: string; destinationAccount: string; caption: string; linkedAssetId: string | null; linkedVersionId: string | null;
};
type GenerationInput = {
  brandId: string; campaignId: string; prompt: string; referenceAssetIds: string[];
  width: number; height: number; simulateTransientError: boolean; assetId?: string; requestKey: string;
};
type BrandKitInput = Pick<BrandKit, 'imageType' | 'visualStyle' | 'palette' | 'typography' | 'logoRules' | 'avoid' | 'guidelines' | 'brandBibleMarkdown' | 'brandBibleFileName' | 'defaultReferenceIds' | 'referenceCategories'> & { expectedRevision: number };

const escapeXml = (value: string) => value.replace(/[<>&"']/g, character => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[character]!);
function fixtureArtwork(brand: string, prompt: string, width: number, height: number, version: number) {
  const title = escapeXml(prompt.trim().split(/\s+/).slice(0, 7).join(' '));
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="#211b1b"/><path d="M0 ${height * .72} Q${width * .42} ${height * .35} ${width} ${height * .6} V${height} H0Z" fill="#8b1825"/><circle cx="${width * .78}" cy="${height * .23}" r="${Math.min(width, height) * .13}" fill="#dd3946"/><text x="8%" y="18%" fill="#f2eeee" font-family="Georgia,serif" font-size="${Math.max(20, width * .052)}">${escapeXml(brand)}</text><text x="8%" y="48%" fill="white" font-family="Georgia,serif" font-size="${Math.max(28, width * .074)}">${title}</text><text x="8%" y="90%" fill="#f7cbd0" font-family="sans-serif" font-size="${Math.max(12, width * .022)}">SAMPLE ARTWORK · VERSION ${version}</text></svg>`;
}

export class MarketingService {
  private campaigns: Campaign[] = [];
  private content: ContentItem[] = [];
  private assets: MarketingAsset[] = [];
  private jobs: GenerationJob[] = [];
  private files = new Map<string, FileRecord>();
  private brandKits: BrandKit[] = brands.map(brand => ({ brandId: brand.id, revision: 0, imageType: '', visualStyle: '', palette: '', typography: '', logoRules: '', avoid: '', guidelines: '', brandBibleMarkdown: '', brandBibleFileName: '', defaultReferenceIds: [], referenceCategories: {}, updatedBy: null, updatedAt: null }));

  readonly publishingQueue: PublishingQueue;
  constructor(private workflow: MarketingAuthority, private generator: ImageGenerator = new OpenAIImageGenerator(), private store?: MarketingStore, queue?: PublishingQueue, readonly socialAccounts: SocialAccount[] = testAccounts, private drafter: CaptionDrafter = new OpenAICaptionDrafter(), private organizationId = 'demo-o1', private seedFixtures = true) {
    this.publishingQueue = queue ?? new PublishingQueue();
    if (this.seedFixtures) this.seed();
    const saved = store?.load() as { schema?: number; campaigns?: Campaign[]; content?: ContentItem[]; assets?: MarketingAsset[]; jobs?: GenerationJob[]; brandKits?: BrandKit[]; files?: [string, { mimeType: string; fileName: string; body: string }][] } | null;
    if (saved) {
      if (saved.schema !== 1 || ![saved.campaigns, saved.content, saved.assets, saved.jobs, saved.files].every(Array.isArray)) throw new Error('Unsupported saved marketing state. Preserve it before recovery.');
      this.campaigns = saved.campaigns!; this.content = saved.content!; this.assets = saved.assets!; this.jobs = saved.jobs!;
      if (saved.brandKits) this.brandKits = this.brandKits.map(blank => saved.brandKits!.find(kit => kit.brandId === blank.brandId) ?? blank);
      this.files = new Map(saved.files!.map(([id, file]) => [id, { ...file, body: Buffer.from(file.body, 'base64') }]));
      for (const job of this.jobs) if (job.status === 'running') { job.status = 'failed'; job.retryable = false; job.outcomeUnknown = true; job.error = 'The API restarted during generation. Check OpenAI usage before starting another image.'; }
    }
    if ([...this.campaigns, ...this.content, ...this.assets, ...this.jobs].some(record => record.organizationId !== this.organizationId)) throw new Error('Marketing store organization mismatch. No implicit migration allowed.');
    this.persist();
  }

  private persist() {
    this.store?.save({ schema: 1, campaigns: this.campaigns, content: this.content, assets: this.assets, jobs: this.jobs, brandKits: this.brandKits,
      files: [...this.files.entries()].map(([id, file]) => [id, { ...file, body: Buffer.from(file.body).toString('base64') }]) });
  }
  private attemptsToday() {
    const today = new Date().toISOString().slice(0, 10);
    return this.jobs.reduce((sum, job) => sum + job.attemptDates.filter(date => date.startsWith(today)).length, 0);
  }
  private requireGenerationCapacity() {
    if (!this.generator.ready) throw new ApiError(503, this.generator.message);
    if (this.jobs.some(job => job.status === 'running')) throw new ApiError(409, 'An image is already generating. Wait for it to finish.');
    if (this.attemptsToday() >= 10) throw new ApiError(429, 'The local limit of 10 image attempts per UTC day has been reached.');
  }

  reset() {
    if (this.store) return; // Paid image history is never erased by invoice-demo reset.
    this.campaigns = [];
    this.content = [];
    this.assets = [];
    this.jobs = [];
    this.brandKits = this.brandKits.map(kit => ({ ...kit, revision: 0, imageType: '', visualStyle: '', palette: '', typography: '', logoRules: '', avoid: '', guidelines: '', brandBibleMarkdown: '', brandBibleFileName: '', defaultReferenceIds: [], referenceCategories: {}, updatedBy: null, updatedAt: null }));
    this.files.clear();
    if (this.seedFixtures) this.seed();
  }

  private require(actor: Identity, grant: MarketingGrant) {
    if (!actor.active || !actor.read || actor.organizationId !== this.organizationId) throw new ApiError(403, 'Marketing access is not available in this organization.');
    if (!actor.marketingGrants.includes(grant)) throw new ApiError(403, 'This action is not authorized for the current identity.');
  }

  private reps(asset?: MarketingAsset) {
    return this.workflow.identities.filter(identity => identity.active && identity.organizationId === this.organizationId &&
      identity.roles.includes('sales_rep') && identity.marketingGrants.includes('asset:read:published') &&
      (!asset?.restrictedAccountId || this.workflow.isAssignedToAccount(identity, asset.restrictedAccountId)));
  }

  workspace(actor: Identity): MarketingWorkspaceData {
    this.require(actor, 'workspace:read');
    return {
      socialAccounts: structuredClone(this.socialAccounts), publishingJobs: this.publishingQueue.list().filter(job => job.payload.organizationId === this.organizationId), livePublishingEnabled: false,
      identity: { ...actor }, brands: brands.map(brand => ({ ...brand })),
      brandKits: structuredClone(this.brandKits),
      campaigns: this.campaigns.map(campaign => ({ ...campaign })),
      content: this.content.map(item => ({ ...item })),
      assets: this.assets.filter(asset => !['price_list', 'coa'].includes(asset.kind) || actor.marketingGrants.includes('asset:read:all')).map(asset => ({ ...asset, versions: asset.versions.map(version => ({ ...version })), publications: asset.publications.map(publication => ({ ...publication, repIds: [...publication.repIds] })) })),
      generationJobs: this.jobs.map(job => ({ ...job, referenceAssetIds: [...job.referenceAssetIds] })),
      eligibleReps: this.reps().map(rep => ({ id: rep.id, name: rep.name })),
      fixtureNotice: !this.seedFixtures ? 'Private Marketing pilot. Live publishing is OFF.' : this.store ? 'Business records include synthetic fixtures. Marketing drafts and files are saved locally; Reset demo resets invoice/payment fixtures only.' : fixtureNotice,
      imageGeneration: { mode: this.generator.mode, ready: this.generator.ready, model: this.generator.model, quality: this.generator.quality, message: this.generator.message,
        remainingAttempts: Math.max(0, 10 - this.attemptsToday()), maxDailyAttempts: 10, persistent: !!this.store },
    };
  }

  updateBrandKit(actor: Identity, brandId: string, input: BrandKitInput) {
    this.require(actor, 'campaign:write'); this.brand(brandId);
    const kit = this.brandKits.find(candidate => candidate.brandId === brandId)!;
    if (input.expectedRevision !== kit.revision) throw new ApiError(409, 'This brand kit changed. Refresh the kit before saving to avoid overwriting another edit.');
    const defaults = [...new Set(input.defaultReferenceIds)];
    if (defaults.length > 4) throw new ApiError(400, 'Choose at most four default reference images.');
    for (const id of new Set([...defaults, ...Object.keys(input.referenceCategories)])) {
      const asset = this.assets.find(candidate => candidate.id === id && candidate.brandId === brandId && candidate.organizationId === actor.organizationId && candidate.kind === 'reference');
      if (!asset) throw new ApiError(400, 'Brand references must belong to this brand and organization.');
    }
    const { expectedRevision: _, ...fields } = input;
    Object.assign(kit, structuredClone(fields), { defaultReferenceIds: defaults, revision: kit.revision + 1, updatedBy: actor.id, updatedAt: new Date().toISOString() });
    this.persist(); return structuredClone(kit);
  }

  private brandPrompt(kit: BrandKit, prompt: string, references: string[]) {
    const lines = [
      'CREATIVE BRIEF:', prompt,
      'Apply the following saved brand direction to the brief. Keep this direction when visual preferences conflict.',
      `BRAND DIRECTION: ${this.brand(kit.brandId).name} (kit revision ${kit.revision})`,
      ...([['Image type', kit.imageType], ['Visual style', kit.visualStyle], ['Palette', kit.palette], ['Typography and layout', kit.typography], ['Logo and packaging rules', kit.logoRules], ['Avoid', kit.avoid], ['Additional guidelines', kit.guidelines]] as const).filter(([, value]) => value.trim()).map(([label, value]) => `${label}: ${value}`),
      ...(kit.brandBibleMarkdown ? ['WRITTEN BRAND BIBLE:', kit.brandBibleMarkdown] : []),
      ...(references.length ? ['REFERENCE ORDER:', ...references.map((id, index) => `Image ${index + 1}: ${this.asset(id).title} (${kit.referenceCategories[id] ?? 'other'} reference).`), 'Use style and brand-bible references for visual direction; use logo and product references to preserve brand identity. Do not turn guide-page layouts into the final composition unless requested.'] : []),
    ];
    return lines.join('\n');
  }

  createCampaign(actor: Identity, input: CampaignInput) {
    this.require(actor, 'campaign:write');
    this.brand(input.brandId);
    const campaign: Campaign = { id: `campaign-${randomUUID()}`, organizationId: this.organizationId, ...input, createdBy: actor.id, createdAt: new Date().toISOString() };
    this.campaigns.push(campaign);
    this.persist(); return { ...campaign };
  }

  createContent(actor: Identity, input: ContentInput) {
    this.require(actor, 'campaign:write');
    const campaign = this.campaign(input.campaignId);
    this.validateLinkedVersion(input.linkedAssetId, input.linkedVersionId, campaign.brandId);
    this.validateDestination(input, campaign.brandId);
    const item: ContentItem = {
      id: `content-${randomUUID()}`, organizationId: this.organizationId, ...input, campaignId: campaign.id, brandId: campaign.brandId,
      status: 'draft', createdBy: actor.id, editedBy: actor.id, approvedBy: null, approvedAt: null,
      approvalSnapshot: null, reviewNote: null, scheduledAt: null,
    };
    this.content.push(item);
    this.persist(); return { ...item };
  }

  updateContent(actor: Identity, id: string, input: ContentInput) {
    this.require(actor, 'campaign:write');
    const item = this.contentItem(id);
    const campaign = this.campaign(input.campaignId);
    this.validateLinkedVersion(input.linkedAssetId, input.linkedVersionId, campaign.brandId);
    this.validateDestination(input, campaign.brandId);
    this.publishingQueue.blockEdit(id);
    Object.assign(item, input, { editedBy: actor.id, campaignId: campaign.id, brandId: campaign.brandId, status: 'draft',
      approvedBy: null, approvedAt: null, approvalSnapshot: null, reviewNote: null, scheduledAt: null });
    this.persist(); return { ...item };
  }

  submitContent(actor: Identity, id: string) {
    this.require(actor, 'campaign:write');
    const item = this.contentItem(id);
    if (item.status !== 'draft') throw new ApiError(409, 'Only draft content can be submitted.');
    item.status = 'in_review';
    item.reviewNote = null;
    this.persist(); return { ...item };
  }

  reviewContent(actor: Identity, id: string, decision: 'approve' | 'return', notes: string) {
    this.require(actor, 'asset:review');
    const item = this.contentItem(id);
    this.validateDestination(item, item.brandId);
    if (item.status !== 'in_review') throw new ApiError(409, 'Content must be in review.');
    if (actor.id === item.createdBy || actor.id === item.editedBy) throw new ApiError(403, 'Self-approval is disabled in this local demo.');
    item.reviewNote = notes.trim() || null;
    if (decision === 'return') {
      item.status = 'draft'; item.approvedBy = null; item.approvedAt = null; item.approvalSnapshot = null;
    } else {
      item.status = 'approved'; item.approvedBy = actor.id; item.approvedAt = new Date().toISOString();
      item.approvalSnapshot = this.contentSnapshot(item);
    }
    this.persist(); return { ...item };
  }

  async scheduleContent(actor: Identity, id: string) {
    this.require(actor, 'campaign:write');
    const item = this.contentItem(id);
    this.validateDestination(item, item.brandId);
    if (item.status !== 'approved' || item.approvalSnapshot !== this.contentSnapshot(item))
      throw new ApiError(409, 'Content needs current approval before it can be scheduled.');
    this.validateLinkedVersion(item.linkedAssetId, item.linkedVersionId, item.brandId);
    if (item.destinationAccountId) {
      const bytes = await this.socialImage(actor, id);
      if (item.status !== 'approved' || item.approvalSnapshot !== this.contentSnapshot(item)) throw new ApiError(409, 'Content changed; renew approval.');
      const account = this.socialAccounts.find(account => account.id === item.destinationAccountId)!;
      this.publishingQueue.enqueue({ contentId: item.id, organizationId: this.organizationId, account: structuredClone(account), caption: item.caption, publishAt: item.plannedAt, aiGenerated: this.version(item.linkedVersionId!).sourceType === 'generated_artwork', versionId: item.linkedVersionId!, imageHash: createHash('sha256').update(bytes).digest('hex'), approvalSnapshot: item.approvalSnapshot!, approvedBy: item.approvedBy!, approvedAt: item.approvedAt! }, bytes, new Date().toISOString());
    }
    item.status = 'scheduled'; item.scheduledAt = new Date().toISOString();
    this.persist(); return { ...item };
  }

  createGeneration(actor: Identity, input: GenerationInput) {
    this.require(actor, 'creative:generate');
    const fingerprint = createHash('sha256').update(JSON.stringify([input.brandId, input.campaignId, input.prompt, input.referenceAssetIds, input.width, input.height, input.assetId ?? null, input.simulateTransientError])).digest('hex');
    const previous = this.jobs.find(job => job.requestKey === input.requestKey && job.createdBy === actor.id);
    if (previous) { if (previous.fingerprint !== fingerprint) throw new ApiError(409, 'This request key was already used with different generation settings.'); return { ...previous }; }
    this.requireGenerationCapacity();
    if (input.simulateTransientError && this.generator.mode !== 'test') throw new ApiError(400, 'Simulation is available in isolated tests only.');
    const campaign = this.campaign(input.campaignId);
    if (campaign.brandId !== input.brandId) throw new ApiError(400, 'Campaign and brand must match.');
    const kit = structuredClone(this.brandKits.find(candidate => candidate.brandId === input.brandId)!);
    const references = [...new Set([...kit.defaultReferenceIds, ...input.referenceAssetIds])];
    if (references.length > 4) throw new ApiError(400, 'Brand defaults plus extra references exceed four images. Remove an extra reference or update the brand kit.');
    for (const referenceId of references) {
      const reference = this.asset(referenceId);
      if (reference.kind !== 'reference' || reference.brandId !== input.brandId) throw new ApiError(400, 'References must be original files from this brand.');
    }
    let asset: MarketingAsset;
    if (input.assetId) {
      asset = this.asset(input.assetId);
      if (asset.kind !== 'creative' || asset.brandId !== input.brandId || asset.campaignId !== campaign.id) throw new ApiError(400, 'A variation must remain in the same brand and campaign.');
    } else {
      asset = this.newAsset({ brandId: input.brandId, kind: 'creative', title: 'Creative \u00b7 ' + campaign.title, campaignId: campaign.id,
        productSku: null, batchId: null, restrictedAccountId: null, createdBy: actor.id, sourceType: 'generated_artwork' });
      this.assets.push(asset);
    }
    const now = new Date().toISOString();
    const job: GenerationJob = { id: 'generation-' + randomUUID(), organizationId: this.organizationId, assetId: asset.id, versionId: null,
      campaignId: campaign.id, prompt: input.prompt.trim(), referenceAssetIds: references, width: input.width, height: input.height,
      status: 'running', error: null, attempts: 1, createdBy: actor.id, createdAt: now, requestKey: input.requestKey,
      fingerprint, retryKeys: [], retryable: false, outcomeUnknown: false, model: this.generator.model, quality: this.generator.quality,
      providerSize: null, providerRequestId: null, usage: null, attemptDates: [now], brandKitSnapshot: kit, effectivePrompt: this.brandPrompt(kit, input.prompt.trim(), references) };
    this.jobs.unshift(job); this.persist();
    if (input.simulateTransientError) { job.status = 'failed'; job.retryable = true; job.error = 'Isolated test provider error. Retry to continue.'; this.persist(); }
    else void this.executeGeneration(job, asset);
    return { ...job };
  }

  retryGeneration(actor: Identity, id: string, requestKey: string) {
    this.require(actor, 'creative:generate');
    const job = this.jobs.find(candidate => candidate.id === id && candidate.createdBy === actor.id);
    if (!job) throw new ApiError(404, 'Generation job not found.');
    if (job.retryKeys.includes(requestKey) || job.status === 'succeeded') return { ...job };
    if (job.status === 'running') return { ...job };
    if (!job.retryable || job.outcomeUnknown) throw new ApiError(409, 'This request cannot be retried safely. Check its outcome before creating a new image.');
    if (job.attempts >= 3) throw new ApiError(429, 'This image has reached its limit of three attempts.');
    if (job.model !== this.generator.model || job.quality !== this.generator.quality) throw new ApiError(409, 'Image model settings changed. Start a new generation instead of changing this job.');
    this.requireGenerationCapacity();
    job.retryKeys.push(requestKey); job.attempts++; job.attemptDates.push(new Date().toISOString());
    job.status = 'running'; job.error = null; job.retryable = false; this.persist();
    void this.executeGeneration(job, this.asset(job.assetId));
    return { ...job };
  }

  private async executeGeneration(job: GenerationJob, asset: MarketingAsset) {
    try {
      const references = job.referenceAssetIds.map(id => {
        const reference = this.asset(id); const version = reference.versions.at(-1)!; const file = this.files.get(version.id)!;
        return { body: Buffer.from(file.body), mimeType: file.mimeType };
      });
      const image = await this.generator.generate({ prompt: job.effectivePrompt ?? job.prompt, width: job.width, height: job.height, references, requestKey: job.retryKeys.at(-1) ?? job.requestKey });
      // An ephemeral reset may have discarded an in-flight test job.
      if (!this.jobs.includes(job)) return;
      this.completeGeneration(job, asset, image); job.status = 'succeeded';
    } catch (error) {
      job.status = 'failed';
      job.error = error instanceof ImageGenerationError ? error.message : 'Image generation failed without a confirmed saved result. Check usage before starting another image.';
      job.retryable = error instanceof ImageGenerationError && error.retryable;
      job.outcomeUnknown = !(error instanceof ImageGenerationError) || error.outcomeUnknown;
    }
    try { this.persist(); } catch { job.error = 'The local store could not save this job. Keep the API running and download any completed image before restarting.'; }
  }

  async uploadReference(actor: Identity, input: { brandId: string; title: string; base64: string }) {
    this.require(actor, 'creative:generate'); this.brand(input.brandId);
    const bytes = Buffer.from(input.base64, 'base64');
    if (bytes.length > 5_000_000) throw new ApiError(413, 'Reference images must be at most 5 MB.');
    let metadata;
    try { metadata = await sharp(bytes, { limitInputPixels: 24_000_000 }).metadata(); }
    catch { throw new ApiError(400, 'Upload a valid PNG, JPEG or WebP image.'); }
    if (!['png', 'jpeg', 'webp'].includes(metadata.format ?? '') || metadata.pages && metadata.pages > 1) throw new ApiError(400, 'Upload a single PNG, JPEG or WebP image.');
    // Decode once to reject truncated payloads, but retain the uploaded original
    // bytes. The provider adapter converts a separate copy for image input.
    try { await sharp(bytes, { limitInputPixels: 24_000_000 }).stats(); }
    catch { throw new ApiError(400, 'Upload a complete PNG, JPEG or WebP image.'); }
    const mimeType = `image/${metadata.format}`;
    const asset = this.newAsset({ brandId: input.brandId, kind: 'reference', title: input.title, campaignId: null, productSku: null,
      batchId: null, restrictedAccountId: null, createdBy: actor.id, sourceType: 'original_reference' });
    const version: AssetVersion = { id: 'version-' + randomUUID(), organizationId: this.organizationId, assetId: asset.id, number: 1, status: 'draft', mimeType,
      width: metadata.width ?? null, height: metadata.height ?? null, createdBy: actor.id, createdAt: new Date().toISOString(),
      reviewedBy: null, reviewedAt: null, reviewNote: null, provenance: 'User-uploaded original reference; original bytes retained. Not an approved sales asset.', sourceType: 'original_reference' };
    asset.versions.push(version); this.assets.push(asset);
    this.files.set(version.id, { body: bytes, mimeType, fileName: 'reference-' + asset.id + '.' + metadata.format });
    this.persist(); return { ...asset };
  }

  submitVersion(actor: Identity, id: string) {
    this.require(actor, 'campaign:write');
    const version = this.version(id);
    if (version.createdBy !== actor.id) throw new ApiError(404, 'Asset version not found.');
    if (version.status !== 'draft') throw new ApiError(409, 'Only a draft version can be submitted.');
    version.status = 'in_review';
    this.persist(); return { ...version };
  }

  reviewVersion(actor: Identity, id: string, decision: 'approve' | 'return', notes: string) {
    this.require(actor, 'asset:review');
    const version = this.version(id);
    if (version.status !== 'in_review') throw new ApiError(409, 'Asset version must be in review.');
    if (actor.id === version.createdBy) throw new ApiError(403, 'Self-approval is disabled in this local demo.');
    version.reviewedBy = actor.id; version.reviewedAt = new Date().toISOString(); version.reviewNote = notes.trim() || null;
    version.status = decision === 'approve' ? 'approved' : 'draft';
    this.persist(); return { ...version };
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
      id: `publication-${randomUUID()}`, organizationId: this.organizationId, assetId: asset.id, versionId: id,
      audienceMode, repIds: selected, status: 'published', publishedBy: actor.id,
      publishedAt: new Date().toISOString(), retiredBy: null, retiredAt: null, retireReason: null,
    };
    asset.publications.push(publication);
    this.persist(); return { ...publication, repIds: [...publication.repIds] };
  }

  retirePublication(actor: Identity, id: string, reason: string) {
    this.require(actor, 'asset:publish');
    const publication = this.publication(id);
    if (publication.status === 'retired') return { ...publication, repIds: [...publication.repIds] };
    publication.status = 'retired'; publication.retiredBy = actor.id;
    publication.retiredAt = new Date().toISOString(); publication.retireReason = reason.trim();
    this.persist(); return { ...publication, repIds: [...publication.repIds] };
  }

  publishedAssets(actor: Identity): SalesAssetView[] {
    if (actor.organizationId !== this.organizationId) throw new ApiError(403, 'Asset access is not available in this organization.');
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

  private completeGeneration(job: GenerationJob, asset: MarketingAsset, image: GeneratedImage) {
    const number = Math.max(0, ...asset.versions.map(version => version.number)) + 1;
    const id = 'version-' + randomUUID();
    const version: AssetVersion = { id, organizationId: this.organizationId, assetId: asset.id, number, status: 'draft', mimeType: 'image/png',
      width: image.width, height: image.height, createdBy: job.createdBy, createdAt: new Date().toISOString(),
      reviewedBy: null, reviewedAt: null, reviewNote: null,
      provenance: (this.generator.mode === 'test' ? 'Isolated test PNG' : 'OpenAI image generation') + ' / ' + job.model + ' / ' + job.quality + '; original ' + image.providerSize + '; fitted without cropping to ' + image.width + 'x' + image.height + '.', sourceType: 'generated_artwork' };
    asset.versions.push(version); job.versionId = id; job.providerSize = image.providerSize; job.providerRequestId = image.requestId; job.usage = image.usage;
    this.files.set(id, { mimeType: 'image/png', body: image.body, fileName: 'artwork-v' + number + '.png' });
  }

  private newAsset(input: Pick<MarketingAsset, 'brandId' | 'kind' | 'title' | 'campaignId' | 'productSku' | 'batchId' | 'restrictedAccountId' | 'createdBy' | 'sourceType'>): MarketingAsset {
    return { id: `asset-${randomUUID()}`, organizationId: this.organizationId, brandId: input.brandId, kind: input.kind, title: input.title,
      campaignId: input.campaignId, productSku: input.productSku, batchId: input.batchId,
      restrictedAccountId: input.restrictedAccountId, createdBy: input.createdBy, sourceType: input.sourceType,
      versions: [], publications: [] };
  }

  private seed() {
    const now = new Date().toISOString();
    const campaign: Campaign = { id: 'campaign-cheddr-launch', organizationId: this.organizationId, brandId: 'cheddr', title: 'Cheddr autumn launch', objective: 'Introduce the seasonal wholesale collection.', owner: 'Cheddr Marketing', createdBy: 'marketing', createdAt: now };
    this.campaigns.push(campaign);
    const scheduled: ContentItem = {
      id: 'content-scheduled-sample', organizationId: this.organizationId, campaignId: campaign.id, brandId: campaign.brandId,
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
      mimeType: 'image/svg+xml', body: fixtureArtwork('Cheddr', 'Autumn collection preview', 1080, 1350, 1), fileName: 'cheddr-autumn-v1.svg', provenance: 'Seeded approved campaign creative; sample data.' });
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
    const version: AssetVersion = { id: `version-${randomUUID()}`, organizationId: this.organizationId, assetId: asset.id, number: 1,
      status: 'approved', mimeType: input.mimeType, width: input.kind === 'creative' ? 1080 : null,
      height: input.kind === 'creative' ? 1350 : null, createdBy: input.createdBy, createdAt: new Date().toISOString(),
      reviewedBy: 'owner', reviewedAt: new Date().toISOString(), reviewNote: 'Approved sample fixture.',
      provenance: input.provenance, sourceType: input.sourceType };
    asset.versions.push(version); this.assets.push(asset);
    this.files.set(version.id, { mimeType: input.mimeType, body: input.body, fileName: input.fileName });
    return asset;
  }

  private publishSeed(asset: MarketingAsset, audienceMode: 'all' | 'selected', repIds: string[]) {
    asset.publications.push({ id: `publication-${randomUUID()}`, organizationId: this.organizationId, assetId: asset.id,
      versionId: asset.versions[0].id, audienceMode, repIds: audienceMode === 'all' ? this.reps(asset).map(rep => rep.id).sort() : repIds, status: 'published', publishedBy: 'owner',
      publishedAt: new Date().toISOString(), retiredBy: null, retiredAt: null, retireReason: null });
  }

  private validateDestination(input: ContentInput, brandId: string) {
    if (!input.destinationAccountId) return;
    const account = this.socialAccounts.find(account => account.id === input.destinationAccountId && account.brandId === brandId && account.connected);
    if (!account || input.destinationAccount !== account.handle || input.channel !== (account.platform === 'x' ? 'X' : 'Instagram')) throw new ApiError(400, 'Select a connected account matching the brand, platform and exact handle.');
    if (!input.linkedVersionId || !input.linkedAssetId) throw new ApiError(400, 'Single-image publishing requires an approved creative.');
    const version = this.version(input.linkedVersionId);
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(version.mimeType)) throw new ApiError(400, 'Use an approved raster creative for social publishing.');
    const ratio = (version.width ?? 0) / (version.height ?? 1);
    if (account.platform === 'instagram' && (ratio < 0.8 || ratio > 1.91 || (version.width ?? 0) < 320)) throw new ApiError(400, 'This Instagram feed pilot accepts images at least 320 pixels wide, from 4:5 through 1.91:1. No cropping is performed.');
    if (account.platform === 'instagram' && [...input.caption].length > 2200 || account.platform === 'x' && Buffer.byteLength(input.caption, 'utf8') > 280) throw new ApiError(400, 'Caption exceeds this pilot limit: Instagram 2,200 characters; X 280 UTF-8 bytes (conservative).');
  }
  async socialImage(actor: Identity, id: string) {
    this.require(actor, 'workspace:read'); const item = this.contentItem(id);
    this.validateLinkedVersion(item.linkedAssetId, item.linkedVersionId, item.brandId);
    if (!item.linkedVersionId) throw new ApiError(409, 'Link an approved image first.');
    const frozen = this.publishingQueue.list().find(job => job.payload.contentId === id && job.payload.approvalSnapshot === item.approvalSnapshot && job.payload.approvedAt === item.approvedAt);
    if (frozen) return this.publishingQueue.image(frozen.id);
    const file = this.files.get(item.linkedVersionId)!;
    const image = await sharp(file.body).rotate().resize({ width: 1440, withoutEnlargement: true }).flatten({ background: '#ffffff' }).toColourspace('srgb').jpeg({ quality: 95 }).toBuffer();
    if (image.length > 5_000_000) throw new ApiError(400, 'Prepared image exceeds this pilot\'s 5 MB limit.'); return image;
  }
  async proposeSocial(actor: Identity, brandId: string, brief: string, platform: string) {
    this.require(actor, 'campaign:write'); this.brand(brandId);
    const kit = this.brandKits.find(kit => kit.brandId === brandId)!;
    return this.drafter.propose({ brief, platform, earliest: new Date().toISOString(), brandDirection: JSON.stringify(kit) });
  }
  async authorizePublishing(actor: Identity, id: string, fingerprint: string, account?: SocialAccount | null | (() => SocialAccount | null)) {
    this.require(actor, 'workspace:read'); this.require(actor, 'asset:publish'); this.require(actor, 'asset:review');
    const job = this.publishingQueue.get(id), item = this.contentItem(job.payload.contentId);
    const currentAccount = () => typeof account === 'function' ? account() : account === undefined ? this.socialAccounts.find(a => a.id === job.payload.account.id) ?? null : account;
    const validate = () => {
    assertPublishingAuthority(job, actor, currentAccount());
    if (!['scheduled', 'publishing'].includes(this.publishingQueue.get(id).state) || publishingFingerprint(this.publishingQueue.get(id)) !== fingerprint || item.status !== 'scheduled' ||
      item.caption !== job.payload.caption || item.plannedAt !== job.payload.publishAt || item.linkedVersionId !== job.payload.versionId || item.destinationAccountId !== job.payload.account.id || item.destinationAccount !== job.payload.account.handle ||
      item.approvalSnapshot !== job.payload.approvalSnapshot || item.approvedAt !== job.payload.approvedAt || item.approvedBy !== job.payload.approvedBy || item.approvalSnapshot !== this.contentSnapshot(item))
      throw new PublishingHold('Current approval or job payload no longer matches. Hold for review.');
    this.validateLinkedVersion(item.linkedAssetId, item.linkedVersionId, item.brandId);
    }; validate();
    const original = this.files.get(item.linkedVersionId!)!;
    const jpeg = await sharp(original.body).rotate().resize({ width: 1440, withoutEnlargement: true }).flatten({ background: '#ffffff' }).toColourspace('srgb').jpeg({ quality: 95 }).toBuffer();
    if (createHash('sha256').update(jpeg).digest('hex') !== job.payload.imageHash) throw new PublishingHold('Queued image differs from the approved creative.');
    validate();
    return { fingerprint };
  }
  cancelSocial(actor: Identity, id: string) { this.require(actor, 'campaign:write'); if (this.publishingQueue.get(id).payload.organizationId !== actor.organizationId) throw new ApiError(404, 'Job not found.'); return this.publishingQueue.cancel(id, actor.id); }
  markSocialPosted(actor: Identity, contentId: string, url: string, at: string, confirmExisting = false) {
    this.require(actor, confirmExisting ? 'asset:review' : 'campaign:write'); const item = this.contentItem(contentId);
    if (!item.approvedBy || item.approvalSnapshot !== this.contentSnapshot(item)) throw new ApiError(409, 'Current exact content approval is required.');
    const account = this.socialAccounts.find(account => account.id === item.destinationAccountId);
    if (!account) throw new ApiError(409, 'Select and approve a connected destination first.');
    const parsed = new URL(url);
    const valid = account.platform === 'x' ? /^\/(?:i|[A-Za-z0-9_]+)\/status\/\d+\/?$/.test(parsed.pathname) && ['x.com', 'www.x.com', 'twitter.com'].includes(parsed.hostname) : /^\/p\/[A-Za-z0-9_-]+\/?$/.test(parsed.pathname) && ['instagram.com', 'www.instagram.com'].includes(parsed.hostname);
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password || !valid || !Number.isFinite(Date.parse(at)) || Date.parse(at) > Date.now() + 60_000) throw new ApiError(400, 'Enter an actual platform post URL and posting time, not a future date.');
    const job = this.publishingQueue.list().find(job => job.payload.contentId === contentId && job.payload.approvalSnapshot === item.approvalSnapshot && job.payload.approvedAt === item.approvedAt);
    if (!job) throw new ApiError(409, 'Schedule the approved entry first. Cancel its queued send before posting manually.');
    if (confirmExisting) return this.publishingQueue.confirmExisting(job.id, actor.id, parsed.href, at);
    if (job.state === 'scheduled') throw new ApiError(409, 'Cancel the queued API send before posting manually.');
    return this.publishingQueue.manual(job.id, actor.id, parsed.href, at);
  }
  private contentSnapshot(item: ContentItem) {
    const account = this.socialAccounts.find(account => account.id === item.destinationAccountId);
    const bytes = item.linkedVersionId ? this.files.get(item.linkedVersionId)?.body : null;
    return JSON.stringify([item.destinationAccountId ?? null, account ?? null, bytes ? createHash('sha256').update(bytes).digest('hex') : null, item.campaignId, item.brandId, item.title, item.objective, item.owner, item.channel,
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
