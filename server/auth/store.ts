import { DatabaseSync } from 'node:sqlite';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, resolve, sep } from 'node:path';
import { z } from 'zod';
import { employeeGrants, employeeRoles, type EmployeeContext, type GooglePrincipal } from '../../shared/identity';
import { ApiError } from '../workflow';
import { absoluteLifetime, idleLifetime, digest, isSessionToken, newSessionToken, sessionDigest } from './sessions';
const id = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/);
export const employeeInput = z.object({ id, organizationId: id, issuer: z.literal('https://accounts.google.com'), subject: z.string().min(1).max(255).regex(/^\S+$/), hostedDomain: z.string().min(1).max(255), email: z.string().email().max(254), name: z.string().min(1).max(150), active: z.boolean(), grants: z.array(z.enum(employeeGrants)).max(employeeGrants.length), roles: z.array(z.enum(employeeRoles)).max(employeeRoles.length).default([]), retailStoreIds: z.array(id).max(100).default([]) }).strict();
export function privateIdentityPath(path: string) {
  const root = resolve('.'), result = resolve(path);
  if (!isAbsolute(path) || result.toLowerCase() === root.toLowerCase() || result.toLowerCase().startsWith((root + sep).toLowerCase())) throw new Error('Identity state must be an absolute private path outside the checkout.');
  return result;
}
function connect(path: string) { const db = new DatabaseSync(path); db.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;'); return db; }
export function migrateIdentity(path: string) {
  privateIdentityPath(path); mkdirSync(dirname(path), { recursive: true, mode: 0o700 }); const db = connect(path);
  try { const version = (db.prepare('PRAGMA user_version').get() as any).user_version; if (version === 2) return; if (![0, 1].includes(version)) throw new Error('Unsupported identity schema.'); db.exec('BEGIN IMMEDIATE'); try { if (version === 0) db.exec(readFileSync(new URL('./001-shared-identity.sql', import.meta.url), 'utf8')); db.exec(readFileSync(new URL('./002-reporting-access.sql', import.meta.url), 'utf8')); db.exec('COMMIT'); } catch(error) { db.exec('ROLLBACK'); throw error; } } finally { db.close(); }
}
export class IdentityStore {
  private db: DatabaseSync;
  constructor(path: string, private now: () => number = Date.now) {
    privateIdentityPath(path); if (!existsSync(path)) throw new Error('Identity database missing. Run reviewed explicit migration first.');
    this.db = connect(path); if ((this.db.prepare('PRAGMA user_version').get() as any).user_version !== 2) { this.db.close(); throw new Error('Run the reviewed identity migration before startup.'); }
  }
  close() { this.db.close(); }
  private transaction<T>(work: () => T) { this.db.exec('BEGIN IMMEDIATE'); try { const result = work(); this.db.exec('COMMIT'); return result; } catch(error) { this.db.exec('ROLLBACK'); throw error; } }
  private audit(org: string | null, actor: string, target: string, action: string) { this.db.prepare('INSERT INTO identity_audit(organization_id,actor,target,action,at) VALUES(?,?,?,?,?)').run(org, actor, target, action, this.now()); }
  provision(input: z.input<typeof employeeInput>, operator: string) {
    const employee = employeeInput.parse(input);
    this.transaction(() => {
      this.db.prepare('INSERT INTO employees VALUES(?,?,?,?,?,?,?,?)').run(employee.id, employee.organizationId, employee.issuer, employee.subject, employee.hostedDomain, employee.email, employee.name, Number(employee.active));
      for (const grant of new Set(employee.grants)) this.db.prepare('INSERT INTO employee_grants VALUES(?,?)').run(employee.id, grant);
      this.reportingAccess(employee.id, employee.roles, employee.retailStoreIds);
      this.db.prepare('DELETE FROM pending_principals WHERE issuer=? AND subject=?').run(employee.issuer, employee.subject); this.audit(employee.organizationId, operator, employee.id, 'employee-provisioned');
    });
  }
  changeAccess(employeeId: string, organizationId: string, active: boolean, grants: readonly string[], operator: string, roles?: readonly string[], retailStoreIds?: readonly string[]) {
    z.boolean().parse(active);
    const parsed = z.array(z.enum(employeeGrants)).parse(grants);
    this.transaction(() => { if (!this.employee(employeeId, organizationId, false)) throw new ApiError(404, 'Employee not in organization.');
      this.db.prepare('UPDATE employees SET active=? WHERE id=? AND organization_id=?').run(Number(active), employeeId, organizationId);
      this.db.prepare('DELETE FROM employee_grants WHERE employee_id=?').run(employeeId); for (const grant of new Set(parsed)) this.db.prepare('INSERT INTO employee_grants VALUES(?,?)').run(employeeId, grant);
      this.reportingAccess(employeeId, roles, retailStoreIds);
      if (!active) this.db.prepare('DELETE FROM sessions WHERE employee_id=?').run(employeeId); this.audit(organizationId, operator, employeeId, 'access-changed'); });
  }
  private reportingAccess(employeeId: string, roles?: readonly string[], stores?: readonly string[]) {
    if (roles !== undefined) { const parsed = z.array(z.enum(employeeRoles)).max(employeeRoles.length).parse(roles); this.db.prepare('DELETE FROM employee_roles WHERE employee_id=?').run(employeeId); for (const role of new Set(parsed)) this.db.prepare('INSERT INTO employee_roles VALUES(?,?)').run(employeeId, role); }
    if (stores !== undefined) { const parsed = z.array(id).max(100).parse(stores); this.db.prepare('DELETE FROM employee_retail_stores WHERE employee_id=?').run(employeeId); for (const store of new Set(parsed)) this.db.prepare('INSERT INTO employee_retail_stores VALUES(?,?)').run(employeeId, store); }
  }
  employee(employeeId: string, organizationId: string, requireActive = true): EmployeeContext | null {
    const row: any = this.db.prepare('SELECT * FROM employees WHERE id=? AND organization_id=?').get(employeeId, organizationId); if (!row || requireActive && !row.active) return null;
    return { id: row.id, organizationId: row.organization_id, name: row.name, email: row.email, roles: this.db.prepare('SELECT role FROM employee_roles WHERE employee_id=? ORDER BY role').all(row.id).map((r: any) => r.role), retailStoreIds: this.db.prepare('SELECT store_id FROM employee_retail_stores WHERE employee_id=? ORDER BY store_id').all(row.id).map((r: any) => r.store_id), grants: this.db.prepare('SELECT grant_name FROM employee_grants WHERE employee_id=? ORDER BY grant_name').all(row.id).map((g: any) => g.grant_name) };
  }
  pending() { return this.db.prepare('SELECT * FROM pending_principals ORDER BY seen_at').all(); }
  startSession(principal: GooglePrincipal, organizationId: string, previous?: string) {
    const row: any = this.db.prepare('SELECT * FROM employees WHERE issuer=? AND subject=?').get(principal.issuer, principal.subject);
    if (!row) { this.db.prepare('INSERT INTO pending_principals VALUES(?,?,?,?,?,?) ON CONFLICT(issuer,subject) DO UPDATE SET seen_at=excluded.seen_at').run(principal.issuer, principal.subject, principal.hostedDomain, principal.email, principal.name, this.now()); throw new ApiError(403, 'Employee access has not been provisioned.'); }
    if (!row.active || row.organization_id !== organizationId || row.hosted_domain !== principal.hostedDomain) throw new ApiError(403, 'Employee access is unavailable for this organization.');
    return this.transaction(() => { const token = newSessionToken(), at = this.now(); if (isSessionToken(previous)) this.db.prepare('DELETE FROM sessions WHERE token_digest=?').run(sessionDigest(previous)); this.db.prepare('INSERT INTO sessions VALUES(?,?,?,?,?)').run(sessionDigest(token), row.id, at, at, at + absoluteLifetime); this.audit(organizationId, row.id, row.id, 'signed-in'); return token; });
  }
  session(token: string | undefined, organizationId: string) {
    if (!isSessionToken(token)) throw new ApiError(401, 'Employee session required.');
    const row: any = this.db.prepare('SELECT * FROM sessions WHERE token_digest=? AND expires_at>? AND last_seen_at>?').get(sessionDigest(token), this.now(), this.now() - idleLifetime); if (!row) throw new ApiError(401, 'Employee session expired or revoked.');
    const employee = this.employee(row.employee_id, organizationId); if (!employee) throw new ApiError(403, 'Employee disabled or outside organization.'); this.db.prepare('UPDATE sessions SET last_seen_at=? WHERE token_digest=?').run(this.now(), sessionDigest(token)); return { employee, expiresAt: row.expires_at };
  }
  logout(token: string) { this.db.prepare('DELETE FROM sessions WHERE token_digest=?').run(sessionDigest(token)); }
  createFlow(state: string, binding: string, nonce: string, verifier: string) { this.db.prepare('DELETE FROM oidc_flows WHERE expires_at<=?').run(this.now()); this.db.prepare('INSERT INTO oidc_flows VALUES(?,?,?,?,?)').run(digest('state', state), digest('binding', binding), nonce, verifier, this.now() + 300_000); }
  consumeFlow(state: string, binding: string): { nonce: string; verifier: string } {
    const row: any = this.db.prepare('DELETE FROM oidc_flows WHERE state_digest=? AND binding_digest=? AND expires_at>? RETURNING nonce,verifier').get(digest('state', state), digest('binding', binding), this.now()); if (!row) throw new ApiError(401, 'Invalid or expired sign-in request.'); return row;
  }
  issueWorkload(workerId: string, organizationId: string, lifetimeMs: number, operator: string) {
    id.parse(workerId); id.parse(organizationId); if (lifetimeMs < 60_000 || lifetimeMs > 86_400_000) throw new Error('Worker lifetime must be one minute through 24 hours.');
    const token = newSessionToken(); this.transaction(() => { this.db.prepare("INSERT INTO workloads VALUES(?,?,?,'publishing:authorize',?,1)").run(workerId, organizationId, digest('worker', token), this.now() + lifetimeMs); this.audit(organizationId, operator, workerId, 'workload-issued'); }); return token;
  }
  workload(token: string) { if (!isSessionToken(token)) throw new ApiError(401, 'Worker credential required.'); const row: any = this.db.prepare("SELECT id,organization_id FROM workloads WHERE token_digest=? AND active=1 AND expires_at>? AND permission='publishing:authorize'").get(digest('worker', token), this.now()); if (!row) throw new ApiError(401, 'Invalid or revoked worker credential.'); return { id: row.id as string, organizationId: row.organization_id as string }; }
  revokeWorkload(workerId: string, organizationId: string, operator: string) { this.db.prepare('UPDATE workloads SET active=0 WHERE id=? AND organization_id=?').run(workerId, organizationId); this.audit(organizationId, operator, workerId, 'workload-revoked'); }
}
