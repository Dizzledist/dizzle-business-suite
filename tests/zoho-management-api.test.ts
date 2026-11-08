import { once } from 'node:events';
import { request as httpRequest, type IncomingHttpHeaders } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApi } from '../server/api';
import { zohoIntegrationPath } from '../server/sales-crm/zoho/config';
import { oauthFixture, oauthFixtureEnv } from './fixtures/zoho-oauth';

let api: ReturnType<typeof createApi> | undefined;

async function start(enabled = true) {
  const mock = oauthFixture();
  vi.stubEnv('SALES_CRM_ENABLED', enabled ? 'true' : 'false');
  api = createApi(undefined, { config: mock.config, connection: mock.connection });
  api.listen(0, '127.0.0.1');
  await once(api, 'listening');
  const port = (api.address() as AddressInfo).port;

  function request(method: string, path: string, headers: Record<string, string> = {}) {
    return new Promise<{ status: number; headers: IncomingHttpHeaders; body: string }>((resolve, reject) => {
      const req = httpRequest({
        host: '127.0.0.1', port, method, path: zohoIntegrationPath + path,
        headers: { Host: 'localhost:3001', ...headers },
      }, response => {
        let body = '';
        response.setEncoding('utf8');
        response.on('data', chunk => { body += chunk; });
        response.on('end', () => resolve({ status: response.statusCode!, headers: response.headers, body }));
      });
      req.on('error', reject);
      req.end();
    });
  }

  const admin = { 'X-Demo-Identity': 'admin', 'X-Zoho-Local-Admin-Key': oauthFixtureEnv.ZOHO_LOCAL_ADMIN_KEY };
  return { mock, request, admin };
}

afterEach(async () => {
  if (api) {
    const running = api;
    api = undefined;
    running.closeAllConnections();
    await new Promise<void>(resolve => running.close(() => resolve()));
  }
  vi.unstubAllEnvs();
});

describe('Zoho management route boundary', () => {
  it('rejects fixture-only and non-admin access, browser-origin commands and proxied host', async () => {
    const { request, mock, admin } = await start();
    expect((await request('GET', '/status')).status).toBe(401);
    expect((await request('GET', '/status', { 'X-Demo-Identity': 'admin' })).status).toBe(403);
    expect((await request('GET', '/status', { ...admin, 'X-Demo-Identity': 'rep-a' })).status).toBe(403);
    expect((await request('POST', '/authorize', { ...admin, Origin: 'http://127.0.0.1:5173' })).status).toBe(403);
    expect((await request('GET', '/status', { ...admin, Host: '127.0.0.1:5173' })).status).toBe(403);
    expect((await request('POST', '/sample?limit=500', admin)).status).toBe(400);
    expect((await request('POST', '/invoices/1001/email', admin)).status).toBe(404);
    expect((await request('PUT', '/invoices/1001', admin)).status).toBe(404);
    expect((await request('PATCH', '/contacts/801', admin)).status).toBe(404);
    expect((await request('DELETE', '/items/501', admin)).status).toBe(404);
    expect(mock.calls).toHaveLength(0);
  });

  it('keeps the namespace disabled when the Sales CRM flag is off', async () => {
    const { request, mock, admin } = await start(false);
    expect((await request('GET', '/status', admin)).status).toBe(404);
    expect((await request('GET', '/callback?code=fixture-code')).status).toBe(404);
    expect(mock.calls).toHaveLength(0);
  });

  it('completes the browser-bound flow and returns only clean status or sample counts', async () => {
    const { request, mock, admin } = await start();
    const issue = await request('POST', '/authorize', admin);
    expect(issue.status).toBe(200);
    expect(issue.headers['cache-control']).toBe('no-store');
    const startUrl = new URL(JSON.parse(issue.body).startUrl);
    const browser = await request('GET', '/start' + startUrl.search);
    expect(browser.status).toBe(303);
    const auth = new URL(browser.headers.location!);
    mock.expectChallenge(auth.searchParams.get('code_challenge')!);
    const cookieHeader = browser.headers['set-cookie']?.[0] ?? '';
    expect(cookieHeader.includes('HttpOnly') && cookieHeader.includes('SameSite=Lax')).toBe(true);
    const cookie = cookieHeader.split(';')[0];
    const query = new URLSearchParams({ code: 'fixture-code', state: auth.searchParams.get('state')! });
    expect((await request('GET', '/callback?' + query)).status).toBe(400);
    expect(mock.calls).toHaveLength(0);
    const callback = await request('GET', '/callback?' + query, { Cookie: cookie });
    expect(callback.status).toBe(303);
    expect(callback.headers.location).toBe(zohoIntegrationPath + '/complete');
    expect(callback.headers['referrer-policy']).toBe('no-referrer');
    expect(callback.body).toBe('');
    expect(mock.pkceValid).toBe(true);
    const status = await request('GET', '/status', admin);
    expect(status.status).toBe(200);
    expect(JSON.parse(status.body)).toMatchObject({ mode: 'read-only', connection: 'connected', lastSuccessfulSync: null });
    const sample = await request('POST', '/sample', admin);
    expect(JSON.parse(sample.body)).toEqual({ invoiceCount: 1, contactCount: 1, itemCount: 1 });
    const bodies = [issue.body, status.body, sample.body, callback.body].join('');
    expect(/fixture-(client-secret|access|refresh|code)|omit@example/.test(bodies)).toBe(false);
    expect(mock.calls.filter(call => call.host === 'www.zohoapis.com').every(call => call.method === 'GET')).toBe(true);
  });
});
