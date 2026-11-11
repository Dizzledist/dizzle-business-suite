import { useEffect, useState } from 'react';
import type { BrandKit, BrandReferenceCategory, MarketingWorkspaceData } from '../shared/contracts';
import { ProtectedImage, DownloadButton } from './AssetFiles';
import './brand-kits.css';

type EditableKit = Pick<BrandKit, 'imageType' | 'visualStyle' | 'palette' | 'typography' | 'logoRules' | 'avoid' | 'guidelines' | 'defaultReferenceIds' | 'referenceCategories'>;
function editable(kit: BrandKit): EditableKit {
  return { imageType: kit.imageType, visualStyle: kit.visualStyle, palette: kit.palette, typography: kit.typography, logoRules: kit.logoRules,
    avoid: kit.avoid, guidelines: kit.guidelines, defaultReferenceIds: [...kit.defaultReferenceIds], referenceCategories: { ...kit.referenceCategories } };
}
const categories: { id: BrandReferenceCategory; label: string }[] = [
  { id: 'logo', label: 'Logo' }, { id: 'product', label: 'Product photo' }, { id: 'style', label: 'Style example' },
  { id: 'brand_bible', label: 'Brand-bible page' }, { id: 'other', label: 'Other reference' },
];
interface Props {
  data: MarketingWorkspaceData; identity: string; busy: boolean;
  act: (path: string, message: string, payload?: unknown, method?: string) => Promise<unknown>;
}

export function BrandKitSettings({ data, identity, busy, act }: Props) {
  const [brandId, setBrandId] = useState(data.brands.find(brand => brand.id === 'cheddr')?.id ?? data.brands[0].id);
  const saved = data.brandKits.find(kit => kit.brandId === brandId)!;
  const [form, setForm] = useState<EditableKit>(() => editable(saved));
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [page, setPage] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [fileError, setFileError] = useState('');
  const canEdit = data.identity.marketingGrants.includes('campaign:write');
  const canUpload = data.identity.marketingGrants.includes('creative:generate');
  useEffect(() => { setForm(editable(saved)); setFileError(''); }, [brandId, saved.revision]);
  useEffect(() => { setPage(0); }, [brandId, query, category]);
  const dirty = JSON.stringify(form) !== JSON.stringify(editable(saved));
  const library = data.assets.filter(asset => asset.kind === 'reference' && asset.brandId === brandId);
  const filtered = library.filter(asset => asset.title.toLowerCase().includes(query.toLowerCase()) && (category === 'all' || (form.referenceCategories[asset.id] ?? 'other') === category));
  const pages = Math.max(1, Math.ceil(filtered.length / 24));
  const currentPage = Math.min(page, pages - 1);
  const visible = filtered.slice(currentPage * 24, currentPage * 24 + 24);

  function field(name: keyof Pick<EditableKit, 'imageType' | 'visualStyle' | 'palette' | 'typography' | 'logoRules' | 'avoid' | 'guidelines'>, value: string) {
    setForm(current => ({ ...current, [name]: value }));
  }
  async function save(event: React.FormEvent) {
    event.preventDefault();
    await act('/marketing/brand-kits/' + brandId, 'Brand kit saved. Future images will use these settings.', { ...form, expectedRevision: saved.revision }, 'PUT');
  }
  async function upload(files: File[]) {
    if (!files.length) return;
    if (files.length > 20) { setFileError('Choose up to 20 images per batch.'); return; }
    setUploading(true); setFileError('');
    const errors: string[] = [];
    try {
      for (const file of files) {
        if (file.size > 5_000_000 || !['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) { errors.push(file.name + ': use PNG, JPEG or WebP, up to 5 MB.'); continue; }
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader(); reader.onerror = () => reject(new Error('File could not be read.'));
          reader.onload = () => resolve(String(reader.result).split(',')[1]); reader.readAsDataURL(file);
        });
        const result = await act('/marketing/references', 'Reference image saved to the brand library.', { brandId, title: file.name.replace(/\.[^.]+$/, ''), base64 });
        if (!result) errors.push(file.name + ': upload was not saved.');
      }
    } catch { errors.push('An image could not be read. Other completed uploads are saved.'); }
    finally { setUploading(false); setFileError(errors.join(' ')); }
  }
  return <div className="brand-settings">
    <div className="brand-settings-toolbar"><label>Brand<select aria-label="Brand kit brand" value={brandId} disabled={uploading || busy} onChange={event => { if (dirty && !window.confirm('Discard unsaved brand-kit changes and switch brands?')) return; setBrandId(event.target.value); }}>{data.brands.map(brand => <option key={brand.id} value={brand.id}>{brand.name}</option>)}</select></label>
      <div><span className="status-mark">{saved.revision ? 'Saved kit · v' + saved.revision : 'Not configured'}</span><small>{saved.updatedBy ? 'Last saved by ' + saved.updatedBy : 'Start with a few clear guidelines and your strongest references.'}</small></div><button className="primary" type="submit" form="brand-kit-editor" disabled={!canEdit || !dirty || busy || uploading}>Save brand kit</button>
    </div>
    <form id="brand-kit-editor" className="brand-kit-form" onSubmit={save}>
      <div className="brand-rules-heading"><div><span className="eyebrow">THE BRAND DIRECTION</span><h2>Define the visual language.</h2><p>These rules are added to every new image request for this brand.</p></div></div>
      <div className="brand-rules-grid">
        <label>Image type<input value={form.imageType} maxLength={120} disabled={!canEdit} onChange={event => field('imageType', event.target.value)} placeholder="Product photography, editorial lifestyle, illustrated posters..."/></label>
        <label>Color palette<textarea value={form.palette} maxLength={1000} disabled={!canEdit} onChange={event => field('palette', event.target.value)} placeholder="Primary/accent colors, hex codes and background preferences"/></label>
        <label>Visual style<textarea value={form.visualStyle} maxLength={2000} disabled={!canEdit} onChange={event => field('visualStyle', event.target.value)} placeholder="Lighting, mood, materials, composition and camera treatment"/></label>
        <label>Typography and layout<textarea value={form.typography} maxLength={1000} disabled={!canEdit} onChange={event => field('typography', event.target.value)} placeholder="Font character, text placement, whitespace and hierarchy"/></label>
        <label>Logo and packaging rules<textarea value={form.logoRules} maxLength={1500} disabled={!canEdit} onChange={event => field('logoRules', event.target.value)} placeholder="Approved logo usage, clear space, label details to preserve"/></label>
        <label>Things to avoid<textarea value={form.avoid} maxLength={1500} disabled={!canEdit} onChange={event => field('avoid', event.target.value)} placeholder="Unwanted colors, styles, props, effects or altered packaging"/></label>
        <label className="brand-guidelines">Additional brand guidelines<textarea value={form.guidelines} maxLength={4000} disabled={!canEdit} onChange={event => field('guidelines', event.target.value)} placeholder="Paste the relevant written rules from your brand bible here."/></label>
      </div>
      <div className="brand-kit-save-note"><span>{dirty ? 'Unsaved changes — save to apply them to future images.' : 'Saved rules apply automatically in Image Studio.'}</span><button type="button" className="text-action" disabled={busy || uploading} onClick={async () => { if (dirty && !window.confirm('Discard unsaved changes and load the saved kit?')) return; await act('/marketing/workspace', 'Latest brand kits loaded.', undefined, 'GET'); setForm(editable(saved)); }}>Refresh saved kit</button></div>
    </form>
    <section className="brand-reference-library"><div className="brand-rules-heading"><div><span className="eyebrow">THE REFERENCE LIBRARY</span><h2>Upload once. Keep creating.</h2><p>Logos, product originals, style examples and brand-bible page images.</p></div><span className="count">{library.length} images</span></div>
      <label className="brand-upload-zone">Add reference images<input aria-label="Add reference images" type="file" accept="image/png,image/jpeg,image/webp" multiple disabled={!canUpload || busy || uploading} onChange={event => { const files = Array.from(event.target.files ?? []); event.target.value = ''; void upload(files); }}/><small>PNG, JPEG or WebP · 5 MB per image · up to 20 per batch. Original files stay unchanged.</small></label>
      {uploading && <p role="status">Saving reference images...</p>}
      {fileError && <p role="alert" className="inline-error">{fileError}</p>}
      <div className="brand-library-controls"><label>Find references<input aria-label="Find brand references" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search by image name"/></label><label>Category<select aria-label="Brand reference category filter" value={category} onChange={event => setCategory(event.target.value)}><option value="all">All categories</option>{categories.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label><span>{form.defaultReferenceIds.length}/4 default images</span></div>
      <p className="brand-reference-explanation">Choose up to four defaults below, then save the kit. Those images are automatically sent with every new request for this brand. The rest stay available in the library for individual briefs. Reference guidance improves consistency; review generated logos and labels for accuracy.</p>
      <div className="brand-reference-grid">{visible.map(asset => {
        const version = asset.versions.at(-1)!; const selected = form.defaultReferenceIds.includes(asset.id);
        const extension = version.mimeType === 'image/svg+xml' ? 'svg' : version.mimeType.split('/')[1];
        return <article className={'brand-reference-card ' + (selected ? 'is-default' : '')} key={asset.id}><ProtectedImage path={'/marketing/versions/' + version.id + '/file'} identity={identity} title={asset.title}/><div><strong>{asset.title}</strong>
          <label>Category<select aria-label={'Category for ' + asset.title} value={form.referenceCategories[asset.id] ?? 'other'} disabled={!canEdit} onChange={event => setForm(current => ({ ...current, referenceCategories: { ...current.referenceCategories, [asset.id]: event.target.value as BrandReferenceCategory } }))}>{categories.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
          <label className="brand-default-check"><input type="checkbox" aria-label={'Use ' + asset.title + ' by default'} checked={selected} disabled={!canEdit || !selected && form.defaultReferenceIds.length >= 4} onChange={event => setForm(current => ({ ...current, defaultReferenceIds: event.target.checked ? [...current.defaultReferenceIds, asset.id] : current.defaultReferenceIds.filter(id => id !== asset.id) }))}/>Use by default</label>
          <div className="brand-original-meta"><small>{version.width ?? '?'} × {version.height ?? '?'} · Original</small><DownloadButton path={'/marketing/versions/' + version.id + '/file?download=1'} identity={identity} fileName={asset.title + '.' + extension} onError={setFileError}/></div>
        </div></article>;
      })}</div>
      {!filtered.length && <div className="empty-inline">No reference images match. Add your brand originals to build this library.</div>}
      {pages > 1 && <div className="brand-library-pagination"><button disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>Previous</button><span>Page {currentPage + 1} of {pages}</span><button disabled={currentPage >= pages - 1} onClick={() => setPage(currentPage + 1)}>Next</button></div>}
      <div className="brand-library-save"><span>{dirty ? 'Unsaved guidelines or reference choices.' : 'Your saved defaults are ready for Image Studio.'}</span><button className="primary" type="submit" form="brand-kit-editor" disabled={!canEdit || !dirty || busy || uploading}>Save reference choices</button></div>
    </section>
  </div>;
}
