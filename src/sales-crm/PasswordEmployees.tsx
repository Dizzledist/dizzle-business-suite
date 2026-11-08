import { useState } from 'react';
import { accountStatuses, salesAuthApi, salesRoleLabels, salesRoles, type SalesDirectory } from '../../shared/sales-auth';
import { requestSales } from './access';

const usersApi = salesAuthApi + '/admin/users';

function RoleField({ initial = 'sales_rep' }: { initial?: string }) {
  return <label>Role <select name="role" defaultValue={initial}>
    {salesRoles.map(role => <option key={role} value={role}>{salesRoleLabels[role]}</option>)}
  </select></label>;
}

export function PasswordEmployees({ users, csrf, onSaved }: {
  users: SalesDirectory['users']; csrf: string; onSaved: () => void;
}) {
  const [selected, setSelected] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [issued, setIssued] = useState<{ code: string; purpose: string; expiresAt: string }>();
  const user = users.find(item => item.id === selected);

  async function send(path: string, method: 'POST' | 'PUT', data?: object) {
    setBusy(true);
    setError('');
    setNotice('');
    setIssued(undefined);
    try {
      const response = await requestSales(path, {
        method, headers: { 'X-CSRF-Token': csrf, ...(data ? { 'Content-Type': 'application/json' } : {}) },
        ...(data ? { body: JSON.stringify(data) } : {}),
      });
      const result = await response.json();
      if (!response.ok) {
        setError(typeof result.error === 'string' ? result.error : 'The employee request failed.');
        return;
      }
      if (typeof result.code === 'string') setIssued(result);
      else setNotice('Employee settings saved.');
      onSaved();
    } catch {
      setError('The employee request failed. Try again.');
    } finally {
      setBusy(false);
    }
  }

  return <div className="panel sales-crm-card employee-management">
    <h2>Create Employee Account</h2>
    <p>Verify the company email independently. Share a setup or reset code only through a trusted private channel.</p>
    <form className="employee-form" onSubmit={event => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      void send(usersApi, 'POST', {
        name: form.get('name'), email: form.get('email'), role: form.get('role'),
        department: form.get('department'), team: form.get('team') || null,
      });
    }}>
      <label>Name<input name="name" required maxLength={150} /></label>
      <label>Company email<input name="email" type="email" required maxLength={254} /></label>
      <RoleField />
      <label>Department<input name="department" required maxLength={80} defaultValue="sales" /></label>
      <label>Team<input name="team" maxLength={80} /></label>
      <button type="submit" disabled={busy}>Create Account and Setup Code</button>
    </form>

    <h2>Manage Employee</h2>
    <label>Employee <select value={selected} onChange={event => { setSelected(event.target.value); setIssued(undefined); }}>
      <option value="">Choose an employee</option>
      {users.map(item => <option key={item.id} value={item.id}>{item.name} · {item.email}</option>)}
    </select></label>
    {user && <>
      <form className="employee-form" key={[user.id, user.role, user.status, user.department, user.team].join(':')} onSubmit={event => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        void send(usersApi + '/' + user.id + '/access', 'PUT', {
          role: form.get('role'), status: form.get('status'), department: form.get('department'), team: form.get('team') || null,
        });
      }}>
        <RoleField initial={user.role} />
        <label>Status <select name="status" defaultValue={user.status}>
          {accountStatuses.filter(status => status !== 'active' || user.status === 'active' || user.passwordStatus === 'ready').map(status =>
            <option key={status} value={status}>{status}</option>)}
        </select></label>
        <label>Department<input name="department" defaultValue={user.department} required maxLength={80} /></label>
        <label>Team<input name="team" defaultValue={user.team ?? ''} maxLength={80} /></label>
        <button type="submit" disabled={busy}>Save Access</button>
      </form>
      {user.resetRequestedAt && <p>Reset requested {new Date(user.resetRequestedAt).toLocaleString()}.</p>}
      <div className="company-controls">
        <button type="button" disabled={busy || user.status === 'disabled'}
          onClick={() => void send(usersApi + '/' + user.id + '/credential', 'POST')}>
          {user.passwordStatus === 'ready' ? 'Issue Password Reset Code' : 'Issue Password Setup Code'}
        </button>
        <button type="button" disabled={busy} onClick={() => void send(usersApi + '/' + user.id + '/revoke', 'POST')}>Revoke Sessions</button>
      </div>
    </>}
    {error && <p role="alert">{error}</p>}
    {notice && <p role="status">{notice}</p>}
    {issued && <section aria-label="Private one-time password code">
      <p>One-time {issued.purpose} code</p>
      <code>{issued.code}</code>
      <p>Expires <time dateTime={issued.expiresAt}>{new Date(issued.expiresAt).toLocaleString()}</time>.</p>
      <button type="button" onClick={() => setIssued(undefined)}>Hide Code</button>
    </section>}
  </div>;
}
