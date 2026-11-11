import { useEffect, useRef, useState } from 'react';
import type { AssetPublication, ContentItem, GenerationJob, MarketingAsset, MarketingWorkspaceData, SalesAssetView } from '../shared/contracts';
import { MarketingIcon, type MarketingSection } from './MarketingNavigation';
import './marketing-design.css';
import { ProtectedImage, ProtectedDocument, DownloadButton } from './AssetFiles';
import { SocialPosting, SocialDraftControls } from './SocialPosting';
import { BrandKitSettings } from './BrandKitSettings';

const pacific = (value: string) => new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Los_Angeles', dateStyle: 'medium', timeStyle: 'short',
}).format(new Date(value)) + ' PT';
function pacificInput(value = new Date().toISOString()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(value));
  const part = (type: string) => parts.find(item => item.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}T${part('hour')}:${part('minute')}`;
}
function fromPacificInput(value: string) {
  const [date, time] = value.split('T');
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  const target = Date.UTC(year, month - 1, day, hour, minute);
  let result = target;
  for (let attempt = 0; attempt < 3; attempt++) {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(result));
    const part = (type: string) => Number(parts.find(item => item.type === type)?.value);
    const represented = Date.UTC(part('year'), part('month') - 1, part('day'), part('hour'), part('minute'));
    result += target - represented;
  }
  if (pacificInput(new Date(result).toISOString()) !== value) throw new Error('This Pacific time does not exist because of daylight saving time. Choose another time.');
  return new Date(result).toISOString();
}
const statusLabel = (value: string) => value.replaceAll('_', ' ');

export function MarketingWorkspace({ identity, section, setSection }: { identity: string; section: MarketingSection; setSection: (section: MarketingSection) => void }) {
  const [data, setData] = useState<MarketingWorkspaceData | null>(null);
  const [brandId, setBrandId] = useState('all');
  const [channelFilter, setChannelFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [reviewNotes, setReviewNotes] = useState('');
  const generation = useRef(0);
  async function api<T>(path: string, method = 'GET', payload?: unknown): Promise<T> {
    const response = await fetch(`/api${path}`, {
      method,
      headers: { 'X-Demo-Identity': identity, ...(payload === undefined ? {} : { 'Content-Type': 'application/json' }) },
      ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error ?? 'Request failed.');
    return result;
  }
  async function reload(version = generation.current) {
    const next = await api<MarketingWorkspaceData>('/marketing/workspace');
    if (generation.current === version) setData(next);
  }
  useEffect(() => {
    const version = ++generation.current;
    setData(null); setError(''); setNotice('');
    reload(version).catch(reason => { if (generation.current === version) setError(String(reason.message)); });
    return () => { generation.current++; };
  }, [identity]);
  const hasRunningJob = (data?.generationJobs.some(job => job.status === 'running') ?? false) || (data?.publishingJobs.some(job => ['scheduled', 'publishing'].includes(job.state)) ?? false);
  useEffect(() => {
    if (!hasRunningJob) return;
    const version = generation.current;
    const timer = window.setInterval(() => { void reload(version).catch(() => { if (generation.current === version) setError('Could not refresh image status. Reopen the workspace to check the existing job; do not submit it again.'); }); }, 1500);
    return () => window.clearInterval(timer);
  }, [identity, hasRunningJob]);
  async function act<T = unknown>(path: string, message: string, payload?: unknown, method = 'POST'): Promise<T | undefined> {
    setBusy(true); setError(''); setNotice('');
    const version = generation.current;
    try { const result = await api<T>(path, method, payload); await reload(version); if (generation.current === version) setNotice(message); return result; }
    catch (reason) { if (generation.current === version) setError(reason instanceof Error ? reason.message : 'Request failed.'); }
    finally { if (generation.current === version) setBusy(false); }
  }

  if (!data) return <section className="marketing-page" aria-live="polite">
    {error ? <div className="alert error" role="alert"><strong>Marketing workspace unavailable</strong><br/>{error}</div> : <p role="status">Loading marketing workspace…</p>}
    {error && <button className="secondary" onClick={() => { setError(''); void reload().catch(reason => setError(String(reason.message))); }}>Retry</button>}
  </section>;

  const content = data.content.filter(item => brandId === 'all' || item.brandId === brandId);
  const assets = data.assets.filter(asset => brandId === 'all' || asset.brandId === brandId);
  const draftsToReview = content.filter(item => item.status === 'in_review').length + assets.reduce((count, asset) => count + asset.versions.filter(version => version.status === 'in_review').length, 0);
  const upcoming = content.filter(item => item.status === 'scheduled').sort((a, b) => a.plannedAt.localeCompare(b.plannedAt));
  const published = assets.flatMap(asset => asset.publications.filter(publication => publication.status === 'published').map(publication => ({ asset, publication }))).sort((a, b) => b.publication.publishedAt.localeCompare(a.publication.publishedAt));
  const campaigns = data.campaigns.filter(campaign => brandId === 'all' || campaign.brandId === brandId);
  const creativeToReview = assets.flatMap(asset => asset.versions.filter(version => version.status === 'in_review').map(version => ({ asset, version })));

  const filteredData = { ...data, content, assets, campaigns };
  const page = {
    home: { title: 'Marketing overview', description: 'Your campaigns, creative and next steps. All in view.', number: '01' },
    calendar: { title: 'Content calendar', description: 'Turn the campaign brief into a clear plan.', number: '02' },
    studio: { title: 'Image studio', description: 'A dedicated space to shape your next creative.', number: '03' },
    review: { title: 'Review & approval', description: 'The right version. The right message. Your decision.', number: '04' },
    assets: { title: 'Sales assets', description: 'Approved material, ready for the people who need it.', number: '05' },
    brands: { title: 'Brand kits', description: 'One home for the look, feel and details that make each brand yours.', number: '06' },
  }[section];
  return <section className="marketing-page" id="marketing-panel" role="tabpanel" aria-labelledby={`marketing-nav-${section}`} tabIndex={-1}>
    <div className="workspace-context"><span><i/>LOCAL PREVIEW</span><time>{new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }).format(new Date())}<span className="context-timezone"> · Pacific time</span></time></div>
    <div className="marketing-heading">
      <div><span className="eyebrow">DIZZLE / MARKETING <span className="section-number">{page.number}</span></span><h1>{page.title}</h1><p>{page.description}</p></div>
      {section !== 'studio' && section !== 'brands' && <label className="brand-filter">WORKING ACROSS<select aria-label="Brand filter" value={brandId} onChange={event => setBrandId(event.target.value)}><option value="all">All brands</option>{data.brands.map(brand => <option key={brand.id} value={brand.id}>{brand.name}</option>)}</select></label>}
    </div>
    {error && <div className="alert error" role="alert">{error}</div>}
    {notice && <div className="alert success" role="status">{notice}</div>}
    {section === 'home' && <div className="marketing-home">
      <div className="marketing-metrics">
        <button onClick={() => setSection('calendar')}><span><MarketingIcon name="calendar"/>On the calendar</span><strong>{String(upcoming.length).padStart(2, '0')}</strong><small>Scheduled content <MarketingIcon name="arrow"/></small></button>
        <button onClick={() => setSection('review')}><span><MarketingIcon name="review"/>Ready for review</span><strong>{String(draftsToReview).padStart(2, '0')}</strong><small>Content & creative <MarketingIcon name="arrow"/></small></button>
        <button onClick={() => setSection('assets')}><span><MarketingIcon name="assets"/>Published assets</span><strong>{String(published.length).padStart(2, '0')}</strong><small>Available to eligible reps <MarketingIcon name="arrow"/></small></button>
      </div>
      <div className="creative-launch"><div className="launch-emblem"><MarketingIcon name="studio"/></div><div><span className="eyebrow">FROM IDEA TO APPROVED</span><h2>Give your next campaign a head start.</h2><p>Build a content plan or start with the creative.</p></div><div className="launch-actions"><button className="primary" onClick={() => setSection('studio')}>Create artwork <MarketingIcon name="arrow"/></button><button className="text-action" onClick={() => setSection('calendar')}>Plan content</button></div></div>
      <div className="marketing-columns">
        <section className="marketing-block"><div className="block-heading"><div><span className="eyebrow">NEXT UP</span><h2>Upcoming content</h2></div><button className="text-action" onClick={() => setSection('calendar')}>Open calendar</button></div>
          {upcoming.slice(0, 4).map(item => <ContentRow key={item.id} item={item} brand={data.brands.find(brand => brand.id === item.brandId)?.name ?? ''} campaign={data.campaigns.find(campaign => campaign.id === item.campaignId)?.title ?? ''}/>)}
          {!upcoming.length && <p className="empty-inline">Nothing scheduled yet.</p>}
        </section>
        <section className="marketing-block"><div className="block-heading"><div><span className="eyebrow">REVIEW QUEUE</span><h2>Needs a decision</h2></div><button className="text-action" onClick={() => setSection('review')}>Open review</button></div>
          {content.filter(item => item.status === 'in_review').slice(0, 3).map(item => <ContentRow key={item.id} item={item} brand={data.brands.find(brand => brand.id === item.brandId)?.name ?? ''} campaign={data.campaigns.find(campaign => campaign.id === item.campaignId)?.title ?? ''}/>)}
          {creativeToReview.slice(0, 2).map(({ asset, version }) => <button className="review-preview-link" key={version.id} onClick={() => setSection('review')}><MarketingIcon name="studio"/><span>{asset.title}<small>Creative · version {version.number}</small></span><MarketingIcon name="arrow"/></button>)}
          {content.filter(item => item.status === 'in_review').length + creativeToReview.length === 0 && <div className="review-clear"><MarketingIcon name="review"/><strong>No content waiting for review.</strong><p>Submitted content and creative appear here.</p><button className="text-action" onClick={() => setSection('review')}>View review queue <MarketingIcon name="arrow"/></button></div>}
        </section>
      </div>
      <section className="marketing-block"><div className="block-heading"><div><span className="eyebrow">RECENTLY PUBLISHED</span><h2>Sales Assets</h2></div><button className="text-action" onClick={() => setSection('assets')}>View all</button></div>
        <AssetRows assets={[...new Map(published.map(entry => [entry.asset.id, entry.asset])).values()].slice(0, 4)} data={data} identity={identity} api={api} act={act}/>
      </section>
    </div>}
    {section === 'calendar' && <CalendarView data={filteredData} campaigns={campaigns} content={content} channelFilter={channelFilter} statusFilter={statusFilter} setChannelFilter={setChannelFilter} setStatusFilter={setStatusFilter} busy={busy} act={act} api={api} identity={identity}/>}
    {section === 'studio' && <StudioView data={data} busy={busy} act={act} api={api} identity={identity}/>}
    {section === 'review' && <ReviewView data={filteredData} notes={reviewNotes} setNotes={setReviewNotes} busy={busy} act={act} setSection={setSection} identity={identity}/>}
    {section === 'brands' && <BrandKitSettings data={data} identity={identity} busy={busy} act={act}/>}
    {section === 'assets' && <AssetsView data={filteredData} busy={busy} act={act} api={api} identity={identity}/>}
    <details className="workspace-disclosure"><summary>Sample workspace <span>Internal planning & publishing only</span></summary><p>{data.fixtureNotice} Demo review rule: no self-approval; Owner reviews and publishes. All audiences are recipient snapshots.</p></details>
  </section>;
}

function ContentRow({ item, brand, campaign }: { item: ContentItem; brand: string; campaign: string }) {
  return <article className="content-row"><div><strong>{item.title}</strong><small>{brand} · {campaign} · {item.channel} · {item.destinationAccount}</small></div><span className={`status-mark status-${item.status}`}>{statusLabel(item.status)}</span><time>{pacific(item.plannedAt)}</time></article>;
}

function CalendarView({ data, campaigns, content, channelFilter, statusFilter, setChannelFilter, setStatusFilter, busy, act, api, identity }: any) {
  const [campaignForm, setCampaignForm] = useState({ brandId: data.brands[0]?.id ?? '', title: '', objective: '', owner: data.identity.name });
  const [itemForm, setItemForm] = useState({ campaignId: campaigns[0]?.id ?? '', title: '', objective: '', owner: data.identity.name, destinationAccountId: '', channel: 'Instagram', plannedAt: pacificInput(), destinationAccount: '', caption: '', linkedAssetId: '', linkedVersionId: '' });
  const [formError, setFormError] = useState('');
  const [newCampaignId, setNewCampaignId] = useState('');
  const [editor, setEditor] = useState<'campaign' | 'content' | null>(null);
  const visible: ContentItem[] = (content as ContentItem[]).filter(item => (channelFilter === 'all' || item.channel === channelFilter) && (statusFilter === 'all' || (data.publishingJobs.find((j: any) => j.payload.contentId === item.id && j.payload.approvalSnapshot === item.approvalSnapshot && j.payload.approvedAt === item.approvedAt)?.state ?? item.status) === statusFilter)).sort((a, b) => a.plannedAt.localeCompare(b.plannedAt));
  const groups = visible.reduce<Record<string, ContentItem[]>>((result, item) => {
    const key = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).format(new Date(item.plannedAt));
    (result[key] ??= []).push(item); return result;
  }, {});
  const approvedAssets = data.assets.filter((asset: MarketingAsset) => asset.kind === 'creative' && asset.brandId === data.campaigns.find((campaign: any) => campaign.id === itemForm.campaignId)?.brandId).flatMap((asset: MarketingAsset) => asset.versions.filter(version => version.status === 'approved').map(version => ({ asset, version })));
  async function createCampaign(event: React.FormEvent) {
    event.preventDefault(); setFormError('');
    try { const campaign = await act('/marketing/campaigns', 'Campaign created.', campaignForm) as { id: string } | undefined; if (campaign) { setEditor('content'); setNewCampaignId(campaign.id); setItemForm(form => ({ ...form, campaignId: campaign.id })); } }
    catch (reason) { setFormError(reason instanceof Error ? reason.message : 'Could not create campaign.'); }
  }
  async function submitItem(event: React.FormEvent) {
    event.preventDefault(); setFormError('');
    const { plannedAt, linkedAssetId, linkedVersionId, ...rest } = itemForm;
    try { const created = await act('/marketing/content', 'Content item created as a draft.', { ...rest, destinationAccountId: itemForm.destinationAccountId || null, plannedAt: fromPacificInput(plannedAt), linkedAssetId: linkedAssetId || null, linkedVersionId: linkedVersionId || null }); if (created) { setEditor(null); setItemForm(form => ({ ...form, title: '', objective: '', caption: '' })); } }
    catch (reason) { setFormError(reason instanceof Error ? reason.message : 'Could not create content item.'); }
  }
  const campaignChoices = [...campaigns, ...data.campaigns.filter((campaign: any) => newCampaignId === campaign.id && !campaigns.some((item: any) => item.id === campaign.id))];
  return <div className="calendar-view">
    <div className="calendar-toolbar"><div><span className="eyebrow">PLANNING</span><h2>Calendar & campaigns</h2></div><div className="filters"><label>Channel<select aria-label="Channel filter" value={channelFilter} onChange={event => setChannelFilter(event.target.value)}><option value="all">All channels</option>{['Instagram', 'X', 'Facebook', 'Email', 'SMS', 'Wholesale'].map(channel => <option key={channel}>{channel}</option>)}</select></label><label>Status<select aria-label="Status filter" value={statusFilter} onChange={event => setStatusFilter(event.target.value)}><option value="all">All statuses</option>{['draft', 'in_review', 'approved', 'scheduled', 'publishing', 'published', 'failed', 'needs_review', 'canceled'].map(status => <option key={status} value={status}>{statusLabel(status)}</option>)}</select></label></div></div>
    {formError && <p className="inline-error" role="alert">{formError}</p>}
    <div className="calendar-actions"><p>{visible.length} content item{visible.length === 1 ? '' : 's'} in this view</p><div><button className="secondary" onClick={() => setEditor(editor === 'campaign' ? null : 'campaign')}>New campaign</button><button className="primary" onClick={() => setEditor(editor === 'content' ? null : 'content')}>New content <span aria-hidden="true">+</span></button></div></div>
    {editor && <div className="calendar-editor-heading"><span>{editor === 'campaign' ? 'CAMPAIGN SETUP' : 'CONTENT DETAILS'}</span><button className="text-action" onClick={() => setEditor(null)}>Close editor</button></div>}
    <div className="planner-grid" hidden={!editor}><form hidden={editor !== 'campaign'} className="planner-form" onSubmit={createCampaign}><h3>New campaign</h3><label>Brand<select value={campaignForm.brandId} onChange={event => setCampaignForm({ ...campaignForm, brandId: event.target.value })}>{data.brands.map((brand: any) => <option key={brand.id} value={brand.id}>{brand.name}</option>)}</select></label><label>Campaign title<input required maxLength={160} value={campaignForm.title} onChange={event => setCampaignForm({ ...campaignForm, title: event.target.value })}/></label><label>Objective<textarea required value={campaignForm.objective} onChange={event => setCampaignForm({ ...campaignForm, objective: event.target.value })}/></label><label>Owner<input required value={campaignForm.owner} onChange={event => setCampaignForm({ ...campaignForm, owner: event.target.value })}/></label><button className="primary" disabled={busy}>Create campaign</button></form>
      <form hidden={editor !== 'content'} className="planner-form content-form" onSubmit={submitItem}><h3>Prepare content for approval</h3><label>Campaign<select required value={itemForm.campaignId} onChange={event => setItemForm({ ...itemForm, campaignId: event.target.value })}><option value="">Select campaign</option>{campaignChoices.map((campaign: any) => <option key={campaign.id} value={campaign.id}>{campaign.title}</option>)}</select></label><div className="form-two"><label>Title<input required value={itemForm.title} onChange={event => setItemForm({ ...itemForm, title: event.target.value })}/></label><label>Owner<input required value={itemForm.owner} onChange={event => setItemForm({ ...itemForm, owner: event.target.value })}/></label></div><label>Objective<input required value={itemForm.objective} onChange={event => setItemForm({ ...itemForm, objective: event.target.value })}/></label><div className="form-two"><label>Channel<select value={itemForm.channel} onChange={event => setItemForm({ ...itemForm, channel: event.target.value })}>{['Instagram', 'X', 'Facebook', 'Email', 'SMS', 'Wholesale'].map(channel => <option key={channel}>{channel}</option>)}</select></label><label>Destination account<input required placeholder="@brand or internal list" value={itemForm.destinationAccount} onChange={event => setItemForm({ ...itemForm, destinationAccount: event.target.value })}/></label></div><label>Planned date and time (Pacific)<input type="datetime-local" required value={itemForm.plannedAt} onChange={event => setItemForm({ ...itemForm, plannedAt: event.target.value })}/></label><label>Caption or brief<textarea required value={itemForm.caption} onChange={event => setItemForm({ ...itemForm, caption: event.target.value })}/></label><SocialDraftControls data={data} form={itemForm} setForm={setItemForm} act={act} busy={busy} pacificInput={pacificInput}/><label>Approved linked creative<select value={itemForm.linkedVersionId} onChange={event => { const entry = approvedAssets.find((entry: any) => entry.version.id === event.target.value); setItemForm({ ...itemForm, linkedAssetId: entry?.asset.id ?? '', linkedVersionId: entry?.version.id ?? '' }); }}><option value="">No linked asset</option>{approvedAssets.map(({ asset, version }: any) => <option key={version.id} value={version.id}>{asset.title} · v{version.number}</option>)}</select></label><button className="primary" disabled={busy || !itemForm.campaignId}>Create draft</button></form></div>
    <div className="calendar-list"><div className="section-heading"><div><span className="eyebrow">DATE GROUPED</span><h2>Content plan</h2></div><small>Times shown in America/Los_Angeles</small></div>{Object.entries(groups).map(([day, items]) => <section className="date-group" key={day}><h3>{day}</h3>{items.map(item => <CalendarItem key={item.id} item={item} data={data} busy={busy} act={act} identity={identity}/>)}</section>)}{!visible.length && <div className="empty-inline">No content matches these filters.</div>}</div>
  </div>;
}

function CalendarItem({ item, data, busy, act, identity }: any) {
  const campaign = data.campaigns.find((entry: any) => entry.id === item.campaignId);
  const review = data.identity.marketingGrants.includes('asset:review');
  const postingState = data.publishingJobs.find((j: any) => j.payload.contentId === item.id && j.payload.approvalSnapshot === item.approvalSnapshot && j.payload.approvedAt === item.approvedAt)?.state ?? item.status;
  return <article className="calendar-item"><div className="calendar-item-main"><strong>{item.title}</strong><span>{data.brands.find((brand: any) => brand.id === item.brandId)?.name} · {campaign?.title} · {item.channel}</span><small>{item.destinationAccount} · {pacific(item.plannedAt)}</small><p>{item.caption}</p>{item.linkedVersionId && <small>Linked approved version: {item.linkedVersionId}</small>}{item.reviewNote && <small>Review note: {item.reviewNote}</small>}{item.approvedBy && <small>Approved by {item.approvedBy}; exact content snapshot recorded.</small>}</div><div className="calendar-item-actions"><span className={`status-mark status-${postingState}`}>{statusLabel(postingState)}</span>{item.status === 'draft' && <button disabled={busy} onClick={() => act(`/marketing/content/${item.id}/submit`, 'Submitted for review.')}>Submit review</button>}{item.status === 'in_review' && review && <><button disabled={busy} onClick={() => act(`/marketing/content/${item.id}/review`, 'Content approved.', { decision: 'approve', notes: '' })}>Approve</button><button disabled={busy} onClick={() => act(`/marketing/content/${item.id}/review`, 'Returned to draft.', { decision: 'return', notes: '' })}>Return</button></>}{item.status === 'approved' && <button disabled={busy} onClick={() => act(`/marketing/content/${item.id}/schedule`, item.destinationAccountId ? 'Approved post queued. Live publishing remains OFF.' : 'Internal schedule recorded.')}>{item.destinationAccountId ? 'Queue approved post' : 'Schedule internally'}</button>}</div><SocialPosting item={item} data={data} identity={identity} busy={busy} act={act} pacific={pacific} pacificInput={pacificInput} fromPacificInput={fromPacificInput}/></article>;
}

function StudioView({ data, busy, act, identity }: any) {
  const [brandId, setBrandId] = useState('cheddr');
  const [campaignId, setCampaignId] = useState('');
  const [prompt, setPrompt] = useState('A refined autumn product campaign, crimson and graphite tones, photographic studio lighting');
  const [references, setReferences] = useState<string[]>([]);
  const [preset, setPreset] = useState('1080x1350');
  const [width, setWidth] = useState('1080');
  const [height, setHeight] = useState('1350');
  const [assetId, setAssetId] = useState('');
  const [simulateError, setSimulateError] = useState(false);
  const [formError, setFormError] = useState('');
  const pendingRequest = useRef<{ fingerprint: string; key: string } | null>(null);
  const campaigns = data.campaigns.filter((campaign: any) => campaign.brandId === brandId);
  const referenceAssets = data.assets.filter((asset: MarketingAsset) => asset.kind === 'reference' && asset.brandId === brandId);
  const creativeAssets = data.assets.filter((asset: MarketingAsset) => asset.kind === 'creative' && asset.brandId === brandId && asset.campaignId === campaignId);
  const kit = data.brandKits.find((item: any) => item.brandId === brandId);
  const defaultIds: string[] = kit?.defaultReferenceIds ?? [];
  const selectedIds = [...new Set([...defaultIds, ...references])];
  const running = data.generationJobs.some((job: GenerationJob) => job.status === 'running');
  const settings = data.imageGeneration;
  useEffect(() => { if (!campaigns.some((campaign: any) => campaign.id === campaignId)) { setCampaignId(campaigns[0]?.id ?? ''); setAssetId(''); } }, [brandId, data.campaigns]);
  function choosePreset(value: string) {
    setPreset(value);
    if (value !== 'custom') { const [w, h] = value.split('x'); setWidth(w); setHeight(h); }
  }
  async function generate(event: React.FormEvent) {
    event.preventDefault(); setFormError('');
    const input = { brandId, campaignId, prompt, referenceAssetIds: references, width: Number(width), height: Number(height), simulateTransientError: simulateError, ...(assetId ? { assetId } : {}) };
    const fingerprint = JSON.stringify(input);
    if (pendingRequest.current?.fingerprint !== fingerprint) pendingRequest.current = { fingerprint, key: crypto.randomUUID() };
    const result = await act('/marketing/generation-jobs', 'Image generation started. You can leave this section while it runs.', { ...input, requestKey: pendingRequest.current!.key });
    if (result) pendingRequest.current = null;
  }
  async function upload(file: File | undefined) {
    if (!file) return;
    setFormError('');
    if (file.size > 5_000_000 || !['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) { setFormError('Choose a PNG, JPEG or WebP image of at most 5 MB.'); return; }
    const reader = new FileReader();
    reader.onerror = () => setFormError('Could not read this image.');
    reader.onload = async () => {
      const asset = await act('/marketing/references', 'Reference image saved.', { brandId, title: file.name.replace(/\.[^.]+$/, ''), base64: String(reader.result).split(',')[1] });
      if (asset && defaultIds.length < 4) setReferences(current => [...new Set([...current.filter(id => !defaultIds.includes(id)), asset.id])].slice(-(4 - defaultIds.length)));
    };
    reader.readAsDataURL(file);
  }
  return <div className="studio-view">
    <div className="studio-heading"><div><span className="eyebrow">IMAGE STUDIO</span><h2>Create campaign imagery.</h2><p>Generate PNG artwork with OpenAI, then review the exact version before publishing.</p></div><span className="sample-stamp">{settings.mode === 'test' ? 'ISOLATED TEST PROVIDER' : 'OPENAI IMAGES'}</span></div>
    <div className={settings.ready ? 'generation-connection' : 'generation-connection needs-setup'}><strong>{settings.ready ? 'Image generation configured' : 'Connect OpenAI to get started'}</strong><p>{settings.message}</p><small>{settings.model} / {settings.quality} quality / {settings.remainingAttempts} of {settings.maxDailyAttempts} attempts remaining today (UTC). {settings.persistent ? 'Images and job history are saved locally.' : 'Isolated test state.'}</small></div>
    {formError && <p role="alert" className="inline-error">{formError}</p>}
    <div className="studio-kit-summary"><strong>{kit?.revision ? 'Using saved brand kit v' + kit.revision : 'No saved brand kit yet'}</strong><span>{defaultIds.length} default reference{defaultIds.length === 1 ? '' : 's'} / {selectedIds.length} of 4 image slots</span><p>{kit?.revision ? 'Your saved style, colors, logo rules and default images apply automatically. Add a brief for this image below.' : 'Save guidelines and default images in Brand Kits to reuse the same brand direction for every image.'}</p></div>
    {selectedIds.length > 4 && <p role="alert" className="inline-error">Remove an extra image below, or update the brand defaults in Brand Kits. Each request can use four reference images.</p>}
    <div className="studio-grid"><form className="studio-form" onSubmit={generate}>
      <label>Brand<select value={brandId} onChange={event => { setBrandId(event.target.value); setAssetId(''); setReferences([]); }} disabled={busy}>{data.brands.map((brand: any) => <option key={brand.id} value={brand.id}>{brand.name}</option>)}</select></label>
      <label>Campaign<select value={campaignId} required onChange={event => { setCampaignId(event.target.value); setAssetId(''); }}><option value="">Select campaign</option>{campaigns.map((campaign: any) => <option key={campaign.id} value={campaign.id}>{campaign.title}</option>)}</select></label>
      <label>Variation<select value={assetId} onChange={event => setAssetId(event.target.value)}><option value="">New creative asset</option>{creativeAssets.map((asset: any) => <option key={asset.id} value={asset.id}>New version of {asset.title}</option>)}</select></label>
      <label>Image prompt<textarea required maxLength={2000} value={prompt} onChange={event => setPrompt(event.target.value)}/></label>
      <fieldset><legend>Saved references and image-specific additions</legend><label className="reference-upload">Upload a reference image<input type="file" accept="image/png,image/jpeg,image/webp" disabled={busy || running} onChange={event => { void upload(event.target.files?.[0]); event.target.value = ''; }}/><small>PNG, JPEG or WebP, up to 5 MB. Selected references are sent to OpenAI. Exact label fidelity still needs review.</small></label>
        {referenceAssets.map((asset: MarketingAsset) => <label className="check-option" key={asset.id}><input type="checkbox" aria-label={asset.title} checked={selectedIds.includes(asset.id)} disabled={defaultIds.includes(asset.id) || !selectedIds.includes(asset.id) && selectedIds.length >= 4} onChange={event => setReferences(current => event.target.checked ? [...current, asset.id] : current.filter(id => id !== asset.id))}/>{asset.title}<small>{defaultIds.includes(asset.id) ? 'Brand default / ' : ''}{kit?.referenceCategories[asset.id]?.replaceAll('_', ' ') ?? 'reference'}</small></label>)}
      </fieldset>
      <fieldset><legend>PNG export dimensions</legend><div className="preset-row">{['1080x1350', '1080x1080', 'custom'].map(value => <label key={value} className={'preset-option ' + (preset === value ? 'active' : '')}><input type="radio" name="dimensions" checked={preset === value} onChange={() => choosePreset(value)}/>{value === 'custom' ? 'Custom' : value.replace('x', ' x ')}</label>)}</div>
        {preset === 'custom' && <div className="form-two"><label>Width<input type="number" required min="64" max="4096" value={width} onChange={event => setWidth(event.target.value)}/></label><label>Height<input type="number" required min="64" max="4096" value={height} onChange={event => setHeight(event.target.value)}/></label></div>}
        <small>OpenAI renders at a supported size. The result is fitted to your export with transparent padding where needed; nothing is cropped.</small>
      </fieldset>
      {settings.mode === 'test' && <label className="check-option"><input type="checkbox" checked={simulateError} onChange={event => setSimulateError(event.target.checked)}/>Simulate one transient sample error</label>}
      <button className="primary" disabled={busy || running || !campaignId || !settings.ready || settings.remainingAttempts === 0 || selectedIds.length > 4}>{running ? 'Generating image...' : 'Generate image'}</button>
      {settings.mode === 'openai' && <small>One image per request. Generation and explicit retries use your OpenAI API billing.</small>}
    </form><div className="generation-results"><div className="block-heading"><div><span className="eyebrow">JOB HISTORY</span><h3>Generated images</h3></div></div>
      {data.generationJobs.map((job: GenerationJob) => <GenerationCard key={job.id} job={job} data={data} identity={identity} busy={busy} act={act}/>)}
      {!data.generationJobs.length && <div className="empty-inline">Your generated images will appear here.</div>}
    </div></div>
  </div>;
}

function GenerationCard({ job, data, identity, busy, act }: any) {
  const asset = data.assets.find((entry: MarketingAsset) => entry.id === job.assetId);
  const version = asset?.versions.find((entry: any) => entry.id === job.versionId);
  const [downloadError, setDownloadError] = useState('');
  const retryKey = useRef<string | null>(null);
  async function retry() {
    retryKey.current ??= crypto.randomUUID();
    if (await act('/marketing/generation-jobs/' + job.id + '/retry', 'Image retry started.', { requestKey: retryKey.current })) retryKey.current = null;
  }
  return <article className="generation-card"><div className="job-title"><div><strong>{asset?.title ?? 'Creative draft'}</strong><small>{pacific(job.createdAt)} / {job.width} x {job.height}</small></div><span className={'status-mark status-' + job.status}>{job.status}</span></div>
    <p>{job.prompt}</p><small>{job.model} / {job.quality} / attempt {job.attempts}</small><p><small>References: {job.referenceAssetIds.map((id: string) => data.assets.find((entry: any) => entry.id === id)?.title ?? id).join(', ') || 'None'}</small></p>
    {job.status === 'running' && <div className="generation-progress" role="status"><span/>Creating your image. This may take a few minutes.</div>}
    {job.error && <p role="alert" className="inline-error">{job.error}</p>}
    {version && <><p className="version-meta">Version {version.number} / {statusLabel(version.status)} / {version.provenance}</p><ProtectedImage path={'/marketing/versions/' + version.id + '/file'} identity={identity} title={asset?.title}/><div className="file-actions"><button disabled={busy || version.status !== 'draft'} onClick={() => act('/marketing/versions/' + version.id + '/submit', 'Version submitted for review.')}>Submit version for review</button><DownloadButton path={'/marketing/versions/' + version.id + '/file?download=1'} identity={identity} fileName={'artwork-v' + version.number + '.png'} onError={setDownloadError}/></div></>}
    <details className="job-brand-provenance"><summary>{job.brandKitSnapshot ? 'Brand kit v' + job.brandKitSnapshot.revision + ' used for this image' : 'Created before saved brand kits'}</summary>{job.effectivePrompt && <pre>{job.effectivePrompt}</pre>}</details>
    {job.usage && <small>OpenAI usage: {job.usage.totalTokens} tokens. Dollar cost is not returned by this request.</small>}
    {job.providerRequestId && <small className="provider-request-id">Provider request: {job.providerRequestId}</small>}
    {downloadError && <small role="alert" className="inline-error">{downloadError}</small>}
    {job.status === 'failed' && job.retryable && !job.outcomeUnknown && <button disabled={busy} onClick={() => void retry()}>Retry job</button>}
  </article>;
}

function ReviewView({ data, notes, setNotes, busy, act, setSection, identity }: any) {
  const reviews = data.content.filter((item: ContentItem) => item.status === 'in_review');
  const versions = data.assets.flatMap((asset: MarketingAsset) => asset.versions.filter(version => version.status === 'in_review').map(version => ({ asset, version })));
  const canReview = data.identity.marketingGrants.includes('asset:review');
  return <div className="review-view"><div className="section-heading"><div><span className="eyebrow">VERSION-BOUND APPROVAL</span><h2>Review queue</h2></div><span className="count">{reviews.length + versions.length}</span></div><label className="review-note">Reviewer notes<textarea value={notes} onChange={event => setNotes(event.target.value)} placeholder="Record changes or approval context"/></label>
    {!canReview && <div className="alert warning">This identity can prepare drafts but does not have a reviewer grant.</div>}
    {reviews.map((item: ContentItem) => <article className="review-row" key={item.id}><div><strong>{item.title}</strong><p>{item.caption}</p>{item.destinationAccountId && item.linkedVersionId && <ProtectedImage path={`/marketing/content/${item.id}/social-image`} identity={identity} title={`Exact posting creative for ${item.title}`}/>}<small>{item.channel} · {item.destinationAccount} · {pacific(item.plannedAt)} · creator {item.createdBy}</small></div><div className="review-actions"><button disabled={busy || !canReview} onClick={() => act(`/marketing/content/${item.id}/review`, 'Content approved.', { decision: 'approve', notes })}>Approve</button><button disabled={busy || !canReview} onClick={() => act(`/marketing/content/${item.id}/review`, 'Content returned to draft.', { decision: 'return', notes })}>Return</button></div></article>)}
    {versions.map(({ asset, version }: any) => <article className="review-row version-review" key={version.id}><div><strong>{asset.title} · version {version.number}</strong><p>{version.provenance}</p><small>{data.brands.find((brand: any) => brand.id === asset.brandId)?.name} · {asset.productSku ?? 'No SKU'} · submitted by {version.createdBy}</small><ProtectedImage path={`/marketing/versions/${version.id}/file`} identity={data.identity.id} title={asset.title}/></div><div className="review-actions"><button disabled={busy || !canReview} onClick={() => act(`/marketing/versions/${version.id}/review`, 'Exact version approved.', { decision: 'approve', notes })}>Approve version</button><button disabled={busy || !canReview} onClick={() => act(`/marketing/versions/${version.id}/review`, 'Version returned to draft.', { decision: 'return', notes })}>Return version</button></div></article>)}
    {!reviews.length && !versions.length && <div className="empty-inline">No drafts are waiting for review.</div>}<button className="text-action" onClick={() => setSection('assets')}>Go to approved assets and publication</button>
  </div>;
}

function AssetsView({ data, busy, act, api, identity }: any) {
  const [downloadError, setDownloadError] = useState('');
  const [audiences, setAudiences] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<Record<string, string[]>>({});
  const grouped = data.assets.filter((asset: MarketingAsset) => asset.kind !== 'reference');
  const canPublish = data.identity.marketingGrants.includes('asset:publish');
  return <div className="assets-view"><div className="section-heading"><div><span className="eyebrow">SALES LIBRARY</span><h2>Asset versions & publication history</h2></div><small>COAs remain uploaded, provenance-backed documents.</small></div>
    {grouped.map((asset: MarketingAsset) => <article className="asset-record" key={asset.id}><div className="asset-record-heading"><div><strong>{asset.title}</strong><small>{data.brands.find((brand: any) => brand.id === asset.brandId)?.name} · {asset.kind.replaceAll('_', ' ')}{asset.productSku ? ` · ${asset.productSku}` : ''}{asset.batchId ? ` · Batch ${asset.batchId}` : ''}{asset.restrictedAccountId ? ` · Account restricted` : ''}</small>{asset.campaignId && <small>Campaign: {data.campaigns.find((campaign: any) => campaign.id === asset.campaignId)?.title}</small>}</div><span className="count">{asset.versions.length} versions</span></div>
      {asset.versions.map(version => <div className="asset-version-row" key={version.id}><div><strong>Version {version.number}</strong><span className={`status-mark status-${version.status}`}>{statusLabel(version.status)}</span><small>{version.sourceType.replaceAll('_', ' ')} · created by {version.createdBy} · {version.provenance}</small>{version.reviewedBy && <small>Reviewed by {version.reviewedBy} on {pacific(version.reviewedAt!)}</small>}</div><div className="asset-version-actions">{version.mimeType.startsWith('image/') && <ProtectedImage path={`/marketing/versions/${version.id}/file`} identity={identity} title={asset.title}/ >}{(asset.kind === 'creative' || data.identity.marketingGrants.includes('asset:read:all')) && <DownloadButton path={`/marketing/versions/${version.id}/file?download=1`} identity={identity} fileName={`asset-v${version.number}.${version.mimeType === 'image/png' ? 'png' : version.mimeType === 'image/svg+xml' ? 'svg' : version.mimeType === 'text/csv' ? 'csv' : 'txt'}`} onError={setDownloadError}/>}</div>
        {version.status === 'approved' && canPublish && <div className="publish-controls"><label>Audience<select aria-label={`Audience for ${asset.title} version ${version.number}`} value={audiences[version.id] ?? 'all'} onChange={event => setAudiences({ ...audiences, [version.id]: event.target.value })}><option value="all">All eligible reps</option><option value="selected">Selected reps</option></select></label>{(audiences[version.id] ?? 'all') === 'selected' && <div className="rep-picker">{data.eligibleReps.map((rep: any) => <label key={rep.id}><input type="checkbox" checked={(selected[version.id] ?? []).includes(rep.id)} onChange={event => setSelected(current => ({ ...current, [version.id]: event.target.checked ? [...(current[version.id] ?? []), rep.id] : (current[version.id] ?? []).filter(id => id !== rep.id) }))}/>{rep.name}</label>)}</div>}<button disabled={busy} onClick={() => act(`/marketing/versions/${version.id}/publish`, 'Approved version published to the internal rep library.', { audienceMode: audiences[version.id] ?? 'all', repIds: selected[version.id] ?? [] })}>Publish approved version</button></div>}
      </div>)}
      {asset.publications.map((publication: AssetPublication) => <div className="publication-row" key={publication.id}><span>{publication.status} · version {asset.versions.find(version => version.id === publication.versionId)?.number}</span><small>{publication.audienceMode === 'all' ? 'All eligible reps at publication' : `Selected: ${publication.repIds.join(', ')}`} · by {publication.publishedBy} · {pacific(publication.publishedAt)}</small>{publication.retiredAt && <small>Retired by {publication.retiredBy} · {publication.retireReason}</small>}{publication.status === 'published' && canPublish && <button className="text-action" disabled={busy} onClick={() => act(`/marketing/publications/${publication.id}/retire`, 'Publication retired.', { reason: 'Retired in local demo.' })}>Retire</button>}</div>)}
    </article>)}
    {downloadError && <p role="alert">{downloadError}</p>}
    {!grouped.length && <div className="empty-inline">No assets for this brand yet.</div>}
  </div>;
}

function AssetRows({ assets, data, identity, api }: any) {
  return <div className="asset-rows">{assets.map((asset: MarketingAsset) => {
    const publication = asset.publications.filter(item => item.status === 'published').at(-1);
    const version = publication && asset.versions.find(item => item.id === publication.versionId);
    if (!version) return null;
    return <article key={asset.id} className="asset-row"><div><strong>{asset.title}</strong><small>{data.brands.find((brand: any) => brand.id === asset.brandId)?.name} · v{version.number} · {asset.productSku ?? asset.kind}</small></div>{asset.kind === 'creative' && <ProtectedImage path={`/marketing/versions/${version.id}/file`} identity={identity} title={asset.title}/>}<span>{publication.audienceMode === 'all' ? 'All eligible reps' : publication.repIds.join(', ')}</span></article>;
  })}{!assets.length && <p className="empty-inline">No published assets for this brand.</p>}</div>;
}

export function SalesAssetsPanel({ identity }: { identity: string }) {
  const [query, setQuery] = useState('');
  const [assets, setAssets] = useState<SalesAssetView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [downloadError, setDownloadError] = useState('');
  useEffect(() => {
    let active = true;
    setLoading(true); setError(''); setAssets([]); setDownloadError('');
    fetch('/api/assets', { headers: { 'X-Demo-Identity': identity } }).then(async response => {
      const body = await response.json(); if (!response.ok) throw new Error(body.error ?? 'Assets unavailable.'); return body;
    }).then(body => { if (active) setAssets(body.assets); }).catch(reason => { if (active) setError(String(reason.message)); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [identity]);
  if (loading) return <section className="sales-assets"><h2>Sales Assets</h2><p role="status">Loading authorized assets…</p></section>;
  const visible = assets.filter(asset => [asset.title, asset.brand, asset.productSku, asset.batchId, asset.kind, asset.campaign].join(' ').toLowerCase().includes(query.toLowerCase()));
  return <section className="sales-assets"><div className="section-heading"><div><span className="eyebrow">YOUR MATERIALS</span><h2>Sales Assets</h2></div><span className="count">{visible.length}</span></div>
    <label>Find Assets<input aria-label="Find Assets" placeholder="Brand, title, SKU or batch" value={query} onChange={event => setQuery(event.target.value)}/></label>
    {error ? <div className="alert error" role="alert">{error}</div> : visible.map(asset => <article className="sales-asset-row" key={`${asset.assetId}-${asset.versionId}`}><div><strong>{asset.title}</strong><small>{asset.brand} · v{asset.version} · {asset.kind.replaceAll('_', ' ')}</small><small>{asset.productSku ?? 'No SKU'}{asset.batchId ? ` · Batch ${asset.batchId}` : ''}{asset.campaign ? ` · ${asset.campaign}` : ''}</small><small>Published {pacific(asset.publication.publishedAt)} by {asset.publication.publishedBy}</small><small>{asset.provenance}</small></div>{asset.kind === 'creative' ? <ProtectedImage path={`/assets/${asset.assetId}/versions/${asset.versionId}/file`} identity={identity} title={asset.title}/> : <ProtectedDocument path={`/assets/${asset.assetId}/versions/${asset.versionId}/file`} identity={identity}/>}<DownloadButton path={`/assets/${asset.assetId}/versions/${asset.versionId}/file?download=1`} identity={identity} fileName={asset.fileName} onError={setDownloadError}/></article>)}
    {downloadError && <p className="inline-error" role="alert">{downloadError}</p>}{!visible.length && !error && <div className="empty-inline">No Assets have been published to your audience.</div>}
  </section>;
}
