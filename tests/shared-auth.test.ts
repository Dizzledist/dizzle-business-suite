import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { OAuth2Client } from 'google-auth-library';
import { IdentityStore, migrateIdentity } from '../server/auth/store';
import { createSharedAuthApi } from '../server/auth/api';
import { GoogleWorkspaceOidc } from '../server/auth/google';
import { absoluteLifetime, csrfToken, idleLifetime, oidcCookieName, sessionCookieName } from '../server/auth/sessions';
import { FixtureGoogle, principal, provision } from './fixtures/shared-identity';
export async function unusedPort() { const server = createServer(); server.listen(0, '127.0.0.1'); await once(server, 'listening'); const port = (server.address() as AddressInfo).port; await new Promise<void>(resolve => server.close(() => resolve())); return port; }

describe('shared employee sessions and scoped worker requests', () => {
  let root: string, store: IdentityStore, server: ReturnType<typeof createSharedAuthApi>, base: string, google: FixtureGoogle, clock: number;
  let resource = { organizationId: 'demo-o1', approvedBy: 'owner', fingerprint: 'a'.repeat(64), approvalCurrent: true, destinationMatches: true };
  let unavailable = false;
  beforeEach(async () => {
    root = mkdtempSync(join(tmpdir(), 'dizzle-shared-auth-')); clock = Date.now(); migrateIdentity(join(root, 'identity.sqlite')); store = new IdentityStore(join(root, 'identity.sqlite'), () => clock); provision(store); google = new FixtureGoogle();
    const port = await unusedPort(); base = 'http://127.0.0.1:' + port; resource = { organizationId: 'demo-o1', approvedBy: 'owner', fingerprint: 'a'.repeat(64), approvalCurrent: true, destinationMatches: true }; unavailable = false;
    server = createSharedAuthApi({ store, google, origin: base, organizationId: 'demo-o1', allowLoopbackHttp: true, resolvePublishingResource: async () => { if (unavailable) throw new Error('Unavailable'); return resource; } }); server.listen(port, '127.0.0.1'); await once(server, 'listening');
  });
  afterEach(async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); store.close(); rmSync(root, { recursive: true, force: true }); });
  async function login() {
    const start = await fetch(base + '/api/auth/google/start', { method: 'POST', redirect: 'manual', headers: { Origin: base } }); expect(start.status).toBe(302);
    const state = new URL(start.headers.get('location')!).searchParams.get('state')!; const binding = start.headers.getSetCookie()[0].split(';')[0];
    const callback = await fetch(base + '/api/auth/google/callback?' + new URLSearchParams({ code: 'verified-fixture-code', state }), { redirect: 'manual', headers: { Cookie: binding } });
    const cookie = callback.headers.getSetCookie().find(c => c.startsWith(sessionCookieName + '='))?.split(';')[0]; return { start, callback, cookie, state, binding };
  }
  async function worker(token: string, body: any = { jobId: 'job-1', fingerprint: resource.fingerprint }, extra = {}) { return fetch(base + '/api/internal/publishing/authorize', { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', ...extra }, body: JSON.stringify(body) }); }
  it('authenticates a preprovisioned verified subject and sets shared secure cookies', async () => {
    const { callback, cookie } = await login(); expect(callback.status).toBe(302); expect(callback.headers.getSetCookie()[0]).toContain('Secure; HttpOnly; SameSite=Lax');
    const response = await fetch(base + '/api/auth/session', { headers: { Cookie: cookie! } }); expect(response.status).toBe(200); const data = await response.json(); expect(data.employee).toMatchObject({ id: 'owner', organizationId: 'demo-o1', grants: ['asset:publish', 'asset:review', 'workspace:read'] }); expect(data.id_token).toBeUndefined();
    const raw = cookie!.split('=')[1]; expect(readFileSync(join(root, 'identity.sqlite')).includes(Buffer.from(raw))).toBe(false);
  });
  it('preserves a valid employee session across a store restart and reads current grants', () => {
    const token = store.startSession(principal(), 'demo-o1'); store.close(); store = new IdentityStore(join(root, 'identity.sqlite'), () => clock);
    expect(store.session(token, 'demo-o1').employee.id).toBe('owner');
    store.changeAccess('owner', 'demo-o1', true, ['workspace:read'], 'operator');
    expect(store.session(token, 'demo-o1').employee.grants).toEqual(['workspace:read']);
  });
  it('binds OAuth state to the initiating browser and consumes it once', async () => {
    const { state, binding, callback } = await login(); expect(callback.status).toBe(302);
    const replay = await fetch(base + `/api/auth/google/callback?code=verified-fixture-code&state=${state}`, { redirect: 'manual', headers: { Cookie: binding } }); expect(replay.status).toBe(401); expect(google.calls).toBe(1);
    const missingBinding = await fetch(base + `/api/auth/google/callback?code=verified-fixture-code&state=${state}`, { redirect: 'manual' }); expect(missingBinding.status).toBe(401);
  });
  it('does not auto-enroll an unknown subject or grant access based on email', async () => {
    google.selected = { ...principal('another-subject'), email: principal().email }; const result = await login(); expect(result.callback.status).toBe(403); expect(result.cookie).toBeUndefined(); expect(store.pending()).toHaveLength(1);
  });
  it('denies disabled users and revokes their existing sessions durably', async () => {
    const { cookie } = await login(); store.changeAccess('owner', 'demo-o1', false, [], 'operator');
    expect((await fetch(base + '/api/auth/session', { headers: { Cookie: cookie! } })).status).toBe(401); expect((await login()).callback.status).toBe(403);
    store.close(); store = new IdentityStore(join(root, 'identity.sqlite'), () => clock); expect(store.employee('owner', 'demo-o1')).toBeNull();
  });
  it('denies a session from the wrong organization', async () => {
    const foreign = provision(store, 'foreign', 'demo-o2'), token = store.startSession(foreign, 'demo-o2');
    expect((await fetch(base + '/api/auth/session', { headers: { Cookie: sessionCookieName + '=' + token } })).status).toBe(403);
  });
  it('loads current grants rather than keeping the original login privileges', async () => {
    const { cookie } = await login(); const other = new IdentityStore(join(root, 'identity.sqlite')); try { other.changeAccess('owner', 'demo-o1', true, ['workspace:read'], 'operator'); } finally { other.close(); }
    const current = await (await fetch(base + '/api/auth/session', { headers: { Cookie: cookie! } })).json(); expect(current.employee.grants).toEqual(['workspace:read']);
  });
  it('requires exact-origin CSRF protection for logout', async () => {
    const { cookie } = await login(); const token = cookie!.split('=')[1];
    expect((await fetch(base + '/api/auth/logout', { method: 'POST', headers: { Cookie: cookie!, Origin: base } })).status).toBe(403);
    expect((await fetch(base + '/api/auth/logout', { method: 'POST', headers: { Cookie: cookie!, Origin: 'https://wrong.example', 'X-CSRF-Token': csrfToken(token) } })).status).toBe(403);
    expect((await fetch(base + '/api/auth/logout', { method: 'POST', headers: { Cookie: cookie!, Origin: base, 'X-CSRF-Token': csrfToken(token) } })).status).toBe(200);
    expect((await fetch(base + '/api/auth/session', { headers: { Cookie: cookie! } })).status).toBe(401);
  });
  it('enforces idle and absolute session expiry', () => {
    const token = store.startSession(principal(), 'demo-o1'); clock += idleLifetime + 1; expect(() => store.session(token, 'demo-o1')).toThrow('expired');
    const second = store.startSession(principal(), 'demo-o1'); for (let i = 0; i < 16; i++) { clock += idleLifetime - 1; store.session(second, 'demo-o1'); } clock += 17; expect(() => store.session(second, 'demo-o1')).toThrow('expired'); expect(absoluteLifetime).toBe(8 * 60 * 60_000);
  });
  it('rejects duplicate session cookies and fixture identity headers', async () => {
    const { cookie } = await login(); expect((await fetch(base + '/api/auth/session', { headers: { Cookie: cookie! + '; ' + cookie! } })).status).toBe(401); expect((await fetch(base + '/api/auth/session', { headers: { Cookie: cookie!, 'X-Demo-Identity': 'owner' } })).status).toBe(401);
  });
  it('authenticates a scoped workload without an employee cookie or impersonation header', async () => {
    const token = store.issueWorkload('worker-1', 'demo-o1', 3_600_000, 'operator'); const response = await worker(token); expect(response.status).toBe(200); expect(await response.json()).toEqual({ jobId: 'job-1', fingerprint: resource.fingerprint });
    expect((await fetch(base + '/api/auth/session', { headers: { Authorization: 'Bearer ' + token } })).status).toBe(401);
  });
  it('denies invalid, expired and revoked worker credentials', async () => {
    expect((await worker('x'.repeat(43))).status).toBe(401); const token = store.issueWorkload('worker-1', 'demo-o1', 60_000, 'operator'); clock += 60_001; expect((await worker(token)).status).toBe(401);
    const current = store.issueWorkload('worker-2', 'demo-o1', 3_600_000, 'operator'); store.revokeWorkload('worker-2', 'demo-o1', 'operator'); expect((await worker(current)).status).toBe(401);
  });
  it('rejects employee tokens, cookies and client-supplied approver/grant fields on worker routes', async () => {
    const session = store.startSession(principal(), 'demo-o1'); expect((await worker(session)).status).toBe(401); const token = store.issueWorkload('worker-1', 'demo-o1', 3_600_000, 'operator');
    expect((await worker(token, undefined, { Cookie: sessionCookieName + '=' + session })).status).toBe(401);
    expect((await worker(token, { jobId: 'job-1', fingerprint: resource.fingerprint, approvedBy: 'owner', grants: ['asset:publish'] })).status).toBe(400);
    expect((await worker(token, undefined, { 'X-Demo-Identity': 'owner' })).status).toBe(401);
  });
  it('denies revoked employee publishing permission, changed approval and changed destination', async () => {
    const token = store.issueWorkload('worker-1', 'demo-o1', 3_600_000, 'operator'); store.changeAccess('owner', 'demo-o1', true, ['asset:review'], 'operator'); expect((await worker(token)).status).toBe(403);
    store.changeAccess('owner', 'demo-o1', true, ['asset:review', 'asset:publish'], 'operator'); resource.approvalCurrent = false; expect((await worker(token)).status).toBe(409); resource.approvalCurrent = true; resource.destinationMatches = false; expect((await worker(token)).status).toBe(409);
  });
  it('enforces both worker and approving-employee organization boundaries', async () => {
    const foreign = store.issueWorkload('foreign-worker', 'demo-o2', 3_600_000, 'operator'); expect((await worker(foreign)).status).toBe(403);
    const token = store.issueWorkload('worker-1', 'demo-o1', 3_600_000, 'operator'); resource.organizationId = 'demo-o2'; expect((await worker(token)).status).toBe(403); resource.organizationId = 'demo-o1'; resource.approvedBy = 'foreign'; provision(store, 'foreign', 'demo-o2'); expect((await worker(token)).status).toBe(403);
  });
  it('fails closed on unavailable publishing authorization', async () => { const token = store.issueWorkload('worker-1', 'demo-o1', 3_600_000, 'operator'); unavailable = true; expect((await worker(token)).status).toBe(503); });
});

describe('maintained Google token verifier boundary', () => {
  const valid = () => ({ iss: 'https://accounts.google.com', aud: 'fixture-client', sub: 'google-owner', hd: 'example.test', email_verified: true, email: 'owner@example.test', name: 'Owner', nonce: 'expected-nonce', exp: Math.floor(Date.now() / 1000) + 600 });
  function setup(claims = valid()) { const client = new OAuth2Client('fixture-client', 'fixture-secret', 'https://login.example.test/api/auth/google/callback'); const exchange = vi.spyOn(client, 'getToken').mockResolvedValue({ tokens: { id_token: 'fixture-signed-token' } } as any); const verify = vi.spyOn(client, 'verifyIdToken').mockResolvedValue({ getPayload: () => claims } as any); return { provider: new GoogleWorkspaceOidc('fixture-client', 'fixture-secret', 'https://login.example.test/api/auth/google/callback', 'example.test', client), exchange, verify }; }
  it('uses code+PKCE and maintained signature/audience verification, then verifies nonce/hd', async () => { const { provider, exchange, verify } = setup(); const url = new URL(provider.authorizationUrl('state', 'expected-nonce', 'verifier')); expect(url.searchParams.get('code_challenge_method')).toBe('S256'); expect(await provider.verify('code', 'expected-nonce', 'verifier')).toEqual({ ...principal(), email: 'owner@example.test', name: 'Owner' }); expect(exchange).toHaveBeenCalledWith(expect.objectContaining({ codeVerifier: 'verifier' })); expect(verify).toHaveBeenCalledWith({ idToken: 'fixture-signed-token', audience: 'fixture-client' }); });
  it.each(['issuer', 'audience', 'nonce', 'domain', 'verified-email', 'expiry'] as const)('rejects invalid %s despite caller-supplied profile data', async field => { const claims = valid(); if (field === 'issuer') claims.iss = 'https://evil.example'; if (field === 'audience') claims.aud = 'different-client'; if (field === 'nonce') claims.nonce = 'wrong'; if (field === 'domain') claims.hd = 'other.example'; if (field === 'verified-email') claims.email_verified = false; if (field === 'expiry') claims.exp = 1; await expect(setup(claims).provider.verify('code', 'expected-nonce', 'verifier')).rejects.toThrow('could not be verified'); });
  it('does not decode and trust a token when maintained signature verification rejects it', async () => { const { provider, verify } = setup(); verify.mockRejectedValue(new Error('bad signature')); await expect(provider.verify('code', 'expected-nonce', 'verifier')).rejects.toThrow('could not be verified'); });
});
