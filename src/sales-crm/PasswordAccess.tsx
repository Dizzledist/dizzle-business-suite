import { useState, type FormEvent } from 'react';
import { passwordAuthApi, type SalesSessionView } from '../../shared/sales-auth';
import { requestSales, sessionEndedEvent } from './access';

type Mode = 'login' | 'forgot' | 'redeem';

export async function submitPasswordRequest(path: string, values: object, csrf?: string) {
  const response = await requestSales(passwordAuthApi + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(csrf ? { 'X-CSRF-Token': csrf } : {}) },
    body: JSON.stringify(values),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(typeof result.error === 'string' ? result.error : 'The request failed.');
}

export function PasswordSignIn({ onSignIn }: { onSignIn: () => void }) {
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  function select(next: Mode) {
    setMode(next);
    setNotice('');
    setError('');
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const password = form.get('password');
    if (mode === 'redeem' && password !== form.get('confirmation')) {
      setError('The new passwords do not match.');
      return;
    }
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const result = { email, ...(mode === 'forgot' ? {} : { password }),
        ...(mode === 'redeem' ? { code: form.get('code') } : {}) };
      await submitPasswordRequest('/' + mode, result);
      if (mode === 'login') onSignIn();
      if (mode === 'forgot') setNotice('If your account is eligible, an administrator can verify your identity and provide a reset code.');
      if (mode === 'redeem') {
        setMode('login');
        setNotice('Password saved. Sign in with your new password.');
      }
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'The request failed.');
    } finally {
      setBusy(false);
    }
  }

  return <>
    <form className="password-form" key={mode} onSubmit={event => void submit(event)}>
      <label>Company email
        <input name="email" type="email" autoComplete="username" required maxLength={254}
          value={email} onChange={event => setEmail(event.target.value)} />
      </label>
      {mode === 'redeem' && <label>Setup or reset code
        <input name="code" type="password" required maxLength={43} autoComplete="off" spellCheck={false} />
      </label>}
      {mode !== 'forgot' && <label>{mode === 'redeem' ? 'New password' : 'Password'}
        <input name="password" type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
          required maxLength={1024} />
      </label>}
      {mode === 'redeem' && <label>Confirm new password
        <input name="confirmation" type="password" autoComplete="new-password" required maxLength={1024} />
      </label>}
      <button type="submit" disabled={busy}>
        {mode === 'login' ? 'Sign In' : mode === 'forgot' ? 'Request Password Reset' : 'Save Password'}
      </button>
    </form>
    {error && <p role="alert">{error}</p>}
    {notice && <p role="status">{notice}</p>}
    <div className="company-controls">
      {mode !== 'forgot' && <button type="button" disabled={busy} onClick={() => select('forgot')}>Forgot Password</button>}
      {mode !== 'redeem' && <button type="button" disabled={busy} onClick={() => select('redeem')}>Use Setup or Reset Code</button>}
      {mode !== 'login' && <button type="button" disabled={busy} onClick={() => select('login')}>Back to Sign In</button>}
    </div>
  </>;
}

export function AccountPassword({ session }: { session: SalesSessionView }) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function change(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const password = form.get('password');
    if (password !== form.get('confirmation')) {
      setError('The new passwords do not match.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await submitPasswordRequest('/change', { current: form.get('current'), password }, session.csrfToken);
      window.dispatchEvent(new Event(sessionEndedEvent));
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'The request failed.');
    } finally {
      setBusy(false);
    }
  }

  return <section className="panel sales-crm-card" aria-labelledby="change-password-title">
    <h2 id="change-password-title">Change Password</h2>
    <p>Use at least 15 characters. Saving signs out your current sessions.</p>
    <form className="password-form" onSubmit={event => void change(event)}>
      <label>Current password<input name="current" type="password" autoComplete="current-password" required maxLength={1024} /></label>
      <label>New password<input name="password" type="password" autoComplete="new-password" required maxLength={1024} /></label>
      <label>Confirm new password<input name="confirmation" type="password" autoComplete="new-password" required maxLength={1024} /></label>
      <button type="submit" disabled={busy}>Save New Password</button>
    </form>
    {error && <p role="alert">{error}</p>}
  </section>;
}
