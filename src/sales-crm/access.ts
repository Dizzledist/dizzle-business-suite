export const salesCrmDevEnabled = import.meta.env.SALES_CRM_ENABLED === true;

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

export function readDemoIdentity() {
  try {
    return window.sessionStorage.getItem(selectionKey);
  } catch {
    return null;
  }
}
