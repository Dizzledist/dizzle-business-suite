import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { request } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApi } from '../server/api';
import { createPasswordAuth } from '../server/sales-crm/auth/passwords';
import { csrfToken, newSessionToken, sessionCookieName, sessionDigest } from '../server/sales-crm/auth/sessions';
import { openSalesIdentity } from '../server/sales-crm/auth/store';
import { createSyntheticReporting } from '../server/sales-crm/reporting/demo';
import { saveSalesperson, upsertInvoice } from '../server/sales-crm/reporting/database';
import { invoiceDetail, mirrorInvoice } from '../server/sales-crm/zoho/invoice';
import { openSqliteDatabase } from '../server/sqlite';
import { reportingApi } from '../shared/reporting';
import { passwordAuthApi, salesAuthApi, type SalesDirectory, type SalesRole } from '../shared/sales-auth';
import { invoicePayload } from './fixtures/zoho-invoices';
import { reconciliationApi } from '../shared/reconciliation';
import { loadZohoBindingPolicy, zohoBindingApi, type ZohoBindingPolicy } from '../server/sales-crm/auth/zoho-binding';

const origin = 'http://127.0.0.1:5173';
const adminEmail = 'admin@example.test';
const firstPassword = 'Fixture only! Cocoa lakes 82';
const nextPassword = 'Fixture only! Sapphire rivers 17';
const tenant = 'password-test-company';
const usersPath = salesAuthApi + '/admin/users';
const admin = { name: 'Sample Admin', email: adminEmail, department: 'sales', team: null };
let api: ReturnType<typeof createApi> | undefined;
let closeStores: (() => void) | undefined;

async function start(options: { clock?: () => number; enabled?: boolean; configured?: boolean; bindingPolicy?: ZohoBindingPolicy } = {}) {
  vi.stubEnv('NODE_ENV', 'test');
  vi.stubEnv('SALES_CRM_ENABLED', 'true');
  vi.stubEnv('SALES_CRM_AUTH_ENABLED', 'true');
  vi.stubEnv('SALES_CRM_PASSWORD_ENABLED', options.enabled === false ? 'false' : 'true');
  const identity = openSalesIdentity(':memory:', options.clock, options.bindingPolicy);
  const reporting = await createSyntheticReporting({ path: ':memory:' });
  closeStores = () => { identity.close(); reporting.db.close(); };
  const passwords = await createPasswordAuth(identity);
  api = createApi(undefined, undefined, reporting, identity, { passwords: options.configured === false ? undefined : passwords });
  api.listen(0, '127.0.0.1');
  await once(api, 'listening');
  const port = (api.address() as AddressInfo).port;

  function send(path: string, method = 'GET', headers: Record<string, string> = {}, body?: string) {
    return new Promise<{ status: number; body: string; headers: import('node:http').IncomingHttpHeaders }>((resolve, reject) => {
      const req = request({
        host: '127.0.0.1', port, path, method,
        headers: { Host: new URL(origin).host, ...headers, ...(body === undefined ? {} : { 'Content-Length': Buffer.byteLength(body) }) },
      }, res => {
        let content = '';
        res.setEncoding('utf8');
        res.on('data', chunk => { content += chunk; });
        res.on('end', () => resolve({ status: res.statusCode!, body: content, headers: res.headers }));
      });
      req.on('error', reject);
      req.end(body);
    });
  }

  const cookieHeader = (cookie: string) => ({ Cookie: cookie });
  const authHeaders = (cookie: string) => ({ Cookie: cookie, Origin: origin, 'X-CSRF-Token': csrfToken(cookie.split('=')[1]) });
  function json(path: string, values: unknown, method = 'POST', cookie?: string, headers: Record<string, string> = {}) {
    return send(path, method, { Origin: origin, 'Content-Type': 'application/json', ...(cookie ? authHeaders(cookie) : {}), ...headers },
      JSON.stringify(values));
  }
  function redeem(email: string, code: string, password = firstPassword) {
    return json(passwordAuthApi + '/redeem', { email, code, password });
  }
  async function login(email: string, password = firstPassword, previousCookie?: string) {
    const response = await json(passwordAuthApi + '/login', { email, password }, 'POST', undefined,
      previousCookie ? cookieHeader(previousCookie) : {});
    const cookie = response.headers['set-cookie']?.[0].split(';')[0];
    return { ...response, cookie };
  }
  async function administrator(organizationId = tenant) {
    const approved = identity.bootstrapPasswordAdministrator(organizationId, admin);
    expect((await redeem(adminEmail, approved.code)).status).toBe(200);
    const signed = await login(adminEmail);
    expect(signed.status).toBe(200);
    return signed.cookie!;
  }
  async function directory(cookie: string) {
    const response = await send(salesAuthApi + '/admin', 'GET', cookieHeader(cookie));
    expect(response.status).toBe(200);
    return JSON.parse(response.body) as SalesDirectory;
  }
  async function createEmployee(cookie: string, name: string, team: string | null, role: SalesRole = 'sales_rep') {
    const email = name.toLowerCase().replaceAll(' ', '.') + '@example.test';
    const response = await json(usersPath, { name, email, department: 'sales', team, role }, 'POST', cookie);
    expect(response.status).toBe(200);
    const code = JSON.parse(response.body).code as string;
    const user = (await directory(cookie)).users.find(entry => entry.email === email)!;
    return { email, code, id: user.id };
  }
  return { identity, reporting, send, json, cookieHeader, authHeaders, redeem, login, administrator, directory, createEmployee };
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

describe('Company email and password authentication', () => {
  it('limits reconciliation to password administrators of the synthetic tenant and rejects browser org changes', async () => {
    const { administrator, send, cookieHeader, createEmployee, redeem, login } = await start();
    expect((await send(reconciliationApi)).status).toBe(401);
    expect((await send(reconciliationApi, 'GET', { 'X-Demo-Identity': 'admin' })).status).toBe(401);
    const admin = await administrator('demo-o1');
    const response = await send(reconciliationApi, 'GET', cookieHeader(admin));
    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body).not.toMatch(/password_hash|refresh_token|access_token|client_secret/);
    for (const role of ['sales_rep', 'sales_manager'] as const) {
      const employee = await createEmployee(admin, 'Recon ' + role, 'team', role);
      await redeem(employee.email, employee.code);
      const signed = (await login(employee.email)).cookie!;
      expect((await send(reconciliationApi, 'GET', cookieHeader(signed))).status).toBe(403);
      expect((await send(zohoBindingApi, 'GET', cookieHeader(signed))).status).toBe(403);
    }
    expect((await send(reconciliationApi + '?organizationId=821729823', 'GET', cookieHeader(admin))).status).toBe(400);
    expect((await send(reconciliationApi, 'POST', cookieHeader(admin))).status).toBe(404);
  });

  it('keeps demo tenants ineligible for live binding even for their administrator', async () => {
    const { administrator, send, cookieHeader, json } = await start();
    const admin = await administrator('demo-o1');
    const view = await send(zohoBindingApi, 'GET', cookieHeader(admin));
    expect(JSON.parse(view.body)).toMatchObject({ eligible: false, state: 'unconfigured', liveAccess: false });
    expect((await json(zohoBindingApi, { action: 'approve', expectedRevision: 0, approvalReference: 'owner-review' }, 'PUT', admin)).status)
      .toBe(403);
    expect(() => loadZohoBindingPolicy({ SALES_ZOHO_TENANT_ID: 'demo-o1', SALES_ZOHO_APPROVAL_REFERENCE: 'owner-review' })).toThrow();
    expect(() => loadZohoBindingPolicy({ SALES_ZOHO_TENANT_ID: '821729823', SALES_ZOHO_APPROVAL_REFERENCE: 'owner-review' })).toThrow();
  });

  it('audits explicit tenant approval and revocation with CSRF and revision checks while keeping live access disabled', async () => {
    const policy = { tenantId: 'dizzle-company', approvalReference: 'review-2026-11' };
    const { administrator, send, cookieHeader, json, directory } = await start({ bindingPolicy: policy });
    const token = await administrator(policy.tenantId);
    expect((await send(reconciliationApi, 'GET', cookieHeader(token))).status).toBe(403);
    const input = { action: 'approve', expectedRevision: 0, approvalReference: policy.approvalReference };
    expect((await send(zohoBindingApi, 'PUT', { ...cookieHeader(token), 'Content-Type': 'application/json' },
      JSON.stringify(input))).status).toBe(403);
    expect((await json(zohoBindingApi, { ...input, tenantId: 'another-company' }, 'PUT', token)).status).toBe(400);
    expect((await json(zohoBindingApi, { ...input, organizationId: '901' }, 'PUT', token)).status).toBe(400);
    expect((await json(zohoBindingApi, { ...input, approvalReference: 'unapproved' }, 'PUT', token)).status).toBe(403);
    const approved = await json(zohoBindingApi, input, 'PUT', token);
    expect(approved.status).toBe(200);
    expect(JSON.parse(approved.body)).toMatchObject({ tenantId: policy.tenantId, organizationId: '821729823',
      state: 'approved', revision: 1, liveAccess: false });
    expect((await json(zohoBindingApi, input, 'PUT', token)).status).toBe(409);
    expect((await json(zohoBindingApi, { ...input, action: 'revoke', expectedRevision: 1 }, 'PUT', token)).status).toBe(200);
    expect((await directory(token)).audit.filter(entry => entry.action === 'zoho-organization-binding-changed')).toHaveLength(2);
  });
  it('serves synthetic PDFs only to an authenticated employee with matching invoice scope', async () => {
    const { administrator, createEmployee, identity, reporting, redeem, login, send, cookieHeader } = await start();
    const token = await administrator('demo-o1');
    const employee = await createEmployee(token, 'Invoice Sample Rep', null);
    await redeem(employee.email, employee.code);
    identity.setZohoMapping(token.split('=')[1], employee.id, { salespersonId: '1', verificationReference: 'fixture-1' });
    reporting.db.prepare("UPDATE reporting_invoices SET credited_user_id = ? WHERE organization_id = 'demo-o1' AND invoice_id = '1001'")
      .run(employee.id);
    const rep = (await login(employee.email)).cookie!;
    const path = reportingApi + '/invoices/1001/pdf';
    expect((await send(path)).status).toBe(401);
    expect((await send(path, 'GET', { 'X-Demo-Identity': 'admin' })).status).toBe(401);
    const allowed = await send(path, 'GET', cookieHeader(rep));
    expect(allowed.status).toBe(200);
    expect(allowed.headers).toMatchObject({ 'content-type': 'application/pdf', 'cache-control': 'private, no-store' });
    expect(allowed.body).toMatch(/^%PDF-/);
    expect(allowed.body).not.toContain(rep);
    expect((await send(reportingApi + '/invoices/1003/pdf', 'GET',
      { ...cookieHeader(rep), 'X-Role': 'admin' })).status).toBe(404);
    expect((await send(reportingApi + '/invoices/01001/pdf', 'GET', cookieHeader(token))).status).toBe(404);
    expect((await send(reportingApi + '/invoices/1009/pdf', 'GET', cookieHeader(token))).status).toBe(404);
    expect((await send(path + '?organizationId=821729823', 'GET', cookieHeader(token))).status).toBe(400);
    expect((await send(path, 'POST', cookieHeader(token))).status).toBe(404);
    const products = await send(reportingApi + '/products', 'GET', cookieHeader(rep));
    expect(products.status).toBe(200);
    expect(JSON.parse(products.body).purchaseHistory.map((row: { invoiceId: string }) => row.invoiceId)).toEqual(['1001']);
  });

  it('denies invoice PDFs and aggregate rows from a different CRM tenant', async () => {
    const { administrator, send, cookieHeader } = await start();
    const token = await administrator();
    expect((await send(reportingApi + '/invoices/1001/pdf', 'GET', cookieHeader(token))).status).toBe(404);
    const products = await send(reportingApi + '/products', 'GET', cookieHeader(token));
    expect(products.status).toBe(200);
    expect(JSON.parse(products.body).purchaseHistory).toEqual([]);
  });
  it('requires a trusted first-administrator setup, uses salted Argon2id, and issues a secure CRM cookie', async () => {
    const { identity, login, redeem, send, cookieHeader, createEmployee } = await start();
    const approved = identity.bootstrapPasswordAdministrator(tenant, admin);
    expect((await login(adminEmail)).status).toBe(401);
    expect((await redeem('different@example.test', approved.code)).status).toBe(400);
    expect((await redeem(adminEmail, approved.code, 'short')).status).toBe(400);
    expect((await redeem(adminEmail, approved.code, 'Password Password')).status).toBe(400);
    expect((await redeem(adminEmail, approved.code)).status).toBe(200);
    expect((await redeem(adminEmail, approved.code)).status).toBe(400);
    expect(() => identity.bootstrapPasswordAdministrator(tenant, admin)).toThrow('already been established');
    const signed = await login(adminEmail.toUpperCase());
    expect(signed.status).toBe(200);
    expect(signed.headers['set-cookie']).toEqual([
      expect.stringMatching(/^__Host-dizzle_sales_session=[\w-]+; Path=\/; Secure; HttpOnly; SameSite=Lax; Max-Age=28800$/),
    ]);
    const view = await send(salesAuthApi + '/session', 'GET', cookieHeader(signed.cookie!));
    expect(JSON.parse(view.body)).toMatchObject({ displayName: 'Sample Admin', role: 'admin', email: adminEmail });
    expect(view.headers['cache-control']).toBe('no-store');
    expect(view.body).not.toContain(firstPassword);
    const employee = await createEmployee(signed.cookie!, 'Salt Example', null);
    expect((await redeem(employee.email, employee.code)).status).toBe(200);
    const digest = identity.passwordLoginTarget(adminEmail)!.password_hash;
    expect(digest).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
    expect(identity.passwordLoginTarget(employee.email)!.password_hash).not.toBe(digest);
  });

  it('uses the same response for unknown, disabled and wrong-password attempts', async () => {
    const { administrator, createEmployee, redeem, login, json } = await start();
    const token = await administrator();
    const employee = await createEmployee(token, 'Disabled Sample', null);
    await redeem(employee.email, employee.code);
    const change = { role: 'sales_rep', status: 'disabled', team: null };
    expect((await json(usersPath + '/' + employee.id + '/access', change, 'PUT', token)).status).toBe(200);
    const samples = [
      await login(adminEmail, 'wrong password for fixture'), await login('absent@example.test'), await login(employee.email),
    ];
    expect(samples.map(result => [result.status, result.body, result.cookie]))
      .toEqual(Array.from({ length: 3 }, () => [401, '{"error":"Email or password is incorrect."}', undefined]));
  });

  it('limits per-email attempts across case variants and resumes after the server window', async () => {
    let at = Date.now();
    const { administrator, login } = await start({ clock: () => at });
    await administrator();
    for (let index = 0; index < 5; index++) {
      expect((await login(index % 2 ? adminEmail.toUpperCase() : adminEmail, 'incorrect password')).status).toBe(401);
    }
    expect((await login(adminEmail)).status).toBe(429);
    expect((await login('other@example.test')).status).toBe(401);
    at += 15 * 60_000;
    expect((await login(adminEmail)).status).toBe(200);
  });

  it('rejects requests lacking an exact browser origin and ignores fabricated identity and privilege fields', async () => {
    const { administrator, send, json } = await start();
    const cookie = await administrator();
    const body = JSON.stringify({ email: adminEmail, password: firstPassword });
    const content = { 'Content-Type': 'application/json' };
    expect((await send(passwordAuthApi + '/login', 'POST', content, body)).status).toBe(403);
    expect((await send(passwordAuthApi + '/login', 'POST', { ...content, Origin: 'http://localhost:5173' }, body)).status).toBe(403);
    expect((await send(passwordAuthApi + '/login', 'POST', { ...content, Origin: origin, 'X-Demo-Identity': 'admin' }, body)).status).toBe(403);
    expect((await json(passwordAuthApi + '/login', { email: adminEmail, password: firstPassword, role: 'admin' })).status).toBe(400);
    expect((await send(reportingApi, 'GET', { 'X-Demo-Identity': 'admin' })).status).toBe(401);
    expect((await send(reportingApi, 'GET', { Cookie: cookie, 'X-Demo-Identity': 'admin' })).status).toBe(401);
  });

  it('restricts employee creation and code issuance to CSRF-protected administrators', async () => {
    const { administrator, createEmployee, login, redeem, json, send, cookieHeader } = await start();
    const token = await administrator();
    const employee = await createEmployee(token, 'Sales Fixture', 'north');
    expect((await login(employee.email)).status).toBe(401);
    expect((await redeem(employee.email, employee.code)).status).toBe(200);
    const rep = (await login(employee.email)).cookie!;
    const request = { name: 'Attempt', email: 'bad@example.test', department: 'sales', team: null, role: 'admin' };
    expect((await json(usersPath, request, 'POST', rep)).status).toBe(403);
    expect((await json(usersPath, request, 'POST', token, { 'X-CSRF-Token': csrfToken(newSessionToken()) })).status).toBe(403);
    expect((await json(usersPath, { ...request, organizationId: 'other' }, 'POST', token)).status).toBe(400);
    expect((await send(salesAuthApi + '/admin', 'GET', cookieHeader(rep))).status).toBe(403);
    expect((await send(usersPath + '/' + employee.id + '/credential', 'POST', cookieHeader(rep))).status).toBe(403);
  });

  it('records generic reset requests, invalidates replaced codes, and revokes sessions after a single redemption', async () => {
    const { administrator, createEmployee, redeem, login, json, send, directory, authHeaders, cookieHeader } = await start();
    const adminCookie = await administrator();
    const employee = await createEmployee(adminCookie, 'Recovery Example', null);
    await redeem(employee.email, employee.code);
    const prior = (await login(employee.email)).cookie!;
    const known = await json(passwordAuthApi + '/forgot', { email: employee.email });
    const unknown = await json(passwordAuthApi + '/forgot', { email: 'unrecognized@example.test' });
    expect([known.status, known.body]).toEqual([unknown.status, unknown.body]);
    expect(known.body).toBe('{"received":true}');
    expect((await directory(adminCookie)).users.find(user => user.id === employee.id)?.resetRequestedAt).toBeTruthy();
    const path = usersPath + '/' + employee.id + '/credential';
    const old = JSON.parse((await send(path, 'POST', authHeaders(adminCookie))).body);
    const current = JSON.parse((await send(path, 'POST', authHeaders(adminCookie))).body);
    expect(old.purpose).toBe('reset');
    expect((await redeem(employee.email, old.code, nextPassword)).status).toBe(400);
    const outcomes = await Promise.all([redeem(employee.email, current.code, nextPassword), redeem(employee.email, current.code, nextPassword)]);
    expect(outcomes.map(result => result.status).sort()).toEqual([200, 400]);
    expect((await send(salesAuthApi + '/session', 'GET', cookieHeader(prior))).status).toBe(401);
    expect((await login(employee.email)).status).toBe(401);
    expect((await login(employee.email, nextPassword)).status).toBe(200);
    expect((await directory(adminCookie)).users.find(user => user.id === employee.id)?.resetRequestedAt).toBeNull();
  });

  it('allows the local operator to recover only the matching sole active password administrator', async () => {
    const { identity, administrator, redeem, login, send, cookieHeader } = await start();
    const before = await administrator();
    expect(() => identity.recoverSolePasswordAdministrator(tenant, 'other@example.test')).toThrow();
    expect(() => identity.recoverSolePasswordAdministrator('another-organization', adminEmail)).toThrow();
    const recovery = identity.recoverSolePasswordAdministrator(tenant, adminEmail);
    expect(recovery.purpose).toBe('reset');
    expect((await redeem(adminEmail, recovery.code)).status).toBe(400);
    expect((await redeem(adminEmail, recovery.code, nextPassword)).status).toBe(200);
    expect((await send(salesAuthApi + '/session', 'GET', cookieHeader(before))).status).toBe(401);
    expect((await login(adminEmail, nextPassword)).status).toBe(200);
  });

  it('expires setup and reset codes and invalidates them if the administrator disables the employee', async () => {
    let at = Date.now();
    const { identity, redeem, login, administrator, createEmployee, send, authHeaders, json } = await start({ clock: () => at });
    const setup = identity.bootstrapPasswordAdministrator(tenant, admin);
    at += 24 * 60 * 60_000;
    expect((await redeem(adminEmail, setup.code)).status).toBe(400);
    expect(() => identity.bootstrapPasswordAdministrator(tenant, { ...admin, email: 'other@example.test' })).toThrow();
    const token = await administrator();
    const employee = await createEmployee(token, 'Expiry Fixture', null);
    await redeem(employee.email, employee.code);
    const path = usersPath + '/' + employee.id;
    const action = JSON.parse((await send(path + '/credential', 'POST', authHeaders(token))).body);
    at += 30 * 60_000;
    expect((await redeem(employee.email, action.code, nextPassword)).status).toBe(400);
    const fresh = (await login(adminEmail)).cookie!;
    const toDisable = JSON.parse((await send(path + '/credential', 'POST', authHeaders(fresh))).body);
    await json(path + '/access', { role: 'sales_rep', status: 'disabled', team: null }, 'PUT', fresh);
    expect((await redeem(employee.email, toDisable.code, nextPassword)).status).toBe(400);
  });

  it('requires the current password and CSRF for changes and rotates or revokes active sessions', async () => {
    const { administrator, login, json, send, authHeaders, cookieHeader } = await start();
    const before = await administrator();
    const rotated = (await login(adminEmail, firstPassword, before)).cookie!;
    expect((await send(salesAuthApi + '/session', 'GET', cookieHeader(before))).status).toBe(401);
    expect((await json(passwordAuthApi + '/change', { current: 'wrong', password: nextPassword }, 'POST', rotated)).status).toBe(400);
    expect((await json(passwordAuthApi + '/change', { current: firstPassword, password: nextPassword }, 'POST', undefined, cookieHeader(rotated))).status).toBe(403);
    const another = (await login(adminEmail)).cookie!;
    expect((await json(passwordAuthApi + '/change', { current: firstPassword, password: nextPassword }, 'POST', rotated)).status).toBe(200);
    expect((await send(salesAuthApi + '/session', 'GET', cookieHeader(another))).status).toBe(401);
    const after = (await login(adminEmail, nextPassword)).cookie!;
    expect((await send(salesAuthApi + '/logout', 'POST', cookieHeader(after))).status).toBe(403);
    expect((await send(salesAuthApi + '/logout', 'POST', authHeaders(after))).status).toBe(200);
    expect((await send(salesAuthApi + '/session', 'GET', cookieHeader(after))).status).toBe(401);
  });

  it('enforces rep and team reporting scope and preserves mappings through credential changes', async () => {
    const { identity, reporting, administrator, createEmployee, redeem, login, send, cookieHeader, directory, authHeaders } = await start();
    const token = await administrator();
    const users = [
      ['North Rep', 'north', 'sales_rep', '8101', '701'],
      ['South Rep', 'south', 'sales_rep', '8102', '702'],
      ['North Manager', 'north', 'sales_manager', '8103', '703'],
    ] as const;
    const sessions = new Map<string, { cookie: string; id: string; email: string }>();
    for (const [name, team, role, invoiceId, zohoId] of users) {
      const employee = await createEmployee(token, name, team, role);
      await redeem(employee.email, employee.code);
      identity.setZohoMapping(token.split('=')[1], employee.id, { salespersonId: zohoId, verificationReference: 'fixture-' + zohoId });
      saveSalesperson(reporting.db, tenant, zohoId, employee.id, name);
      const at = Date.now();
      const instant = new Date(at).toISOString();
      const data = invoiceDetail.parse({ invoice: invoicePayload({
        invoice_id: invoiceId, invoice_number: 'PASSWORD-' + invoiceId, salesperson_id: zohoId,
        created_time: new Date(at - 1000).toISOString(), last_modified_time: instant,
      }) }).invoice;
      upsertInvoice(reporting.db, mirrorInvoice(tenant, data), {
        status: 'verified', firstEmailAt: instant, source: 'Fixture receipt', id: 'receipt-' + invoiceId,
        subtotal: '100.23', currency: 'USD', salespersonId: zohoId,
      }, at);
      sessions.set(name, { ...employee, cookie: (await login(employee.email)).cookie! });
    }
    const north = sessions.get('North Rep')!;
    const manager = sessions.get('North Manager')!;
    expect((await send(reportingApi + '/invoices/8102', 'GET', { ...cookieHeader(north.cookie), 'X-Role': 'admin' })).status).toBe(404);
    expect((await send(reportingApi + '/invoices/8102', 'GET', cookieHeader(manager.cookie))).status).toBe(404);
    const view = await send(reportingApi, 'GET', cookieHeader(manager.cookie));
    expect(JSON.parse(view.body).invoices.map((row: { id: string }) => row.id).sort()).toEqual(['8101', '8103']);
    expect(JSON.parse(view.body).source).toBe('synthetic');
    const reset = JSON.parse((await send(usersPath + '/' + north.id + '/credential', 'POST', authHeaders(token))).body);
    expect((await redeem(north.email, reset.code, nextPassword)).status).toBe(200);
    expect((await directory(token)).users.find(user => user.id === north.id)?.zohoSalespersonId).toBe('701');
    const updated = (await login(north.email, nextPassword)).cookie!;
    expect((await send(usersPath + '/' + north.id + '/revoke', 'POST', authHeaders(token))).status).toBe(200);
    expect((await send(reportingApi, 'GET', cookieHeader(updated))).status).toBe(401);
  });

  it('expires idle password sessions and rejects earlier fixture-issued sessions in password mode', async () => {
    let at = Date.now();
    const { identity, administrator, send, cookieHeader } = await start({ clock: () => at });
    const token = await administrator();
    const issuer = 'https://fixture.example.test';
    identity.bootstrapAdministrator('fixture-organization', { issuer, subject: 'fixture', ...admin });
    const fixture = identity.startSession({ issuer, subject: 'fixture' });
    expect((await send(reportingApi, 'GET', { Cookie: sessionCookieName + '=' + fixture })).status).toBe(401);
    at += 30 * 60_000;
    expect((await send(reportingApi, 'GET', cookieHeader(token))).status).toBe(401);
  });

  it.each([{ enabled: false }, { configured: false }])('fails closed for disabled or unavailable password mode', async options => {
    const { send, login } = await start(options);
    expect(JSON.parse((await send(passwordAuthApi + '/status')).body)).toEqual({ configured: false });
    expect((await login(adminEmail)).status).toBe(404);
  });

  it('preserves an existing user and session when migrating the old identity database', () => {
    const folder = mkdtempSync(join(tmpdir(), 'dizzle-password-migration-'));
    const path = join(folder, 'identity.sqlite');
    const at = Date.now();
    try {
      const old = openSqliteDatabase(path, [new URL('../server/sales-crm/auth/migrations/001-identity.sql', import.meta.url)]);
      const session = newSessionToken();
      try {
        old.prepare('INSERT INTO sales_users VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
          'existing-id', tenant, 'Existing Employee', 'existing@example.test', 'https://fixture.example.test',
          'existing-subject', 'sales', 'north', 'sales_rep', 'active', at, at,
        );
        old.prepare('INSERT INTO sales_sessions VALUES (?, ?, ?, ?, ?)').run(sessionDigest(session), 'existing-id', at, at, at + 30_000);
      } finally { old.close(); }
      const updated = openSalesIdentity(path, () => at);
      try { expect(updated.resolveSession(session)).toMatchObject({ id: 'existing-id', role: 'sales_rep', password_authenticated: 0 }); }
      finally { updated.close(); }
    } finally { rmSync(folder, { recursive: true }); }
  });
});
