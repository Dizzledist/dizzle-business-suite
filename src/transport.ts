let mode: 'employee' | 'fixture' = 'employee';
let csrf = '';
export function configureTransport(value: 'employee' | 'fixture', token = '') { mode = value; csrf = token; }
export async function apiFetch(input: string, init: RequestInit = {}, fixtureIdentity?: string) {
  const headers = new Headers(init.headers); headers.delete('X-Demo-Identity');
  if (mode === 'fixture' && fixtureIdentity) headers.set('X-Demo-Identity', fixtureIdentity);
  if (mode === 'employee' && !['GET', 'HEAD'].includes(init.method ?? 'GET')) headers.set('X-CSRF-Token', csrf);
  const response = await fetch(input, { ...init, credentials: 'same-origin', headers });
  if (mode === 'employee' && response.status === 401) window.dispatchEvent(new Event('dizzle-session-expired'));
  return response;
}
