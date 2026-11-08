import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { request } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApi } from '../server/api';
import { googleIssuer, googleScopes, loadGoogleConfig } from '../server/sales-crm/auth/google/config';
import { createGoogleProvider } from '../server/sales-crm/auth/google/provider';
import { createGoogleLogin } from '../server/sales-crm/auth/google/routes';
import { csrfToken, loadSessionPolicy, newSessionToken, sessionCookieName, sessionDigest } from '../server/sales-crm/auth/sessions';
import { openSqliteDatabase } from '../server/sqlite';
import { openSalesIdentity } from '../server/sales-crm/auth/store';
import { createSyntheticReporting } from '../server/sales-crm/reporting/demo';
import { saveSalesperson, upsertInvoice } from '../server/sales-crm/reporting/database';
import { invoiceDetail, mirrorInvoice } from '../server/sales-crm/zoho/invoice';
import { reportingApi } from '../shared/reporting';
import { googleAuthApi, salesAuthApi, type SalesDirectory } from '../shared/sales-auth';
import { invoicePayload } from './fixtures/zoho-invoices';
import { googleTestConfig, googleTestEnv, mockAdmin, mockGoogleCode, mockGoogleTransport } from './fixtures/google-oidc';

const origin = googleTestConfig.origin;
const tenant = 'google-test-company';
const adminAccount = { name: 'Sample Admin', email: mockAdmin.email, department: 'sales', team: null };
let api: ReturnType<typeof createApi> | undefined;
let closeStores: (() => void) | undefined;

async function start(options: { enabled?: boolean; domain?: string; clock?: () => number; configured?: boolean } = {}) {
  vi.stubEnv('NODE_ENV', 'test');
  vi.stubEnv('SALES_CRM_ENABLED', options.enabled === false ? 'false' : 'true');
  vi.stubEnv('SALES_CRM_AUTH_ENABLED', 'true');
  const config = { ...googleTestConfig, hostedDomain: options.domain };
  const identity = openSalesIdentity(':memory:', options.clock);
  const reporting = await createSyntheticReporting({ path: ':memory:' });
  closeStores = () => { identity.close(); reporting.db.close(); };
  const mock = mockGoogleTransport(config);
  const google = createGoogleLogin(config, createGoogleProvider(config, mock.transport), options.clock);
  api = createApi(undefined, undefined, reporting, identity, { google: options.configured === false ? undefined : google });
  api.listen(0, '127.0.0.1');
  await once(api, 'listening');
  const port = (api.address() as AddressInfo).port;

  function send(path: string, method = 'GET', headers: Record<string, string> = {}, body?: string) {
    return new Promise<{ status: number; body: string; headers: import('node:http').IncomingHttpHeaders }>((resolve, reject) => {
      const req = request({ host: '127.0.0.1', port, path, method,
        headers: { Host: new URL(origin).host, ...headers, ...(body === undefined ? {} : { 'Content-Length': Buffer.byteLength(body) }) },
      }, res => {
        let content = '';
        res.setEncoding('utf8');
        res.on('data', chunk => { content += chunk; });
        res.on('end', () => resolve({ status: res.statusCode!, headers: res.headers, body: content }));
      });
      req.on('error', reject);
      req.end(body);
    });
  }

  async function begin(invitation?: string) {
    const response = await send(googleAuthApi + '/start', 'POST', {
      Origin: origin, 'Content-Type': 'application/x-www-form-urlencoded',
    }, new URLSearchParams(invitation ? { invitation } : {}).toString());
    expect(response.status).toBe(303);
    const authorization = new URL(response.headers.location!);
    const browser = response.headers['set-cookie']![0].split(';')[0];
    return { authorization, browser };
  }

  function callback(authorization: URL, claims: Parameters<typeof mockGoogleCode>[1] = {},
    failure?: Parameters<typeof mockGoogleCode>[2]) {
    const params = new URLSearchParams({
      state: authorization.searchParams.get('state')!,
      code: mockGoogleCode(authorization, claims, failure),
    });
    return googleAuthApi + '/callback?' + params;
  }

  async function login(invitation?: string, claims?: Parameters<typeof mockGoogleCode>[1], failure?: Parameters<typeof mockGoogleCode>[2]) {
    const { authorization, browser } = await begin(invitation);
    const response = await send(callback(authorization, claims, failure), 'GET', { Cookie: browser });
    const cookie = response.headers['set-cookie']?.find(value => value.startsWith(sessionCookieName + '='))?.split(';')[0];
    return { response, cookie };
  }

  async function approveAdmin() {
    const approved = identity.bootstrapGoogleAdministrator(tenant, adminAccount);
    const loginResult = await login(approved.invitation, options.domain ? { hd: options.domain } : {});
    expect(loginResult.response.headers.location).toBe('/sales');
    expect(loginResult.cookie).toBeDefined();
    return loginResult.cookie!;
  }

  function authHeaders(cookie: string) {
    const token = cookie.slice(sessionCookieName.length + 1);
    return { Cookie: cookie, Origin: origin, 'X-CSRF-Token': csrfToken(token) };
  }
  function json(path: string, cookie: string, method: 'POST' | 'PUT', input: unknown) {
    return send(path, method, { ...authHeaders(cookie), 'Content-Type': 'application/json' }, JSON.stringify(input));
  }

  return { send, begin, login, callback, approveAdmin, authHeaders, json, mock, identity, reporting, google };
}

afterEach(async () => {
  if (api) {
    api.closeAllConnections();
    await new Promise<void>(resolve => api!.close(() => resolve()));
    api = undefined;
  }
  closeStores?.();
  closeStores = undefined;
  vi.unstubAllEnvs();
});

describe('Google OIDC with signed mock ID tokens', () => {
  it('discovers Google, uses exact identity scopes and PKCE, and enrolls only the approved first administrator', async () => {
    const { identity, begin, callback, send, mock } = await start();
    const { invitation } = identity.bootstrapGoogleAdministrator(tenant, adminAccount);
    const { authorization, browser } = await begin(invitation);
    expect(authorization.origin).toBe(googleIssuer);
    expect(Object.fromEntries(authorization.searchParams)).toMatchObject({
      scope: googleScopes, redirect_uri: googleTestConfig.redirectUri, code_challenge_method: 'S256',
      response_type: 'code', prompt: 'select_account', nonce: expect.any(String), state: expect.any(String),
    });
    expect(authorization.href).not.toContain(invitation);
    expect(authorization.searchParams.has('access_type')).toBe(false);
    const url = callback(authorization);
    const result = await send(url, 'GET', { Cookie: browser });
    expect(result.status).toBe(303);
    expect(result.headers.location).toBe('/sales');
    expect(result.headers['cache-control']).toBe('no-store');
    expect(result.headers['referrer-policy']).toBe('no-referrer');
    const cookies = result.headers['set-cookie']!;
    expect(cookies).toEqual([
      expect.stringContaining('Max-Age=0'),
      expect.stringMatching(/^__Host-dizzle_sales_session=[\w-]+; Path=\/; Secure; HttpOnly; SameSite=Lax; Max-Age=28800$/),
    ]);
    const session = await send(salesAuthApi + '/session', 'GET', { Cookie: cookies[1].split(';')[0] });
    expect(JSON.parse(session.body)).toMatchObject({ email: mockAdmin.email, displayName: 'Sample Admin', role: 'admin' });
    expect(session.body).not.toMatch(/mock-google-access-token|google-fixture-admin/);
    expect(mock.calls.map(call => call.method)).toEqual(['GET', 'POST', 'GET']);
    expect((await send(url, 'GET', { Cookie: browser })).headers.location).toBe('/sales?signIn=failed');
    expect(mock.calls).toHaveLength(3);
    expect(() => identity.bootstrapGoogleAdministrator(tenant, adminAccount)).toThrow('already been established');
  });

  it('admits a returning approved account, rotates its session, and refuses unknown or incorrectly linked accounts', async () => {
    const { approveAdmin, login, begin, send, callback } = await start();
    const prior = await approveAdmin();
    const { authorization, browser } = await begin();
    const returned = await send(callback(authorization), 'GET', { Cookie: browser + '; ' + prior });
    expect(returned.headers.location).toBe('/sales');
    expect((await send(salesAuthApi + '/session', 'GET', { Cookie: prior })).status).toBe(401);
    for (const claims of [{ sub: 'unapproved-subject' }, { email: 'different@example.test' }, { sub: 'unapproved', email: mockAdmin.email }]) {
      const { response, cookie } = await login(undefined, claims);
      expect(response.headers.location).toBe('/sales?signIn=account');
      expect(cookie).toBeUndefined();
    }
  });

  it.each([
    ['bad signature', {}, { invalidSignature: true }],
    ['expired', { exp: 100 }, {}],
    ['wrong audience', { aud: 'wrong-client' }, {}],
    ['wrong issuer', { iss: 'https://wrong-issuer.example' }, {}],
    ['wrong nonce', { nonce: 'wrong-nonce' }, {}],
    ['PKCE rejection', {}, { failPkce: true }],
    ['missing ID token', {}, { omitToken: true }],
  ] as const)('rejects %s without issuing a session', async (_name, claims, failure) => {
    const { identity, login } = await start();
    const approved = identity.bootstrapGoogleAdministrator(tenant, adminAccount);
    const { response, cookie } = await login(approved.invitation, claims, failure);
    expect(response.headers.location).toBe('/sales?signIn=failed');
    expect(cookie).toBeUndefined();
    expect((await login(approved.invitation)).response.headers.location).toBe('/sales');
  });

  it('requires a verified email and compares the actual Workspace hd claim when configured', async () => {
    const { identity, login, begin } = await start({ domain: 'example.test' });
    const approved = identity.bootstrapGoogleAdministrator(tenant, adminAccount);
    expect((await begin(approved.invitation)).authorization.searchParams.get('hd')).toBe('example.test');
    for (const claims of [{ hd: 'example.test', email_verified: false }, { hd: 'other.example.test' }, {}]) {
      expect((await login(approved.invitation, claims)).response.headers.location).toBe('/sales?signIn=account');
    }
    expect((await login(approved.invitation, { hd: 'example.test' })).response.headers.location).toBe('/sales');
  });

  it('checks Origin, one browser cookie, state and flow expiry before token exchange', async () => {
    let at = Date.now();
    const { begin, callback, send, mock } = await start({ clock: () => at });
    const form = { 'Content-Type': 'application/x-www-form-urlencoded' };
    expect((await send(googleAuthApi + '/start', 'POST', form, '')).status).toBe(403);
    expect((await send(googleAuthApi + '/start', 'POST', { ...form, Origin: 'http://localhost:5173' }, '')).status).toBe(403);
    const { authorization, browser } = await begin();
    const valid = callback(authorization);
    for (const [path, cookie] of [
      [valid, ''], [valid, browser + '; ' + browser],
      [valid.replace(authorization.searchParams.get('state')!, 'forged-state'), browser],
      [valid + '&state=duplicate', browser],
    ]) {
      expect((await send(path, 'GET', { Cookie: cookie })).headers.location).toBe('/sales?signIn=failed');
    }
    at += 300_000;
    expect((await send(valid, 'GET', { Cookie: browser })).headers.location).toBe('/sales?signIn=failed');
    expect(mock.calls.map(call => call.method)).toEqual(['GET']);
  });

  it('expires an unused invitation and allows replacement only for the same initial employee', async () => {
    let at = Date.now();
    const { identity, login } = await start({ clock: () => at });
    const approved = identity.bootstrapGoogleAdministrator(tenant, adminAccount);
    at += 24 * 60 * 60_000;
    expect((await login(approved.invitation)).response.headers.location).toBe('/sales?signIn=account');
    expect(() => identity.bootstrapGoogleAdministrator(tenant, { ...adminAccount, email: 'other@example.test' })).toThrow();
    const renewed = identity.bootstrapGoogleAdministrator(tenant, adminAccount);
    expect((await login(renewed.invitation)).response.headers.location).toBe('/sales');
  });

  it('requires a fresh login when the Google origin, client, or Workspace policy changes', async () => {
    const { approveAdmin, send, google } = await start();
    const cookie = await approveAdmin();
    expect((await send(salesAuthApi + '/session', 'GET', { Cookie: cookie })).status).toBe(200);
    google.sessionPolicy = 'different-configured-policy';
    expect((await send(salesAuthApi + '/session', 'GET', { Cookie: cookie })).status).toBe(401);
  });

  it('requires possession and exact approved email, invalidates replaced invitations, and denies disabled employees', async () => {
    const { identity, approveAdmin, json, send, login } = await start();
    const admin = await approveAdmin();
    const invitePath = salesAuthApi + '/admin/users';
    const rep = { name: 'North Rep', email: 'rep@example.test', department: 'sales', team: 'north', role: 'sales_rep' };
    const approval = await json(invitePath, admin, 'POST', rep);
    expect(approval.status).toBe(200);
    const directory = async () => JSON.parse((await send(salesAuthApi + '/admin', 'GET', { Cookie: admin })).body) as SalesDirectory;
    const employee = (await directory()).users.find(user => user.email === rep.email)!;
    expect(employee).toMatchObject({ status: 'pending', role: 'sales_rep', googleLinked: false });
    const replacement = await send(invitePath + '/' + employee.id + '/invitation', 'POST', {
      Cookie: admin, Origin: origin, 'X-CSRF-Token': csrfToken(admin.split('=')[1]),
    });
    const old = JSON.parse(approval.body).invitation;
    const current = JSON.parse(replacement.body).invitation;
    const goodClaims = { sub: 'employee-2', email: rep.email };
    expect((await login(old, goodClaims)).response.headers.location).toBe('/sales?signIn=account');
    expect((await login(current, { ...goodClaims, email: 'wrong@example.test' })).response.headers.location).toBe('/sales?signIn=account');
    expect((await login(current, { ...goodClaims, sub: mockAdmin.subject })).response.headers.location).toBe('/sales?signIn=account');
    expect((await login(undefined, goodClaims)).response.headers.location).toBe('/sales?signIn=account');
    const linked = await login(current, goodClaims);
    expect(linked.response.headers.location).toBe('/sales');
    expect((await directory()).users.find(user => user.id === employee.id)).toMatchObject({ status: 'active', googleLinked: true, role: 'sales_rep' });
    expect((await login(current, { ...goodClaims, sub: 'replay-sub' })).response.headers.location).toBe('/sales?signIn=account');
    expect(identity.resolveSession(linked.cookie!.split('=')[1])?.id).toBe(employee.id);
    expect((await json(invitePath + '/' + employee.id + '/access', admin, 'PUT', {
      role: 'sales_rep', status: 'disabled', team: 'north', department: 'operations',
    })).status).toBe(200);
    expect((await send(salesAuthApi + '/session', 'GET', { Cookie: linked.cookie! })).status).toBe(401);
    expect((await login(undefined, goodClaims)).response.headers.location).toBe('/sales?signIn=account');
  });

  it('keeps administrator writes and logout behind role, Origin and CSRF checks', async () => {
    const { approveAdmin, authHeaders, json, send, login } = await start();
    const admin = await approveAdmin();
    const path = salesAuthApi + '/admin/users';
    const input = { name: 'Sales Rep', email: 'rep@example.test', department: 'sales', team: null, role: 'sales_rep' };
    expect((await send(path, 'POST', { Cookie: admin, Origin: origin, 'Content-Type': 'application/json' }, JSON.stringify(input))).status).toBe(403);
    expect((await send(path, 'POST', { ...authHeaders(admin), Origin: 'http://localhost:5173', 'Content-Type': 'application/json' }, JSON.stringify(input))).status).toBe(403);
    expect((await json(path, admin, 'POST', { ...input, organizationId: 'other' })).status).toBe(400);
    const issued = await json(path, admin, 'POST', input);
    const rep = await login(JSON.parse(issued.body).invitation, { sub: 'rep', email: input.email });
    expect((await json(path, rep.cookie!, 'POST', { ...input, role: 'admin' })).status).toBe(403);
    expect((await send(salesAuthApi + '/admin', 'GET', { Cookie: rep.cookie! })).status).toBe(403);
    expect((await send(salesAuthApi + '/logout', 'POST', { Cookie: admin })).status).toBe(403);
    expect((await send(salesAuthApi + '/logout', 'POST', authHeaders(admin))).status).toBe(200);
    expect((await send(salesAuthApi + '/session', 'GET', { Cookie: admin })).status).toBe(401);
  });

  it('applies existing rep and manager scopes to actual Google-issued sessions and rejects demo headers', async () => {
    const { approveAdmin, send, json, login, reporting } = await start();
    const admin = await approveAdmin();
    const path = salesAuthApi + '/admin/users';
    const employees = [
      ['north', 'north', 'sales_rep', '10001', '701'],
      ['south', 'south', 'sales_rep', '10002', '702'],
      ['manager', 'north', 'sales_manager', '10003', '703'],
    ] as const;
    const cookies = new Map<string, string>();
    for (const [name, team, role, id, zohoId] of employees) {
      const email = name + '@example.test';
      const approved = await json(path, admin, 'POST', { name, email, department: 'sales', team, role });
      const bound = await login(JSON.parse(approved.body).invitation, { sub: name, email });
      expect(bound.response.headers.location).toBe('/sales');
      cookies.set(name, bound.cookie!);
      const directory: SalesDirectory = JSON.parse((await send(salesAuthApi + '/admin', 'GET', { Cookie: admin })).body);
      const user = directory.users.find(entry => entry.email === email)!;
      expect((await json(path + '/' + user.id + '/mapping', admin, 'PUT', {
        salespersonId: zohoId, verificationReference: 'fixture-evidence-' + zohoId,
      })).status).toBe(200);
      saveSalesperson(reporting.db, tenant, zohoId, user.id, name);
      const at = Date.now();
      const instant = new Date(at).toISOString();
      const data = invoiceDetail.parse({ invoice: invoicePayload({
        invoice_id: id, invoice_number: 'OIDC-' + id, salesperson_id: zohoId,
        created_time: new Date(at - 1000).toISOString(), last_modified_time: instant,
      }) }).invoice;
      upsertInvoice(reporting.db, mirrorInvoice(tenant, data), {
        status: 'verified', firstEmailAt: instant, source: 'Fixture receipt', id: 'receipt-' + id,
        subtotal: '100.23', currency: 'USD', salespersonId: zohoId,
      }, at);
    }
    expect((await send(reportingApi, 'GET', { 'X-Demo-Identity': 'admin' })).status).toBe(401);
    expect((await send(reportingApi + '/invoices/10002', 'GET', { Cookie: cookies.get('north')!, 'X-Role': 'admin' })).status).toBe(404);
    expect((await send(reportingApi + '/invoices/10002', 'GET', { Cookie: cookies.get('manager')! })).status).toBe(404);
    const scoped = JSON.parse((await send(reportingApi, 'GET', { Cookie: cookies.get('manager')! })).body);
    expect(scoped.invoices.map((item: { id: string }) => item.id).sort()).toEqual(['10001', '10003']);
    const protectedView = JSON.parse((await send(reportingApi, 'GET', { Cookie: admin })).body);
    expect(protectedView.source).toBe('synthetic');
  });

  it.each([{ enabled: false }, { configured: false }])('does not initiate Google when disabled or unconfigured', async options => {
    const { send, mock } = await start(options);
    const status = await send(googleAuthApi + '/status');
    expect(status.status).toBe(options.enabled === false ? 404 : 200);
    if (status.status === 200) expect(JSON.parse(status.body)).toEqual({ configured: false });
    expect((await send(googleAuthApi + '/start', 'POST', {
      Origin: origin, 'Content-Type': 'application/x-www-form-urlencoded',
    }, '')).status).toBe(404);
    expect(mock.calls).toHaveLength(0);
  });
});

describe('Private Google settings', () => {
  it('migrates an existing identity database without changing its user or active session', () => {
    const folder = mkdtempSync(join(tmpdir(), 'dizzle-google-migration-'));
    const path = join(folder, 'identity.sqlite');
    const at = Date.now();
    try {
      const old = openSqliteDatabase(path, [new URL('../server/sales-crm/auth/migrations/001-identity.sql', import.meta.url)]);
      const token = newSessionToken();
      try {
        old.prepare('INSERT INTO sales_users VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
          'existing-id', tenant, 'Existing Employee', 'existing@example.test', 'https://existing.example.test',
          'existing-subject', 'sales', 'north', 'sales_rep', 'active', at, at,
        );
        old.prepare('INSERT INTO sales_sessions VALUES (?, ?, ?, ?, ?)').run(sessionDigest(token), 'existing-id', at, at, at + 30_000);
      } finally { old.close(); }
      const upgraded = openSalesIdentity(path, () => at);
      try {
        expect(upgraded.resolveSession(token)).toMatchObject({
          id: 'existing-id', role: 'sales_rep', team_id: 'north', google_policy: null,
        });
      } finally { upgraded.close(); }
    } finally { rmSync(folder, { recursive: true }); }
  });

  it('derives the only permitted callback from the actual frontend port and requires session mode', () => {
    expect(loadGoogleConfig({ ...googleTestEnv, GOOGLE_OIDC_ENABLED: 'false' })).toBeUndefined();
    expect(() => loadGoogleConfig({ ...googleTestEnv, SALES_CRM_AUTH_ENABLED: 'false' })).toThrow('session-only');
    expect(() => loadGoogleConfig({ ...googleTestEnv, DIZZLE_WEB_PORT: '5380' })).toThrow('callback');
    expect(() => loadGoogleConfig({ ...googleTestEnv, GOOGLE_OIDC_REDIRECT_URI: googleTestConfig.redirectUri + '?redirect=1' })).toThrow('callback');
    expect(loadGoogleConfig({
      ...googleTestEnv, DIZZLE_WEB_PORT: '5380', GOOGLE_OIDC_REDIRECT_URI: 'http://localhost:5380' + googleAuthApi + '/callback',
    })?.origin).toBe('http://localhost:5380');
    expect(loadSessionPolicy({ SALES_CRM_SESSION_IDLE_MINUTES: '10', SALES_CRM_SESSION_MAX_HOURS: '2' }))
      .toEqual({ idle: 600_000, absolute: 7_200_000 });
    expect(() => loadSessionPolicy({ SALES_CRM_SESSION_IDLE_MINUTES: '0' })).toThrow();
  });
});
