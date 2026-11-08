import { useEffect, useState } from 'react';
import { salesCrmApiWorkspace, salesCrmPath, type SalesCrmWorkspace } from '../../shared/sales-crm';
import { readDemoIdentity } from './access';
import { Dashboard, DashboardCard } from './Dashboard';
import { sections } from './sections';
import { SalesReporting } from './Reporting';

type Access =
  | { status: 'loading' }
  | { status: 'denied' }
  | { status: 'error' }
  | { status: 'ready'; workspace: SalesCrmWorkspace };

const integrationStatus = { 'not-configured': 'Not configured' };

function Notice({ heading }: { heading: string }) {
  return (
    <main className="sales-crm-notice">
      <h1>{heading}</h1>
      <a className="sales-crm-link" href="/">Return to invoice workflow</a>
    </main>
  );
}

function Workspace({ section }: { section: typeof sections[number] }) {
  const [access, setAccess] = useState<Access>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const identity = readDemoIdentity();
    if (!identity) {
      setAccess({ status: 'denied' });
      return;
    }

    async function load(identity: string) {
      try {
        const response = await fetch(salesCrmApiWorkspace, {
          headers: { 'X-Demo-Identity': identity },
          signal: controller.signal,
        });
        if ([401, 403, 404].includes(response.status)) {
          if (!controller.signal.aborted) setAccess({ status: 'denied' });
          return;
        }
        if (!response.ok) throw new Error('Workspace request failed.');
        const workspace: SalesCrmWorkspace = await response.json();
        if (!controller.signal.aborted) setAccess({ status: 'ready', workspace });
      } catch {
        if (!controller.signal.aborted) setAccess({ status: 'error' });
      }
    }

    function recheckRestoredPage(event: PageTransitionEvent) {
      if (event.persisted) {
        setAccess({ status: 'loading' });
        setAttempt(value => value + 1);
      }
    }

    void load(identity);
    window.addEventListener('pageshow', recheckRestoredPage);
    return () => {
      controller.abort();
      window.removeEventListener('pageshow', recheckRestoredPage);
    };
  }, [attempt]);

  if (access.status === 'loading') return <div className="sales-crm-notice" role="status">Loading workspace…</div>;
  if (access.status === 'denied') return <Notice heading="Workspace unavailable" />;
  if (access.status === 'error') return (
    <main className="sales-crm-notice">
      <h1>Workspace could not load</h1>
      <p role="alert">The local API request failed.</p>
      <button onClick={() => { setAccess({ status: 'loading' }); setAttempt(value => value + 1); }}>Retry</button>
    </main>
  );
  const { displayName, integrations } = access.workspace;
  const dashboard = section.path === salesCrmPath;
  const settings = section.path === salesCrmPath + '/settings';
  const reports = section.path === salesCrmPath + '/reports';

  return (
    <div className="sales-crm-shell">
      <aside className="sales-crm-sidebar">
        <a className="brand" href="/" aria-label="Dizzle home"><span className="brand-mark">d.</span> DIZZLE</a>
        <p className="eyebrow">SALES CRM</p>
        <nav aria-label="Sales CRM sections">
          {sections.map(item => (
            <a key={item.path} href={item.path} aria-current={item.path === section.path ? 'page' : undefined}>
              <span aria-hidden="true">{item.icon}</span>{item.label}
            </a>
          ))}
        </nav>
        <a className="sales-crm-link" href="/">← Invoice workflow</a>
      </aside>
      <main className="sales-crm-page">
        <header className="sales-crm-header">
          <p className="eyebrow">LOCAL DEVELOPMENT</p>
          <h1>{dashboard ? 'Sales Dashboard' : section.label}</h1>
          <p>Viewing as {displayName}. This local workspace uses synthetic data.</p>
        </header>
        {(dashboard || reports) && <SalesReporting dashboard={dashboard} />}
        {dashboard && <Dashboard />}
        {settings && (
          <section className="sales-crm-group" aria-label="Integrations">
            <h2>Integrations</h2>
            <div className="sales-crm-cards">
              <DashboardCard title="Zoho Inventory" status={integrationStatus[integrations.zohoInventory]} detail="Invoice and purchase data are pending." />
              <DashboardCard title="ShipStation" status={integrationStatus[integrations.shipStation]} detail="Shipment data is pending." />
            </div>
          </section>
        )}
        {!dashboard && !reports && (
          <section className="panel sales-crm-card">
            <h2>Development placeholder</h2>
            <p>{section.label} functionality is planned for a future phase.</p>
          </section>
        )}
      </main>
    </div>
  );
}

export default function SalesCrm() {
  const path = window.location.pathname.replace(/\/$/, '');
  const section = sections.find(item => item.path === path);
  return section ? <Workspace section={section} /> : <Notice heading="Page unavailable" />;
}
