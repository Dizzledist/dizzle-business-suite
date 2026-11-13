import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ManagementSalesSummary } from '../../src/ManagementSalesSummary';
import { configureTransport } from '../../src/transport';
import { managementDashboards } from '../../shared/retail-reporting';
import '../../src/styles.css';
function Preview() {
  const [ready, setReady] = useState(false), [error, setError] = useState('');
  useEffect(() => { void fetch('/api/auth/session').then(async r => { if (!r.ok) throw new Error('Sign in through the retail demo first.'); const data = await r.json(); configureTransport('employee', data.csrfToken); setReady(true); }).catch(e => setError(e.message)); }, []);
  return <div style={{ maxWidth: 1000, margin: '40px auto', padding: 24 }}><h1>Management reporting adoption preview</h1><p>DEMO ONLY · shared component preview. Owner, Admin and Sales Manager dashboards are not merged on main; this page is not a substitute dashboard.</p><a href="/">Back to Marketing sign-in</a>{error && <p role="alert">{error}</p>}{ready && managementDashboards.map(dashboard => <ManagementSalesSummary key={dashboard} dashboard={dashboard} from="2026-10-15" to="2026-11-13"/>)}</div>;
}
createRoot(document.getElementById('root')!).render(<Preview/>);
