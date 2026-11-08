import { mkdtempSync, rmSync } from 'node:fs';
import { once } from 'node:events';
import { request as httpRequest } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApi } from '../server/api';
import { openSalesIdentity } from '../server/sales-crm/auth/store';
import {
  absoluteLifetime, csrfToken, idleLifetime, newSessionToken, sessionCookie, sessionCookieName, sessionDigest,
} from '../server/sales-crm/auth/sessions';
import { zohoIntegrationPath } from '../server/sales-crm/zoho/config';
import { reportingApi, type ReportingPage } from '../shared/reporting';
import { salesAuthApi, type SalesDirectory, type SalesSessionView } from '../shared/sales-auth';
import { salesCrmApiWorkspace } from '../shared/sales-crm';
import { salesAuthFixture, testAccount, testIssuer, testTenant, testTime } from './fixtures/sales-auth';
import { oauthFixture, oauthFixtureEnv } from './fixtures/zoho-oauth';

let api: ReturnType<typeof createApi> | undefined;
let fixture: Awaited<ReturnType<typeof salesAuthFixture>> | undefined;

async function start({ mode = 'test', sales = true, auth = true, database = true, now = () => testTime } = {}) {
  vi.stubEnv('NODE_ENV', mode);
  vi.stubEnv('SALES_CRM_ENABLED', String(sales));
  vi.stubEnv('SALES_CRM_AUTH_ENABLED', String(auth));
  const state = fixture = await salesAuthFixture({ now });
  const zoho = oauthFixture();
  api = createApi(undefined, { config: zoho.config, connection: zoho.connection }, state.reporting, database ? state.store : undefined);
  api.listen(0, '127.0.0.1');
  await once(api, 'listening');
  const port = (api.address() as AddressInfo).port;
  function request(path: string, token?: string, method = 'GET', headers: Record<string, string> = {}, body?: string) {
    return new Promise<{ status: number; body: string; headers: import('node:http').IncomingHttpHeaders }>((resolve, reject) => {
      const req = httpRequest({
        host: '127.0.0.1', port, path, method,
        headers: { Host: '127.0.0.1:5173', ...(token ? { Cookie: sessionCookieName + '=' + token } : {}),
          ...headers, ...(body === undefined ? {} : { 'Content-Length': Buffer.byteLength(body) }) },
      }, res => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', chunk => { body += chunk; });
        res.on('end', () => resolve({ status: res.statusCode!, body, headers: res.headers }));
      });
      req.on('error', reject);
      req.end(body);
    });
  }
  async function report(token: string, query = '') {
    const response = await request(reportingApi + query, token);
    expect(response.status).toBe(200);
    return JSON.parse(response.body) as ReportingPage;
  }
  return { ...state, request, report, zoho };
}

afterEach(async () => {
  if (api) {
    api.closeAllConnections();
    await new Promise<void>(resolve => api!.close(() => resolve()));
    api = undefined;
  }
  fixture?.close();
  fixture = undefined;
  vi.unstubAllEnvs();
});

describe('Session-only CRM HTTP boundary', () => {
  it('denies missing, malformed, duplicate and forged sessions, including a demo admin identity', async () => {
    const { request, token } = await start();
    const north = token('north');
    for (const path of [salesCrmApiWorkspace, reportingApi, salesAuthApi + '/admin']) {
      expect((await request(path)).status).toBe(401);
      expect((await request(path, undefined, 'GET', {
        'X-Demo-Identity': 'admin', 'X-User-Id': 'admin', 'X-Role': 'admin', Authorization: 'Bearer ' + north,
      })).status).toBe(401);
    }
    expect((await request(reportingApi, newSessionToken())).status).toBe(401);
    expect((await request(reportingApi, 'broken')).status).toBe(401);
    expect((await request(reportingApi, north, 'GET', { Cookie: sessionCookieName + '=' + north + '; ' + sessionCookieName + '=' + north })).status).toBe(401);
    expect((await request(reportingApi, north, 'GET', { 'X-Demo-Identity': 'admin' })).status).toBe(401);
  });

  it('denies a previously valid cookie once its idle deadline passes', async () => {
    let clock = testTime;
    const { request, token } = await start({ now: () => clock });
    const north = token('north');
    clock += idleLifetime;
    expect((await request(salesCrmApiWorkspace, north)).status).toBe(401);
    expect((await request(reportingApi, north)).status).toBe(401);
  });

  it('returns a limited session view and workspace from a valid server session', async () => {
    const { request, token } = await start();
    const north = token('north');
    const session = await request(salesAuthApi + '/session', north);
    expect(session.status).toBe(200);
    expect(session.headers['cache-control']).toBe('no-store');
    const details: SalesSessionView = JSON.parse(session.body);
    expect(details).toEqual({
      displayName: 'North Rep', role: 'sales_rep', csrfToken: csrfToken(north),
      expiresAt: new Date(testTime + absoluteLifetime).toISOString(),
    });
    expect(session.body).not.toContain(north);
    expect(session.body).not.toMatch(/@example\.test|subject|issuer|team|token_digest/i);
    expect(JSON.parse((await request(salesCrmApiWorkspace, north)).body).displayName).toBe('North Rep');
  });

  it('applies org, team and credited-user scope to aggregates, search, details and unmapped users', async () => {
    const { request, report, token, admin } = await start();
    const north = token('north');
    const manager = token('manager');
    const rep = await report(north);
    expect(rep.invoices.map(row => row.id)).toEqual(['9001']);
    expect(rep.sales).toEqual([{ currency: 'USD', subtotal: '100.23', count: 1 }]);
    expect((await report(north, '?q=South')).count).toBe(0);
    expect((await request(reportingApi + '/invoices/9002', north)).status).toBe(404);
    expect((await request(reportingApi + '/invoices/9002', north, 'GET', { 'X-Role': 'admin', 'X-User-Id': 'south' })).status).toBe(404);
    expect((await request(reportingApi + '?repId=south', north)).status).toBe(400);
    expect((await request(reportingApi, north, 'POST', { 'Content-Type': 'application/json' }, '{"role":"admin"}')).status).toBe(404);
    expect((await report(manager)).invoices.map(row => row.id)).toEqual(['9001', '9003']);
    expect((await request(reportingApi + '/invoices/9002', manager)).status).toBe(404);
    expect((await report(admin)).invoices.map(row => row.id)).toEqual(['9001', '9002', '9003', '9004']);
    expect((await report(token('unmapped'))).count).toBe(0);
    expect((await report(token('other'))).invoices.map(row => row.id)).toEqual(['9005']);
    expect((await request(reportingApi + '/invoices/9005', admin)).status).toBe(404);
  });

  it('applies exact Origin and session-bound CSRF checks to logout and invalidates the old cookie', async () => {
    const { request, token } = await start();
    const north = token('north');
    const valid = { Origin: 'http://127.0.0.1:5173', 'X-CSRF-Token': csrfToken(north) };
    const path = salesAuthApi + '/logout';
    expect((await request(path, north, 'GET', valid)).status).toBe(404);
    expect((await request(path, north, 'POST')).status).toBe(403);
    expect((await request(path, north, 'POST', { ...valid, Origin: 'http://localhost:5173' })).status).toBe(403);
    expect((await request(path, north, 'POST', { ...valid, 'X-CSRF-Token': csrfToken(token('south')) })).status).toBe(403);
    expect((await request(path, north, 'POST', valid, '{}')).status).toBe(403);
    expect((await request(reportingApi, north)).status).toBe(200);
    const signedOut = await request(path, north, 'POST', valid);
    expect(signedOut.status).toBe(200);
    expect(signedOut.headers['set-cookie']).toEqual([sessionCookie(null)]);
    expect((await request(reportingApi, north)).status).toBe(401);
  });

  it('allows authorized directory reads while withholding provider subjects, verification references and other tenants', async () => {
    const { request, token, admin, ids } = await start();
    expect((await request(salesAuthApi + '/admin', token('north'))).status).toBe(403);
    expect((await request(salesAuthApi + '/admin', token('manager'))).status).toBe(403);
    const directory = await request(salesAuthApi + '/admin', admin);
    expect(directory.status).toBe(200);
    const data: SalesDirectory = JSON.parse(directory.body);
    expect(data.users.map(user => user.id)).toContain(ids.north);
    expect(data.users.find(user => user.id === ids.north)).toMatchObject({
      email: 'north@example.test', role: 'sales_rep', department: 'sales', team: 'north', status: 'active', zohoSalespersonId: '501',
    });
    expect(data.audit).toContainEqual(expect.objectContaining({ action: 'zoho-mapping-changed', actorId: ids.admin, targetId: ids.north }));
    expect(directory.body).not.toMatch(/Other Admin|fixture-501|identity\.example|verification_reference|token_digest/);
    expect((await request(salesAuthApi + '/admin', admin, 'POST')).status).toBe(404);
    expect((await request(salesAuthApi + '/login', undefined, 'POST', {}, '{}')).status).toBe(401);
  });

  it('keeps operator settings separately protected and leaves customer/Gmail routes unavailable', async () => {
    const { request, token, admin, zoho } = await start();
    const ops = reportingApi + '/operations';
    expect((await request(ops, token('north'))).status).toBe(404);
    expect((await request(ops, admin)).status).toBe(404);
    const target = zohoIntegrationPath + '/status';
    const host = { Host: 'localhost:3001' };
    expect((await request(target, admin, 'GET', host)).status).toBe(401);
    expect((await request(target, undefined, 'GET', { ...host, 'X-Demo-Identity': 'admin' })).status).toBe(403);
    const operator = await request(target, undefined, 'GET', {
      ...host, 'X-Demo-Identity': 'admin', 'X-Zoho-Local-Admin-Key': oauthFixtureEnv.ZOHO_LOCAL_ADMIN_KEY,
    });
    expect(operator.status).toBe(200);
    expect(zoho.calls).toHaveLength(0);
    for (const path of ['/api/sales-crm/customers', '/api/sales-crm/gmail']) {
      expect((await request(path, admin)).status).toBe(404);
    }
  });

  it('preserves the fixture workflow in session mode and fails closed if the identity store is unavailable', async () => {
    const { request } = await start({ database: false });
    expect((await request('/api/workspace', undefined, 'GET', { 'X-Demo-Identity': 'manager' })).status).toBe(200);
    expect((await request(salesCrmApiWorkspace, undefined, 'GET', { 'X-Demo-Identity': 'manager' })).status).toBe(503);
  });

  it('preserves the existing demo mode and denies demo access to the user directory', async () => {
    const { request } = await start({ auth: false });
    const headers = { 'X-Demo-Identity': 'admin' };
    expect((await request(reportingApi, undefined, 'GET', headers)).status).toBe(200);
    expect((await request(salesAuthApi + '/admin', undefined, 'GET', headers)).status).toBe(404);
  });

  it('keeps secure CRM routes behind the Sales CRM flag', async () => {
    const { request, admin } = await start({ sales: false });
    expect((await request(reportingApi, admin)).status).toBe(404);
    expect((await request(salesAuthApi + '/admin', admin)).status).toBe(404);
  });

  it.each(['production', 'staging', ''])('keeps protected and fixture routes disabled in %s', async mode => {
    const { request, admin } = await start({ mode });
    expect((await request(reportingApi, admin)).status).toBe(404);
    expect((await request('/api/workspace', undefined, 'GET', { 'X-Demo-Identity': 'admin' })).status).toBe(404);
  });
});

describe('Identity, role changes and durable sessions', () => {
  it('persists verified principals and sessions with a digest and replaces the same account session on reauthentication', () => {
    const folder = mkdtempSync(join(tmpdir(), 'dizzle-sales-identity-'));
    const path = join(folder, 'identity.sqlite');
    let store = openSalesIdentity(path, () => testTime);
    try {
      const id = store.bootstrapAdministrator(testTenant, testAccount('admin'));
      const principal = { issuer: testIssuer, subject: 'admin' };
      const before = store.startSession(principal);
      store.close();
      store = openSalesIdentity(path, () => testTime);
      expect(store.resolveSession(before)?.id).toBe(id);
      expect(store.resolveSession(sessionDigest(before))).toBeUndefined();
      expect(sessionCookie(before)).toContain('; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=28800');
      expect(() => store.startSession({ ...principal, issuer: 'https://impostor.example.test' })).toThrow('Company sign-in is unavailable');
      const after = store.startSession(principal, before);
      expect(after).not.toBe(before);
      expect(store.resolveSession(before)).toBeUndefined();
      expect(store.resolveSession(after)?.id).toBe(id);
    } finally {
      store.close();
      rmSync(folder, { recursive: true });
    }
  });

  it('rejects idle and absolute expiration even when a session is used continually', () => {
    let at = testTime;
    const store = openSalesIdentity(':memory:', () => at);
    try {
      store.bootstrapAdministrator(testTenant, testAccount('admin'));
      const principal = { issuer: testIssuer, subject: 'admin' };
      const inactive = store.startSession(principal);
      at += idleLifetime;
      expect(store.resolveSession(inactive)).toBeUndefined();
      const active = store.startSession(principal);
      const issued = at;
      for (let elapsed = 20 * 60_000; elapsed < absoluteLifetime; elapsed += 20 * 60_000) {
        at = issued + elapsed;
        expect(store.resolveSession(active)).toBeDefined();
      }
      at = issued + absoluteLifetime;
      expect(store.resolveSession(active)).toBeUndefined();
    } finally {
      store.close();
    }
  });

  it('revokes existing sessions on changes and denies disabled or pending bindings', async () => {
    const { store, request, token, admin, ids } = await start();
    const north = token('north');
    store.changeAccess(admin, ids.north, { status: 'active', role: 'sales_manager', team: 'south' });
    expect((await request(reportingApi, north)).status).toBe(401);
    const promoted = token('north');
    expect((JSON.parse((await request(reportingApi, promoted)).body) as ReportingPage).invoices.map(row => row.id)).toEqual(['9001', '9002']);
    store.changeAccess(admin, ids.north, { status: 'disabled', role: 'sales_manager', team: 'south' });
    expect((await request(reportingApi, promoted)).status).toBe(401);
    expect(() => token('north')).toThrow('Company sign-in is unavailable');
    store.provisionUser(admin, { ...testAccount('pending'), status: 'pending', role: 'sales_rep' });
    expect(() => token('pending')).toThrow('Company sign-in is unavailable');
    expect(() => store.changeAccess(admin, ids.admin, { status: 'disabled', role: 'admin', team: null }))
      .toThrow('At least one active administrator');
  });

  it('requires tenant administrators and evidence for unique mappings and preserves captured invoice credit after remapping', async () => {
    const { store, admin, ids, token, report } = await start();
    const evidence = { salespersonId: '501', verificationReference: 'verified-record' };
    expect(() => store.setZohoMapping(token('north'), ids.north, evidence)).toThrow('Administrator access required');
    expect(() => store.setZohoMapping(admin, ids.other, evidence)).toThrow('User not found');
    expect(() => store.setZohoMapping(admin, ids.south, evidence)).toThrow('already mapped');
    expect(() => store.setZohoMapping(admin, ids.north, { ...evidence, verificationReference: '' })).toThrow();
    store.setZohoMapping(admin, ids.north, null);
    expect((await report(token('north'))).count).toBe(0);
    store.setZohoMapping(admin, ids.south, evidence);
    expect((await report(token('south'))).invoices.map(row => row.id)).toEqual(['9002']);
    expect((await report(admin)).invoices.find(row => row.id === '9001')?.subtotal).toBe('100.23');
  });
});
