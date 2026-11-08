import { useState, type FormEvent } from 'react';
import { accountStatuses, salesAuthApi, salesRoleLabels, salesRoles, type SalesDirectory } from '../../shared/sales-auth';
import { requestSales } from './access';

const employeeApi = salesAuthApi + '/admin/users';

function RoleField({ initial = 'sales_rep' }: { initial?: string }) {
  return <label>Role <select name="role" defaultValue={initial}>
    {salesRoles.map(role => <option key={role} value={role}>{salesRoleLabels[role]}</option>)}
  </select></label>;
}

export function EmployeeManagement({ users, csrf, onSaved }: {
  users: SalesDirectory['users']; csrf: string; onSaved: () => void;
}) {
  const [selected, setSelected] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [invitation, setInvitation] = useState<{ invitation: string; expiresAt: string }>();
  const user = users.find(item => item.id === selected);

  async function send(path: string, method: 'POST' | 'PUT', data?: object | null) {
    setBusy(true);
    setError('');
    setNotice('');
    setInvitation(undefined);
    try {
      const response = await requestSales(path, {
        method,
        headers: { 'X-CSRF-Token': csrf, ...(data === undefined ? {} : { 'Content-Type': 'application/json' }) },
        ...(data === undefined ? {} : { body: JSON.stringify(data) }),
      });
      const result = await response.json();
      if (!response.ok) {
        setError(typeof result.error === 'string' ? result.error : 'The employee request failed.');
        return;
      }
      if (typeof result.invitation === 'string' && typeof result.expiresAt === 'string') {
        setInvitation({ invitation: result.invitation, expiresAt: result.expiresAt });
      } else setNotice('Employee settings saved.');
      onSaved();
    } catch {
      setError('The employee request failed. Try again.');
    } finally {
      setBusy(false);
    }
  }

  function fields(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    return new FormData(event.currentTarget);
  }

  return <div className="panel sales-crm-card employee-management">
    <h2>Approve an employee</h2>
    <p>Verify the employee’s Google address independently and share the one-time invitation through a trusted private channel.</p>
    <form className="employee-form" onSubmit={event => {
      const form = fields(event);
      void send(employeeApi, 'POST', {
        name: form.get('name'), email: form.get('email'), department: form.get('department'),
        role: form.get('role'), team: form.get('team') || null,
      });
    }}>
      <label>Name<input name="name" required maxLength={150} /></label>
      <label>Google email<input name="email" type="email" required maxLength={254} /></label>
      <RoleField />
      <label>Department<input name="department" required maxLength={80} defaultValue="sales" /></label>
      <label>Team<input name="team" maxLength={80} /></label>
      <button type="submit" disabled={busy}>Approve and issue invitation</button>
    </form>

    <h2>Manage an employee</h2>
    <label>Employee <select value={selected} onChange={event => setSelected(event.target.value)}>
      <option value="">Choose an employee</option>
      {users.map(item => <option key={item.id} value={item.id}>{item.name} · {item.email}</option>)}
    </select></label>
    {user && <>
      <form className="employee-form" key={[user.id, user.role, user.status, user.department, user.team].join(':')} onSubmit={event => {
        const form = fields(event);
        void send(employeeApi + '/' + user.id + '/access', 'PUT', {
          role: form.get('role'), status: form.get('status'), department: form.get('department'), team: form.get('team') || null,
        });
      }}>
        <RoleField initial={user.role} />
        <label>Status <select name="status" defaultValue={user.status}>
          {accountStatuses.filter(status => user.googleLinked || status !== 'active').map(status => (
            <option key={status} value={status}>{status}</option>
          ))}
        </select></label>
        <label>Department<input name="department" defaultValue={user.department} required maxLength={80} /></label>
        <label>Team<input name="team" defaultValue={user.team ?? ''} maxLength={80} /></label>
        <button type="submit" disabled={busy}>Save access</button>
      </form>
      {!user.googleLinked && user.status === 'pending' && <button type="button" disabled={busy}
        onClick={() => void send(employeeApi + '/' + user.id + '/invitation', 'POST')}>Replace invitation</button>}

      <form className="employee-form" key={user.id + '-mapping-' + (user.zohoSalespersonId ?? '')} onSubmit={event => {
        const form = fields(event);
        void send(employeeApi + '/' + user.id + '/mapping', 'PUT', {
          salespersonId: form.get('salesperson'), verificationReference: form.get('evidence'),
        });
      }}>
        <label>Zoho salesperson ID<input name="salesperson" inputMode="numeric" required maxLength={40}
          defaultValue={user.zohoSalespersonId ?? ''} /></label>
        <label>Verification reference<input name="evidence" required maxLength={64} /></label>
        <button type="submit" disabled={busy}>Save mapping</button>
        {user.zohoSalespersonId && <button type="button" disabled={busy}
          onClick={() => void send(employeeApi + '/' + user.id + '/mapping', 'PUT', null)}>Remove mapping</button>}
      </form>
    </>}
    {error && <p role="alert">{error}</p>}
    {notice && <p role="status">{notice}</p>}
    {invitation && <section aria-label="Private one-time invitation">
      <p>One-time invitation</p>
      <code>{invitation.invitation}</code>
      <p>Expires <time dateTime={invitation.expiresAt}>{new Date(invitation.expiresAt).toLocaleString()}</time>.</p>
      <button type="button" onClick={() => setInvitation(undefined)}>Hide invitation</button>
    </section>}
  </div>;
}
