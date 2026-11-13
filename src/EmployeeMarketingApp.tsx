import { useEffect, useState } from 'react';
import type { EmployeeContext } from '../shared/identity';
import { MarketingWorkspace, SalesAssetsPanel } from './MarketingWorkspace';
import { MarketingIcon, MarketingNavigation, type MarketingSection } from './MarketingNavigation';
import { apiFetch, configureTransport } from './transport';

export function EmployeeMarketingApp() {
  const [employee, setEmployee] = useState<EmployeeContext | null>(null), [loading, setLoading] = useState(true), [error, setError] = useState('');
  const [section, setSection] = useState<MarketingSection>('home');
  const [navigationOpen, setNavigationOpen] = useState(false);
  useEffect(() => {
    if (!navigationOpen) return;
    const old = document.body.style.overflow; document.body.style.overflow = 'hidden';
    document.querySelector<HTMLButtonElement>('#workspace-sidebar [aria-selected=true]')?.focus();
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') { setNavigationOpen(false); requestAnimationFrame(() => document.getElementById('workspace-menu')?.focus()); } if (event.key === 'Tab') { const elements = [...document.querySelectorAll<HTMLElement>('#workspace-sidebar button, #workspace-sidebar a')], first = elements[0], last = elements.at(-1); if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); } } };
    window.addEventListener('keydown', key); return () => { window.removeEventListener('keydown', key); document.body.style.overflow = old; };
  }, [navigationOpen]);
  const navigate = (next: MarketingSection) => { setSection(next); setNavigationOpen(false); };
  async function session() {
    try {
      const response = await fetch('/api/auth/session', { credentials: 'same-origin', cache: 'no-store' });
      if (!response.ok) { setEmployee(null); configureTransport('employee'); if (response.status !== 401) setError('Employee access is unavailable. Contact your administrator.'); return; }
      const data = await response.json(); configureTransport('employee', data.csrfToken); setEmployee(data.employee); setError('');
    } catch { setEmployee(null); configureTransport('employee'); setError('Sign-in service unavailable. Try again when it is restored.'); }
    finally { setLoading(false); }
  }
  useEffect(() => {
    void session();
    const expired = () => { configureTransport('employee'); setEmployee(null); };
    const refresh = () => { void session(); };
    window.addEventListener('dizzle-session-expired', expired); window.addEventListener('focus', refresh);
    const timer = setInterval(refresh, 60_000);
    return () => { clearInterval(timer); window.removeEventListener('dizzle-session-expired', expired); window.removeEventListener('focus', refresh); };
  }, []);
  if (loading) return <main><p role="status">Checking employee session…</p></main>;
  if (!employee) return <main className="signin"><span className="eyebrow">DIZZLE BUSINESS SUITE</span><h1>Sign in to Marketing</h1><p>Use your provisioned Google Workspace account.</p>{error && <p role="alert">{error}</p>}<form method="post" action="/api/auth/google/start"><button>Sign in with Google Workspace</button></form></main>;
  const workspace = employee.grants.includes('workspace:read');
  return <div className={'app is-marketing' + (navigationOpen ? ' navigation-open' : '')}>{navigationOpen && <button className="navigation-backdrop" aria-label="Close workspace navigation" onClick={() => setNavigationOpen(false)}/>}<aside id="workspace-sidebar" className="sidebar" aria-label="Workspace sidebar" role={navigationOpen ? 'dialog' : undefined} aria-modal={navigationOpen || undefined}><button className="sidebar-dismiss" aria-label="Close navigation panel" onClick={() => setNavigationOpen(false)}><MarketingIcon name="close"/></button><a className="brand" href="/">DIZZLE</a><span className="sidebar-label">MARKETING</span>{workspace && <MarketingNavigation section={section} onChange={navigate}/>}<p className="sidebar-note">Private pilot · Live publishing OFF</p></aside>
    <main inert={navigationOpen}><header className="topbar"><button id="workspace-menu" className="workspace-menu" aria-label="Open workspace navigation" aria-controls="workspace-sidebar" aria-expanded={navigationOpen} onClick={() => setNavigationOpen(true)}><MarketingIcon name="menu"/></button><span>{employee.name}</span><button onClick={async () => { try { const response = await apiFetch('/api/auth/logout', { method: 'POST' }); if (!response.ok) throw new Error(); configureTransport('employee'); setEmployee(null); } catch { setError('Sign-out failed. Retry before leaving this device.'); } }}>Sign out</button></header>{error && <p role="alert">{error}</p>}
      {workspace ? <MarketingWorkspace key={employee.id + JSON.stringify([employee.grants, employee.roles, employee.retailStoreIds])} identity={employee.id} section={section} setSection={navigate}/> : employee.grants.includes('asset:read:all') ? <SalesAssetsPanel identity={employee.id}/> : <p role="alert">No Marketing access is assigned. Contact your administrator.</p>}
    </main></div>;
}
