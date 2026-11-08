import { isAbsolute, relative, resolve, sep } from 'node:path';
import { isSalesCrmEnabled } from '../../../shared/sales-crm';

export const zohoOrganizationId = '821729823';
export const zohoIntegrationPath = '/api/integrations/zoho';
export const zohoRedirectUri = 'http://localhost:3001' + zohoIntegrationPath + '/callback';
export const zohoScopes = [
  'ZohoInventory.invoices.READ',
  'ZohoInventory.contacts.READ',
  'ZohoInventory.items.READ',
  'ZohoInventory.settings.READ',
] as const;
export const inventoryRegions = ['com', 'eu', 'in', 'com.au', 'jp', 'ca', 'com.cn', 'sa'] as const;
export type InventoryRegion = typeof inventoryRegions[number];

const dataCenters = [
  { location: 'us', region: 'com', accounts: 'https://accounts.zoho.com' },
  { location: 'eu', region: 'eu', accounts: 'https://accounts.zoho.eu' },
  { location: 'in', region: 'in', accounts: 'https://accounts.zoho.in' },
  { location: 'au', region: 'com.au', accounts: 'https://accounts.zoho.com.au' },
  { location: 'jp', region: 'jp', accounts: 'https://accounts.zoho.jp' },
  { location: 'ca', region: 'ca', accounts: 'https://accounts.zohocloud.ca' },
  { location: 'sa', region: 'sa', accounts: 'https://accounts.zoho.sa' },
] as const;

export function inventoryOrigin(region: InventoryRegion) {
  return 'https://www.zohoapis.' + region;
}

export function outsideCheckout(checkout: string, path: string) {
  const difference = relative(checkout, path);
  return difference === '..' || difference.startsWith('..' + sep) || isAbsolute(difference);
}

export function loadZohoConfig(env: NodeJS.ProcessEnv, checkout = process.cwd()) {
  if (env.ZOHO_ENABLED !== 'true' || !isSalesCrmEnabled(env)) return undefined;

  function required(name: string) {
    const value = env[name];
    if (!value || value !== value.trim() || /[\r\n]/.test(value)) throw new Error(name + ' is required.');
    return value;
  }

  function key(name: string) {
    const value = required(name);
    if (!/^[0-9a-f]{64}$/i.test(value)) throw new Error(name + ' must be a 32-byte hexadecimal key.');
    return Buffer.from(value, 'hex');
  }

  if (required('ZOHO_ORGANIZATION_ID') !== zohoOrganizationId) throw new Error('ZOHO_ORGANIZATION_ID is not approved.');
  if (required('ZOHO_REDIRECT_URI') !== zohoRedirectUri) throw new Error('ZOHO_REDIRECT_URI must match the documented callback.');
  const accountsUrl = required('ZOHO_ACCOUNTS_URL');
  const apiBaseUrl = required('ZOHO_API_BASE_URL');
  const center = dataCenters.find(item =>
    item.accounts === accountsUrl && inventoryOrigin(item.region) + '/inventory/v1' === apiBaseUrl,
  );
  if (!center) throw new Error('ZOHO_ACCOUNTS_URL and ZOHO_API_BASE_URL must match a supported data center.');

  const tokenStorePath = required('ZOHO_TOKEN_STORE_PATH');
  const checkoutPath = resolve(checkout);
  if (!isAbsolute(tokenStorePath) || !outsideCheckout(checkoutPath, resolve(tokenStorePath))) {
    throw new Error('ZOHO_TOKEN_STORE_PATH must be absolute and outside the checkout.');
  }
  const adminKey = key('ZOHO_LOCAL_ADMIN_KEY');
  const encryptionKey = key('ZOHO_TOKEN_ENCRYPTION_KEY');
  if (adminKey.equals(encryptionKey)) throw new Error('Zoho local operator and encryption keys must be distinct.');

  return {
    organizationId: zohoOrganizationId,
    redirectUri: zohoRedirectUri,
    clientId: required('ZOHO_CLIENT_ID'),
    clientSecret: required('ZOHO_CLIENT_SECRET'),
    accountsUrl, apiBaseUrl, location: center.location, region: center.region,
    tokenStorePath: resolve(tokenStorePath), checkoutPath, adminKey, encryptionKey,
  };
}

export type ZohoConfig = NonNullable<ReturnType<typeof loadZohoConfig>>;
