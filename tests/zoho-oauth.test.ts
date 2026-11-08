import { describe, expect, it } from 'vitest';
import { oauthFixture } from './fixtures/zoho-oauth';
import { zohoOrganizationId, zohoRedirectUri, zohoScopes } from '../server/sales-crm/zoho/config';

describe('local Zoho OAuth connection', () => {
  it('issues a single-use, offline PKCE flow with only the four approved scopes', async () => {
    const mock = oauthFixture();
    const { auth, flow, query, ticket } = mock.begin();
    expect(auth.origin).toBe('https://accounts.zoho.com');
    expect(auth.pathname).toBe('/oauth/v2/auth');
    expect(auth.searchParams.get('scope')).toBe(zohoScopes.join(','));
    expect(auth.searchParams.get('redirect_uri')).toBe(zohoRedirectUri);
    expect(auth.searchParams.get('response_type')).toBe('code');
    expect(auth.searchParams.get('access_type')).toBe('offline');
    expect(auth.searchParams.get('prompt')).toBe('consent');
    expect(auth.searchParams.get('code_challenge_method')).toBe('S256');
    expect(auth.searchParams.has('client_secret')).toBe(false);
    expect(() => mock.connection.openStart(ticket)).toThrow('invalid-state');
    expect(mock.calls).toHaveLength(0);

    await mock.connection.complete(query, flow.browser);
    expect(mock.pkceValid).toBe(true);
    expect(mock.tokenWrites).toBe(1);
    expect(mock.calls).toEqual([
      { method: 'POST', host: 'accounts.zoho.com', path: '/oauth/v2/token', query: '' },
      { method: 'GET', host: 'www.zohoapis.com', path: '/inventory/v1/organizations', query: '' },
    ]);
    expect(await mock.connection.status()).toMatchObject({
      mode: 'read-only', connection: 'connected',
      organization: { id: zohoOrganizationId, name: 'Fixture business' },
      lastSuccessfulApiConnection: '2026-11-07T20:00:00.000Z', lastSuccessfulSync: null, lastError: null,
    });
    await expect(mock.connection.complete(query, flow.browser)).rejects.toMatchObject({ kind: 'invalid-state' });
    expect(mock.calls).toHaveLength(2);
  });

  it('rejects incorrect, duplicate, unbound or expired state before an exchange', async () => {
    const mock = oauthFixture();
    const { flow, query } = mock.begin();
    const wrong = new URLSearchParams(query);
    wrong.set('state', 'incorrect');
    await expect(mock.connection.complete(wrong, flow.browser)).rejects.toMatchObject({ kind: 'invalid-state' });
    await expect(mock.connection.complete(query, null)).rejects.toMatchObject({ kind: 'invalid-state' });
    const duplicate = new URLSearchParams(query);
    duplicate.append('state', query.get('state')!);
    await expect(mock.connection.complete(duplicate, flow.browser)).rejects.toMatchObject({ kind: 'invalid-state' });
    mock.moveClock(600_001);
    await expect(mock.connection.complete(query, flow.browser)).rejects.toMatchObject({ kind: 'invalid-state' });
    expect(mock.calls).toHaveLength(0);
  });

  it.each(['invalid-code', 'rejected-credentials', 'wrong-org', 'wrong-callback-region', 'wrong-token-region', 'overbroad-scope', 'denied'] as const)(
    'fails safely for %s without storing a grant', async scenario => {
      const mock = oauthFixture();
      const { flow, query } = mock.begin();
      if (scenario === 'invalid-code') query.set('code', 'invalid-or-expired');
      if (scenario === 'rejected-credentials') mock.rejectGrant();
      if (scenario === 'wrong-org') mock.wrongOrganization();
      if (scenario === 'wrong-callback-region') query.set('accounts-server', 'https://example.invalid');
      if (scenario === 'wrong-token-region') mock.tokenDomain('https://www.zohoapis.eu');
      if (scenario === 'overbroad-scope') mock.grantScopes(zohoScopes.join(',') + ',ZohoInventory.invoices.CREATE');
      if (scenario === 'denied') query.set('error', 'access_denied');
      const kind = ({
        'invalid-code': 'oauth-rejected', 'rejected-credentials': 'oauth-rejected',
        'wrong-org': 'wrong-organization', 'wrong-callback-region': 'wrong-region',
        'wrong-token-region': 'wrong-region', 'overbroad-scope': 'oauth-rejected', denied: 'oauth-denied',
      } as const)[scenario];
      await expect(mock.connection.complete(query, flow.browser)).rejects.toMatchObject({
        kind, message: 'Zoho integration: ' + kind,
      });
      expect(mock.tokenWrites).toBe(0);
      expect(await mock.connection.status()).toMatchObject({ connection: 'not-connected', lastError: kind });
      if (scenario === 'wrong-callback-region' || scenario === 'denied') expect(mock.calls).toHaveLength(0);
    },
  );

  it('refreshes on 401 and explicitly reads at most one invoice, contact and item', async () => {
    const mock = oauthFixture();
    const { flow, query } = mock.begin();
    await mock.connection.complete(query, flow.browser);
    mock.expireToken();
    mock.moveClock(1000);
    const before = mock.calls.length;
    expect(await mock.connection.sample()).toEqual({ invoiceCount: 1, contactCount: 1, itemCount: 1 });
    const calls = mock.calls.slice(before);
    expect(calls.filter(call => call.method === 'POST').map(call => [call.host, call.path])).toEqual([
      ['accounts.zoho.com', '/oauth/v2/token'],
    ]);
    const lists = calls.filter(call => /\/(invoices|contacts|items)$/.test(call.path));
    expect(lists).toHaveLength(3);
    expect(lists.every(call => new URLSearchParams(call.query).get('per_page') === '1')).toBe(true);
    expect(calls.filter(call => call.path.endsWith('/invoices/1001'))).toHaveLength(1);
    expect(await mock.connection.status()).toMatchObject({
      lastSuccessfulSync: '2026-11-07T20:00:01.000Z', lastError: null,
    });
  });

  it('loads a saved authorization without networking and refreshes only on an explicit read', async () => {
    const mock = oauthFixture();
    const { flow, query } = mock.begin();
    await mock.connection.complete(query, flow.browser);
    const resumed = mock.createConnection();
    const calls = mock.calls.length;
    expect(await resumed.status()).toMatchObject({ connection: 'authorization-saved', lastSuccessfulSync: null });
    expect(mock.calls).toHaveLength(calls);
    await resumed.sample();
    expect(mock.calls[calls]).toMatchObject({ method: 'POST', path: '/oauth/v2/token', query: '' });
  });

  it('keeps the last good sync on throttling and safely retries an explicit sample', async () => {
    const mock = oauthFixture();
    const { flow, query } = mock.begin();
    await mock.connection.complete(query, flow.browser);
    await mock.connection.sample();
    mock.moveClock(10_000);
    mock.failList(true);
    await expect(mock.connection.sample()).rejects.toMatchObject({ kind: 'rate-limited' });
    expect(mock.delays).toEqual([2000, 2000]);
    expect(await mock.connection.status()).toMatchObject({
      lastSuccessfulSync: '2026-11-07T20:00:00.000Z', lastError: 'rate-limited',
    });
    mock.failList(false);
    expect(await mock.connection.sample()).toEqual({ invoiceCount: 1, contactCount: 1, itemCount: 1 });
    expect(await mock.connection.status()).toMatchObject({
      lastSuccessfulSync: '2026-11-07T20:00:10.000Z', lastError: null,
    });
  });

  it('prevents overlapping samples and preserves a working grant if reconnect fails', async () => {
    const mock = oauthFixture();
    const first = mock.begin();
    await mock.connection.complete(first.query, first.flow.browser);
    let release = () => {};
    mock.pauseList(new Promise<void>(resolve => { release = resolve; }));
    const running = mock.connection.sample();
    try {
      await expect(mock.connection.sample()).rejects.toMatchObject({ kind: 'busy' });
      expect(() => mock.connection.issueStart()).toThrow('busy');
    } finally { release(); }
    await running;

    const reconnect = mock.begin();
    mock.wrongOrganization();
    await expect(mock.connection.complete(reconnect.query, reconnect.flow.browser))
      .rejects.toMatchObject({ kind: 'wrong-organization' });
    expect(mock.tokenWrites).toBe(1);
    expect(await mock.connection.status()).toMatchObject({ connection: 'connected', lastError: 'wrong-organization' });
  });
});
