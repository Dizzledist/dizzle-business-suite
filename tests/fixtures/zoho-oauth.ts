import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadZohoConfig, zohoOrganizationId, zohoRedirectUri, zohoScopes } from '../../server/sales-crm/zoho/config';
import { createZohoConnection } from '../../server/sales-crm/zoho/connection';
import type { ZohoTokenStore } from '../../server/sales-crm/zoho/token-store';
import { invoiceResponse, pageResponse } from './zoho-invoices';

export const oauthFixtureEnv = {
  SALES_CRM_ENABLED: 'true', ZOHO_ENABLED: 'true', NODE_ENV: 'test',
  ZOHO_ORGANIZATION_ID: zohoOrganizationId,
  ZOHO_CLIENT_ID: 'fixture-client',
  ZOHO_CLIENT_SECRET: 'fixture-client-secret',
  ZOHO_REDIRECT_URI: zohoRedirectUri,
  ZOHO_ACCOUNTS_URL: 'https://accounts.zoho.com',
  ZOHO_API_BASE_URL: 'https://www.zohoapis.com/inventory/v1',
  ZOHO_LOCAL_ADMIN_KEY: '01'.repeat(32),
  ZOHO_TOKEN_ENCRYPTION_KEY: '02'.repeat(32),
  ZOHO_TOKEN_STORE_PATH: join(tmpdir(), 'zoho-fixture.enc'),
};

export function oauthFixture() {
  const config = loadZohoConfig(oauthFixtureEnv)!;
  let now = Date.parse('2026-11-07T20:00:00Z');
  let refreshToken: string | null = null;
  let organizationId: string = zohoOrganizationId;
  let rejectGrant = false;
  let tokenExpired = false;
  let listFailure = false;
  let returnedScope = zohoScopes.join(',');
  let echoedDomain = 'https://www.zohoapis.com';
  let expectedChallenge = '';
  let pkceValid = false;
  let tokenWrites = 0;
  let blockedList: Promise<void> | undefined;
  const delays: number[] = [];
  const calls: { method: string; host: string; path: string; query: string }[] = [];
  const store: ZohoTokenStore = {
    async load() { return refreshToken; },
    async save(value) { refreshToken = value; tokenWrites++; },
  };
  const transport: typeof fetch = async (input, init) => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    const path = url.pathname;
    calls.push({ method: request.method, host: url.hostname, path, query: url.search });
    if (url.origin === config.accountsUrl && path === '/oauth/v2/token' && request.method === 'POST') {
      const body = new URLSearchParams(await request.text());
      if (body.get('grant_type') === 'authorization_code') {
        pkceValid = createHash('sha256').update(body.get('code_verifier') ?? '').digest('base64url') === expectedChallenge &&
          body.get('redirect_uri') === config.redirectUri && body.get('client_secret') === config.clientSecret;
        if (rejectGrant) return Response.json({ error: 'invalid_client' });
        if (body.get('code') !== 'fixture-code') return Response.json({ error: 'invalid_code' });
        return Response.json({
          access_token: 'fixture-access', refresh_token: 'fixture-refresh', expires_in: 3600,
          scope: returnedScope, api_domain: echoedDomain,
        });
      }
      if (body.get('grant_type') === 'refresh_token' && body.get('refresh_token') === 'fixture-refresh') {
        tokenExpired = false;
        return Response.json({ access_token: 'fixture-new-access', expires_in: 3600 });
      }
      return Response.json({ error: 'invalid_client' });
    }
    if (request.method !== 'GET' || url.origin !== 'https://www.zohoapis.com') return new Response(null, { status: 405 });
    if (tokenExpired) return new Response(null, { status: 401 });
    if (path.endsWith('/organizations')) {
      return Response.json({ code: 0, organizations: [{ organization_id: organizationId, name: 'Fixture business', is_org_active: true }] });
    }
    if (url.searchParams.get('organization_id') !== zohoOrganizationId) return new Response(null, { status: 403 });
    if (path.endsWith('/invoices')) {
      await blockedList;
      return listFailure ? new Response(null, { status: 429, headers: { 'Retry-After': '2' } }) : pageResponse(1, ['1001'], true);
    }
    if (path.endsWith('/invoices/1001')) return invoiceResponse();
    const page_context = { page: 1, has_more_page: true };
    if (path.endsWith('/contacts')) return Response.json({
      code: 0, page_context, contacts: [{ contact_id: '801', contact_name: 'Fixture account', contact_type: 'customer', email: 'omit@example.invalid' }],
    });
    if (path.endsWith('/items')) return Response.json({
      code: 0, page_context, items: [{ item_id: '501', name: 'Fixture item', sku: 'TEST' }],
    });
    return new Response(null, { status: 404 });
  };

  function createConnection() {
    return createZohoConnection(config, { transport, store, now: () => now, wait: async delay => { delays.push(delay); } });
  }
  const connection = createConnection();

  function begin() {
    const ticket = new URL(connection.issueStart()).searchParams.get('ticket');
    const flow = connection.openStart(ticket);
    const auth = new URL(flow.url);
    expectedChallenge = auth.searchParams.get('code_challenge') ?? '';
    const query = new URLSearchParams({
      state: auth.searchParams.get('state') ?? '',
      code: 'fixture-code', location: 'us', 'accounts-server': config.accountsUrl,
    });
    return { ticket, flow, auth, query };
  }

  return {
    config, connection, createConnection, calls, delays, begin,
    expectChallenge(value: string) { expectedChallenge = value; },
    get pkceValid() { return pkceValid; },
    get tokenWrites() { return tokenWrites; },
    moveClock(ms: number) { now += ms; },
    wrongOrganization() { organizationId = '999'; },
    rejectGrant() { rejectGrant = true; },
    expireToken() { tokenExpired = true; },
    failList(value: boolean) { listFailure = value; },
    grantScopes(value: string) { returnedScope = value; },
    tokenDomain(value: string) { echoedDomain = value; },
    pauseList(value: Promise<void>) { blockedList = value; },
  };
}
