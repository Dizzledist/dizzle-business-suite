import { useEffect, useState, type ReactNode } from 'react';
import { passwordAuthApi, salesAuthApi, salesRoleLabels, type SalesDirectory, type SalesSessionView } from '../../shared/sales-auth';
import { PasswordSignIn } from './PasswordAccess';
import { PasswordEmployees } from './PasswordEmployees';
import { requestSales, sessionEndedEvent } from './access';

type Access = { state: 'loading' } | { state: 'error' } | { state: 'signed-out'; expired: boolean }
  | { state: 'ready'; session: SalesSessionView };

function SignIn({ expired, configured, onSignIn }: {
  expired: boolean; configured: boolean; onSignIn: () => void;
}) {
  return <main className="sales-crm-notice company-sign-in">
    <section className="panel sales-crm-card" aria-labelledby="company-sign-in-title">
      <p className="eyebrow">DIZZLE BUSINESS SUITE</p>
      <h1 id="company-sign-in-title">Company sign-in</h1>
      {expired && <p role="status">Your session ended. Sign in again to open the Sales CRM.</p>}
      {configured ? <PasswordSignIn onSignIn={onSignIn} /> : <>
        <p>Use your company account to access the Sales CRM after company sign-in is configured.</p>
        <button type="button" disabled>Company sign-in pending setup</button>
      </>}
      <a className="sales-crm-link" href="/">Return to the local workspace</a>
    </section>
  </main>;
}

export function CompanyAccess({ children }: {
  children: (session: SalesSessionView, controls: ReactNode) => ReactNode;
}) {
  const [access, setAccess] = useState<Access>({ state: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [logout, setLogout] = useState<'idle' | 'busy' | 'error'>('idle');
  const [passwordConfigured, setPasswordConfigured] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    const expired = () => setAccess({ state: 'signed-out', expired: true });
    const restore = (event: PageTransitionEvent) => {
      if (event.persisted) {
        setAccess({ state: 'loading' });
        setAttempt(value => value + 1);
      }
    };
    async function load() {
      try {
        const response = await requestSales(salesAuthApi + '/session', { signal: controller.signal });
        if (response.status === 401) {
          if (!controller.signal.aborted) setAccess({ state: 'signed-out', expired: false });
          return;
        }
        if (!response.ok) throw new Error('Session unavailable.');
        const session: SalesSessionView = await response.json();
        if (!controller.signal.aborted) setAccess({ state: 'ready', session });
      } catch {
        if (!controller.signal.aborted) setAccess({ state: 'error' });
      }
    }
    void load();
    void requestSales(passwordAuthApi + '/status', { signal: controller.signal }).then(async response => {
      if (!response.ok) return;
      const result = await response.json();
      if (!controller.signal.aborted) setPasswordConfigured(result.configured === true);
    }).catch(() => {});
    window.addEventListener(sessionEndedEvent, expired);
    window.addEventListener('pageshow', restore);
    return () => {
      controller.abort();
      window.removeEventListener(sessionEndedEvent, expired);
      window.removeEventListener('pageshow', restore);
    };
  }, [attempt]);

  useEffect(() => {
    if (access.state !== 'ready') return;
    const timeout = window.setTimeout(() => setAccess({ state: 'signed-out', expired: true }),
      Math.max(0, Date.parse(access.session.expiresAt) - Date.now()));
    return () => window.clearTimeout(timeout);
  }, [access]);

  if (access.state === 'loading') return <main className="sales-crm-notice" role="status">Checking company session…</main>;
  if (access.state === 'error') return <main className="sales-crm-notice">
    <h1>Company sign-in is unavailable</h1>
    <p role="alert">The session could not be checked. Try again.</p>
    <button type="button" onClick={() => { setAccess({ state: 'loading' }); setAttempt(value => value + 1); }}>Retry</button>
  </main>;
  if (access.state === 'signed-out') return <SignIn expired={access.expired} configured={passwordConfigured}
    onSignIn={() => { setAccess({ state: 'loading' }); setAttempt(value => value + 1); }} />;

  const session = access.session;
  async function signOut() {
    setLogout('busy');
    try {
      const response = await requestSales(salesAuthApi + '/logout', {
        method: 'POST', headers: { 'X-CSRF-Token': session.csrfToken },
      });
      if (!response.ok) throw new Error('Logout failed.');
      setAccess({ state: 'signed-out', expired: false });
      setLogout('idle');
    } catch {
      setLogout('error');
    }
  }

  return children(session, <div className="company-controls">
    <span>{salesRoleLabels[session.role]}</span>
    {session.email && <span>{session.email}</span>}
    <button type="button" disabled={logout === 'busy'} onClick={() => void signOut()}>Sign out</button>
    {logout === 'error' && <span role="alert">Sign-out could not be verified. Try again.</span>}
  </div>);
}

export function UserDirectory({ session }: { session: SalesSessionView }) {
  const [data, setData] = useState<SalesDirectory>();
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await requestSales(salesAuthApi + '/admin', { signal: controller.signal });
        if (!response.ok) throw new Error('Directory unavailable.');
        const result: SalesDirectory = await response.json();
        if (!controller.signal.aborted) setData(result);
      } catch {
        if (!controller.signal.aborted) setError(true);
      }
    }
    void load();
    return () => controller.abort();
  }, [attempt]);

  const userNames = new Map(data?.users.map(user => [user.id, user.name]));
  return <section className="sales-crm-group" aria-label="Company user directory">
    {!session.email && <p>Employee account changes require the configured sign-in method.</p>}
    {error && <p role="alert">The directory could not load. <button type="button" onClick={() => {
      setError(false);
      setAttempt(value => value + 1);
    }}>Retry</button></p>}
    {!data && !error && <p role="status">Loading user directory…</p>}
    {data && <>
      {session.email && <PasswordEmployees users={data.users} csrf={session.csrfToken} onSaved={() => setAttempt(value => value + 1)} />}
      <div className="reporting-table" tabIndex={0} role="region" aria-label="User table">
        <table>
          <thead><tr>{['Name', 'Email', 'Role', 'Department', 'Team', 'Status', 'Zoho salesperson']
            .map(label => <th key={label} scope="col">{label}</th>)}</tr></thead>
          <tbody>{data.users.map(user => <tr key={user.id}>
            <th scope="row">{user.name}</th>
            <td>{user.email}</td><td>{salesRoleLabels[user.role]}</td><td>{user.department}</td><td>{user.team ?? 'Unassigned'}</td>
            <td>{user.status}{user.passwordStatus && user.passwordStatus !== 'ready' ? ' · Password setup needed' : ''}
              {user.resetRequestedAt ? ' · Reset requested' : ''}</td><td>{user.zohoSalespersonId ?? 'Unmapped'}</td>
          </tr>)}</tbody>
        </table>
      </div>
      {!data.users.length && <p>No users have been provisioned.</p>}
      <h2>Recent access activity</h2>
      {data.audit.length ? <ul className="company-audit">
        {data.audit.map((entry, index) => <li key={entry.at + '-' + index}>
          <time dateTime={entry.at}>{entry.at}</time> · {entry.action.replaceAll('-', ' ')}
          {userNames.has(entry.targetId) && <> · {userNames.get(entry.targetId)}</>}
        </li>)}
      </ul> : <p>No access activity recorded.</p>}
    </>}
  </section>;
}
