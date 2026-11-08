import { passwordAuthApi, salesAuthApi } from '../../shared/sales-auth';

export const salesCrmDevEnabled = import.meta.env.SALES_CRM_ENABLED === true;
export const salesCrmSessionEnabled = import.meta.env.SALES_CRM_AUTH_ENABLED === true;
export const sessionEndedEvent = 'dizzle:sales-session-ended';

const selectionKey = 'dizzle.sales-crm.demo-identity';

// Carry the existing local selector across CRM links in this tab. The API still
// resolves and checks this fixture identity for each request.
export function rememberDemoIdentity(identity: string) {
  try {
    window.sessionStorage.setItem(selectionKey, identity);
  } catch {
    // A blocked store leaves direct CRM entry unavailable.
  }
}

function readDemoIdentity() {
  try {
    return window.sessionStorage.getItem(selectionKey);
  } catch {
    return null;
  }
}

export async function requestSales(path: string, options: RequestInit = {}) {
  const headers = new Headers(options.headers);
  if (!salesCrmSessionEnabled) {
    const identity = readDemoIdentity();
    if (identity) headers.set('X-Demo-Identity', identity);
  }
  const response = await fetch(path, { ...options, headers, credentials: 'same-origin', cache: 'no-store' });
  if (salesCrmSessionEnabled && response.status === 401 && path !== salesAuthApi + '/session' &&
      path !== passwordAuthApi + '/login' && !options.signal?.aborted) {
    window.dispatchEvent(new Event(sessionEndedEvent));
  }
  return response;
}
