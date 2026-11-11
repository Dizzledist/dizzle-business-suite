import { useEffect, useRef, useState } from 'react';
import type { DemoEvent, InvoiceView, Workspace } from '../shared/contracts';
import { MarketingWorkspace, SalesAssetsPanel } from './MarketingWorkspace';
import { MarketingIcon, MarketingNavigation, marketingSections, type MarketingSection } from './MarketingNavigation';

const identities = [
  ['manager', 'Sales manager'], ['rep-a', 'Rep A'], ['rep-b', 'Rep B'], ['warehouse', 'Warehouse'],
  ['owner', 'Owner'], ['admin', 'Admin'], ['marketing', 'Marketing editor'], ['disabled', 'Disabled manager'], ['revoked', 'Revoked manager'], ['outside', 'Other organization'],
];
const money = (amount: string) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(amount));
export function App() {
  const [identity, setIdentity] = useState('manager');
  const [department, setDepartment] = useState('sales');
  const [marketingSection, setMarketingSection] = useState<MarketingSection>('home');
  const [navigationOpen, setNavigationOpen] = useState(false);
  const [data, setData] = useState<Workspace | null>(null);
  const [selected, setSelected] = useState('inv-open');
  const [reason, setReason] = useState('');
  const [termsId, setTermsId] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const generation = useRef(0);
  async function api<T>(path: string, payload?: unknown): Promise<T> {
    const response = await fetch(`/api${path}`, {
      method: payload === undefined ? 'GET' : 'POST',
      headers: { 'X-Demo-Identity': identity, ...(payload === undefined ? {} : { 'Content-Type': 'application/json' }) },
      ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error ?? 'Request failed.');
    return result;
  }
  async function reload(version: number) {
    const next = await api<Workspace>('/workspace');
    if (generation.current === version) { setData(next); setDepartment(current => next.identity.departments.includes(current as typeof next.identity.departments[number]) ? current : next.identity.departments[0] ?? 'sales'); }
  }
  useEffect(() => {
    const version = ++generation.current;
    setData(null); setError(''); setNotice(''); setReason(''); setTermsId(''); setMarketingSection('home'); setNavigationOpen(false);
    reload(version).catch(e => { if (generation.current === version) setError(String(e.message)); });
    return () => { generation.current++; };
    // Changing identity discards the old data before rendering another role.
  }, [identity]);
  useEffect(() => {
    if (!navigationOpen) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.querySelector<HTMLButtonElement>('.marketing-navigation [aria-selected=true]')?.focus();
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setNavigationOpen(false); requestAnimationFrame(() => document.getElementById('workspace-menu')?.focus()); }
      if (event.key === 'Tab') {
        const controls = [...document.querySelectorAll<HTMLElement>('#workspace-sidebar button:not([tabindex="-1"]), #workspace-sidebar select, #workspace-sidebar a')];
        const first = controls[0], last = controls.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    document.addEventListener('keydown', close);
    const desktop = window.matchMedia('(min-width: 861px)');
    const resize = () => { if (desktop.matches) setNavigationOpen(false); };
    desktop.addEventListener('change', resize);
    return () => { document.body.style.overflow = originalOverflow; document.removeEventListener('keydown', close); desktop.removeEventListener('change', resize); };
  }, [navigationOpen]);
  async function act(path: string, payload: unknown, message: string) {
    setBusy(true); setError(''); setNotice('');
    const version = generation.current;
    try {
      const result = await api<{ outcome?: string }>(path, payload);
      await reload(version);
      setNotice(result.outcome ? `${message}: ${result.outcome}` : message);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed.');
      try { await reload(version); } catch { setData(null); }
    }
    finally { setBusy(false); }
  }
  const invoice = data?.invoices.find(i => i.id === selected) ?? data?.invoices[0];
  const canRelease = !!data?.identity.release;
  const job = data?.jobs.find(j => j.invoiceId === invoice?.id);
  const simulate = (event: DemoEvent) => invoice && act(`/demo/invoices/${invoice.id}/events`, { event }, 'Fixture event');
  function choose(next: InvoiceView) { setSelected(next.id); setReason(''); setTermsId(''); setError(''); setNotice(''); }
  const isMarketing = department === 'marketing';
  function navigateMarketing(section: MarketingSection, closeDrawer = false) {
    setMarketingSection(section);
    if (closeDrawer) {
      setNavigationOpen(false);
      if (window.matchMedia('(max-width: 860px)').matches) requestAnimationFrame(() => document.getElementById('marketing-panel')?.focus());
    }
    window.scrollTo({ top: 0, behavior: 'instant' });
  }
  return <div className={`app ${isMarketing ? 'is-marketing' : ''} ${navigationOpen ? 'navigation-open' : ''}`}>
    {isMarketing && navigationOpen && <button className="navigation-backdrop" aria-label="Close workspace navigation" onClick={() => { setNavigationOpen(false); requestAnimationFrame(() => document.getElementById('workspace-menu')?.focus()); }}/>}
    <aside className="sidebar" id="workspace-sidebar" aria-label="Workspace sidebar" role={isMarketing && navigationOpen ? 'dialog' : undefined} aria-modal={isMarketing && navigationOpen ? true : undefined}>
      {isMarketing && <button className="sidebar-dismiss" aria-label="Close navigation panel" onClick={() => { setNavigationOpen(false); requestAnimationFrame(() => document.getElementById('workspace-menu')?.focus()); }}><MarketingIcon name="close"/></button>}
      <a className="brand" href="/" aria-label="Dizzle home"><span className="brand-mark">d.</span> DIZZLE</a>
      <span className="sidebar-label">BUSINESS SUITE</span>
      {data && <label className="department-select">Department<select aria-label="Department" value={department} onChange={event => { setDepartment(event.target.value); setNavigationOpen(false); }}>{data.identity.departments.map(item => <option key={item} value={item}>{item === 'sales' ? 'Sales' : item === 'marketing' ? 'Marketing' : 'Warehouse'}</option>)}</select></label>}
      {isMarketing && data?.identity.departments.includes('marketing') ? <MarketingNavigation section={marketingSection} onChange={navigateMarketing}/>
        : <><div className="nav-active"><span>↗</span> {department === 'warehouse' ? 'Warehouse' : 'Invoice workflow'}</div><div className="sidebar-note">One source of truth.<br/>A clear path to fulfillment.</div></>}
      <div className="local-tag"><span/> Local sample data</div>
    </aside>
    <main inert={isMarketing && navigationOpen}>
      <header className="topbar">
        {isMarketing && <button id="workspace-menu" className="workspace-menu" aria-label={navigationOpen ? 'Close workspace navigation menu' : 'Open workspace navigation'} aria-expanded={navigationOpen} aria-controls="workspace-sidebar" onClick={() => setNavigationOpen(!navigationOpen)}><MarketingIcon name={navigationOpen ? 'close' : 'menu'}/></button>}
        <span>{isMarketing ? <>Marketing <span className="slash">/</span><strong>{marketingSections.find(item => item.id === marketingSection)?.label}</strong></> : <>Operations <span className="slash">/</span> Workflow demo</>}</span>
        <label className="identity">Test identity <select aria-label="Test identity" value={identity} disabled={busy} onChange={e => { setData(null); setIdentity(e.target.value); }}>
          {identities.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
        </select></label>
      </header>
      {!data && department === 'marketing' && <div role={error ? 'alert' : 'status'} className={error ? 'alert error' : ''}>{error || 'Loading authorized workspace…'}</div>}
      {department === 'marketing' ? data?.identity.departments.includes('marketing')
        ? <MarketingWorkspace key={identity} identity={identity} section={marketingSection} setSection={navigateMarketing}/>
        : data ? <div className="alert error" role="alert">Access denied. This identity has no Marketing department grant.</div> : null
      : <>
      <section className="page-title"><div><span className="eyebrow">PHASE 1 · LOCAL DEMO</span><h1>From invoice to warehouse.</h1><p>See what’s paid, what’s held, and what’s ready to fulfill.</p></div>
        {data?.identity.demo && <button className="secondary" disabled={busy} onClick={() => act('/demo/reset', {}, 'Sample data reset')}>Reset demo</button>}
      </section>
      {error && <div className="alert error" role="alert">{error}</div>}
      {notice && <div className="alert success" role="status">{notice}</div>}
      {!data && !error && <p role="status">Loading workspace…</p>}
      {data && <>
        <div className="summary">
          <div><span>Visible invoices</span><strong>{data.invoices.length}</strong><small>Scoped to your test identity</small></div>
          <div><span>Warehouse jobs</span><strong>{data.jobs.length}</strong><small>Paid or explicitly released</small></div>
          <div><span>Needs verification</span><strong>{data.invoices.filter(i => i.holdReason).length || data.jobs.filter(j => j.review).length}</strong><small>Uncertainty stays visible</small></div>
        </div>
        {!data.identity.roles.includes('warehouse') && <div className="workflow-grid">
          <section className="panel invoice-list"><div className="panel-title"><h2>Sample invoices</h2><span className="count">{data.invoices.length}</span></div>
            <p className="panel-description">Read-only source records · USD</p>
            {data.invoices.length === 0 && <p>No invoices in your authorized scope.</p>}
            {data.invoices.map(i => <button key={i.id} className={`invoice-row ${invoice?.id === i.id ? 'selected' : ''}`} onClick={() => choose(i)} aria-pressed={invoice?.id === i.id}>
              <div><strong>{i.number}</strong><span>{i.accountName}</span></div>
              <div className="invoice-status"><span className={`badge ${i.payment === 'fully paid' ? 'green' : ''}`}>{i.payment}</span><small>{money(i.balance)} open</small></div>
            </button>)}
          </section>
          {invoice && <section className="panel detail" key={invoice.id}><div className="panel-title"><h2>{invoice.number}</h2><span className={`badge ${invoice.jobId ? 'green' : ''}`}>{invoice.jobId ? 'Released' : 'On hold'}</span></div>
            <p className="account-name">{invoice.accountName}</p>
            <dl className="invoice-facts"><div><dt>Invoice total</dt><dd>{money(invoice.total)}</dd></div><div><dt>Source balance</dt><dd>{money(invoice.balance)}</dd></div><div><dt>Payment status</dt><dd>{invoice.payment}</dd></div><div><dt>Verification</dt><dd>{invoice.verification}</dd></div></dl>
            <p className="timestamp">Last verified: {new Date(invoice.verifiedAt).toLocaleString()} · {invoice.mappingVerified ? 'Account mapped' : 'Account mapping unverified'}</p>
            {invoice.holdReason && <div className="hold-note">{invoice.holdReason}{invoice.jobId ? ' · Existing job preserved for review.' : ' · New release held.'}</div>}
            {job ? <div className="release-record"><h3>Original release audit</h3><p className="job-id">{job.id}</p><dl><dt>Released by</dt><dd>{job.releaseAudit?.actor}</dd><dt>Basis</dt><dd>{job.releaseAudit?.basis}</dd><dt>Reason</dt><dd>{job.releaseAudit?.reason}</dd><dt>Terms</dt><dd>{job.releaseAudit?.terms ?? 'Verified full payment'}</dd><dt>Released at</dt><dd>{job.releaseAudit && new Date(job.releaseAudit.at).toLocaleString()}</dd></dl></div> : <p className="waiting">No warehouse job. Full verified payment or an approved terms release is required.</p>}
            {canRelease && <form className="terms-form" onSubmit={e => { e.preventDefault(); act(`/invoices/${invoice.id}/release`, { reason, termsId, requestKey: crypto.randomUUID(), expectedRevision: invoice.revision }, 'Release request accepted · original audit preserved'); }}>
              <h3>Release under approved terms</h3><p>{invoice.terms.text}</p>
              <label>Documented terms<select aria-label="Documented terms" value={termsId} onChange={e => setTermsId(e.target.value)} required><option value="">Select documented terms</option><option value={invoice.terms.id}>{invoice.terms.id} · {invoice.terms.status}</option></select></label>
              <label>Reason for early release<textarea aria-label="Reason for early release" value={reason} maxLength={500} onChange={e => setReason(e.target.value)} required placeholder="Why should this work release before full payment?"/></label>
              <button className="primary" disabled={busy}>{invoice.jobId ? 'Repeat release request' : 'Push to warehouse'} <span>↗</span></button>
            </form>}
            {data.identity.demo && <section className="demo-controls"><h3>Simulate source events</h3><p>Local fixture adapter only. No Zoho requests or payment writes.</p><div className="button-wrap">
              <button disabled={busy} onClick={() => simulate('partial')}>Receive $40 payment</button>
              <button disabled={busy} onClick={() => simulate('full')}>Receive verified full payment</button>
              <button disabled={busy} onClick={() => simulate('replay')}>Replay full event</button>
              <button disabled={busy} onClick={() => simulate('stale')}>Mark stale</button>
              <button disabled={busy} onClick={() => simulate('unverified')}>Mark unverified</button>
              <button disabled={busy} onClick={() => simulate('unmapped')}>Unverify mapping</button>
              <button disabled={busy} onClick={() => simulate('restore')}>Restore verification</button>
            </div></section>}
          </section>}
        </div>}
        <section className="warehouse"><div className="section-heading"><div><span className="eyebrow">FULFILLMENT</span><h2>Warehouse board</h2></div><span className="badge">Orders · {data.jobs.length}</span></div>
          {data.jobs.length === 0 ? <div className="empty"><span>□</span><h3>No released work yet</h3><p>Unpaid and partially paid invoices stay outside this queue.</p></div> : <div className="job-grid">{data.jobs.map(j => <article className="panel job-card" key={j.id} data-testid="warehouse-job"><div className="panel-title"><h3>{j.invoiceNumber}</h3><span className="badge green">{j.status}</span></div><p>{j.accountName}</p><p className="job-id">{j.id}</p>{j.items.map(item => <div className="job-item" key={item.sku}><span>{item.sku}</span><strong>{item.quantity} {item.unit}</strong></div>)}{j.review && <div className="hold-note">Review required · {j.review}</div>}<small>Linked source: {j.invoiceId}</small></article>)}</div>}
        </section>
        {data.identity.marketingGrants.includes('asset:read:published') || data.identity.marketingGrants.includes('asset:read:all') ? <SalesAssetsPanel identity={identity}/> : null}
        <footer>{data.fixtureNotice}<p>API data resets on restart or Reset demo. No real customers, invoices, payments, inventory or messages.</p></footer>
      </>}
      </>}
    </main>
  </div>;
}
