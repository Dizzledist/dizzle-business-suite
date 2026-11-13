import { createHash, randomUUID } from 'node:crypto';
import { closeSync, mkdirSync, openSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { z } from 'zod';
import { accountStatuses, salesRoles, type AccountStatus, type SalesDirectory, type SalesRole } from '../../../shared/sales-auth';
import { openSqliteDatabase, transaction } from '../../sqlite';
import { ApiError } from '../../workflow';
import type { ReportingScope } from '../reporting/routes';
import { absoluteLifetime, idleLifetime, isSessionToken, newSessionToken, sessionDigest } from './sessions';
import { loadZohoBindingPolicy, type ZohoBindingPolicy } from './zoho-binding';
import { zohoOrganizationId } from '../zoho/config';

const slug = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/);
const principal = z.object({
  issuer: z.url({ protocol: /^https$/ }).max(500),
  subject: z.string().min(1).max(255).regex(/^[^\s\x00-\x1f\x7f]+$/),
});
const account = principal.extend({
  name: z.string().trim().min(1).max(150),
  email: z.email().max(254).transform(value => value.toLowerCase()),
  department: slug,
  team: slug.nullable(),
  role: z.enum(salesRoles),
  status: z.enum(accountStatuses),
});
const access = account.pick({ status: true, role: true, team: true }).extend({ department: slug.optional() }).strict();
const passwordEmployee = account.pick({ name: true, email: true, department: true, team: true, role: true }).strict();
const localPasswordIssuer = 'https://password.dizzle.invalid';
const setupLifetime = 24 * 60 * 60_000;
const resetLifetime = 30 * 60_000;
const attemptWindow = 15 * 60_000;
const attemptLimits = { login: [5, 120], forgot: [3, 60], redeem: [8, 60], change: [5, 60] } as const;
type Attempt = keyof typeof attemptLimits;
type PasswordPurpose = 'setup' | 'reset';
export type PasswordEmployee = z.input<typeof passwordEmployee>;

function passwordDigest(kind: string, value: string) {
  return createHash('sha256').update(kind + '\0' + value).digest('hex');
}
const mapping = z.object({
  salespersonId: z.string().regex(/^[1-9]\d{0,39}$/),
  verificationReference: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,63}$/),
}).strict();

export type VerifiedPrincipal = Readonly<z.input<typeof principal>>;
export type NewSalesUser = z.input<typeof account>;
type AccessChange = z.input<typeof access>;
type VerifiedMapping = z.input<typeof mapping>;

type UserRow = {
  id: string; organization_id: string; name: string; role: SalesRole; status: AccountStatus; team_id: string | null;
  email: string; department: string;
};
type SessionRow = UserRow & { expires_at: number; password_authenticated: number };
type DirectoryRow = UserRow & {
  last_login_at: number | null; zoho_salesperson_id: string | null; credential: string | null;
  password_ready: number; requested_at: number | null;
};
type PasswordTarget = { id: string; organization_id: string; email: string; password_hash: string };
type PasswordAction = { id: string; organization_id: string; purpose: PasswordPurpose; password_hash: string | null };

export function openSalesIdentity(
  path = resolve('.sales-auth-private', 'identity.sqlite'), now = Date.now, policy?: ZohoBindingPolicy,
) {
  const validated = policy ? loadZohoBindingPolicy({
    SALES_ZOHO_TENANT_ID: policy.tenantId, SALES_ZOHO_APPROVAL_REFERENCE: policy.approvalReference,
  }) : undefined;
  if (path !== ':memory:') {
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    try { closeSync(openSync(path, 'wx', 0o600)); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
  }
  const db = openSqliteDatabase(path, [
    new URL('./migrations/001-identity.sql', import.meta.url),
    new URL('./migrations/002-password-credentials.sql', import.meta.url),
    new URL('./migrations/003-zoho-binding.sql', import.meta.url),
  ]);
  return new SalesIdentityStore(db, now, validated);
}

export class SalesIdentityStore {
  constructor(
    private readonly db: DatabaseSync, private readonly now: () => number, private readonly bindingPolicy?: ZohoBindingPolicy,
  ) {}

  close() { this.db.close(); }

  private audit(organization: string, actor: string | null, target: string, action: string, details?: object) {
    this.db.prepare(`INSERT INTO sales_identity_audit (organization_id, actor_id, target_id, action, at, change_details)
      VALUES (?, ?, ?, ?, ?, ?)`).run(organization, actor, target, action, this.now(), details ? JSON.stringify(details) : null);
  }

  private addUser(organization: string, input: NewSalesUser, actor: string | null) {
    const data = account.parse(input);
    const id = randomUUID();
    this.db.prepare(`INSERT INTO sales_users
      (id, organization_id, name, email, issuer, subject, department, team_id, role, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      id, organization, data.name, data.email, data.issuer, data.subject, data.department, data.team, data.role, data.status, this.now(),
    );
    this.audit(organization, actor, id, 'user-provisioned', { role: data.role, status: data.status, team: data.team });
    return id;
  }

  // Trusted server operation for a new organization. No HTTP bootstrap route.
  bootstrapAdministrator(organization: string, input: Omit<NewSalesUser, 'role' | 'status'>) {
    const tenant = slug.parse(organization);
    return transaction(this.db, () => {
      if (this.db.prepare('SELECT 1 FROM sales_users WHERE organization_id = ? LIMIT 1').get(tenant)) {
        throw new ApiError(409, 'An administrator has already been provisioned.');
      }
      return this.addUser(tenant, { ...input, role: 'admin', status: 'active' }, null);
    });
  }

  // The caller must have already verified the external identity. This method
  // never accepts browser claims and is not mounted as an HTTP endpoint.
  startSession(verified: VerifiedPrincipal, previousToken?: string) {
    const { issuer, subject } = principal.parse(verified);
    return transaction(this.db, () => {
      const user = this.db.prepare(`SELECT id, organization_id FROM sales_users
        WHERE issuer = ? AND subject = ? AND status = 'active'`).get(issuer, subject);
      if (!user) throw new ApiError(401, 'Company sign-in is unavailable for this account.');
      return this.issueSession(String(user.id), String(user.organization_id), false, previousToken);
    });
  }

  private issueSession(id: string, organization: string, byPassword: boolean, previousToken?: string) {
    const at = this.now();
    const token = newSessionToken();
    this.db.prepare('DELETE FROM sales_sessions WHERE expires_at <= ? OR last_seen_at <= ?').run(at, at - idleLifetime);
    if (isSessionToken(previousToken)) this.db.prepare('DELETE FROM sales_sessions WHERE token_digest = ?').run(sessionDigest(previousToken));
    this.db.prepare(`INSERT INTO sales_sessions
      (token_digest, user_id, issued_at, last_seen_at, expires_at, password_authenticated) VALUES (?, ?, ?, ?, ?, ?)`)
      .run(sessionDigest(token), id, at, at, at + absoluteLifetime, Number(byPassword));
    this.db.prepare('UPDATE sales_users SET last_login_at = ? WHERE id = ?').run(at, id);
    this.audit(organization, id, id, 'signed-in');
    return token;
  }

  resolveSession(token: string | undefined, touch = true) {
    if (!isSessionToken(token)) return undefined;
    const at = this.now();
    const digest = sessionDigest(token);
    const row = this.db.prepare(`SELECT u.id, u.organization_id, u.name, u.role, u.status, u.team_id, u.email, u.department, s.expires_at, s.password_authenticated
      FROM sales_sessions s JOIN sales_users u ON u.id = s.user_id
      WHERE s.token_digest = ? AND s.expires_at > ? AND s.last_seen_at > ? AND u.status = 'active'`)
      .get(digest, at, at - idleLifetime) as SessionRow | undefined;
    if (row && touch) this.db.prepare('UPDATE sales_sessions SET last_seen_at = MAX(last_seen_at, ?) WHERE token_digest = ?').run(at, digest);
    return row;
  }

  logout(token: string) {
    transaction(this.db, () => {
      const user = this.resolveSession(token, false);
      if (!user) return;
      this.db.prepare('DELETE FROM sales_sessions WHERE token_digest = ?').run(sessionDigest(token));
      this.audit(user.organization_id, user.id, user.id, 'signed-out');
    });
  }

  private administrator(token: string) {
    const actor = this.resolveSession(token, false);
    if (!actor) throw new ApiError(401, 'Company sign-in required.');
    if (actor.role !== 'admin') throw new ApiError(403, 'Administrator access required.');
    return actor;
  }

  private target(actor: UserRow, id: string) {
    const user = this.db.prepare('SELECT id, organization_id, name, role, status, team_id, email, department FROM sales_users WHERE id = ? AND organization_id = ?')
      .get(id, actor.organization_id) as UserRow | undefined;
    if (!user) throw new ApiError(404, 'User not found.');
    return user;
  }

  provisionUser(token: string, input: NewSalesUser) {
    return transaction(this.db, () => {
      const actor = this.administrator(token);
      return this.addUser(actor.organization_id, input, actor.id);
    });
  }

  changeAccess(token: string, userId: string, input: AccessChange) {
    const next = access.parse(input);
    transaction(this.db, () => {
      const actor = this.administrator(token);
      const user = this.target(actor, userId);
      const department = next.department ?? user.department;
      if (next.role === user.role && next.status === user.status && next.team === user.team_id && department === user.department) return;
      if (actor.password_authenticated && next.status === 'active' && !this.db.prepare(
        'SELECT 1 FROM sales_password_credentials WHERE user_id = ? AND password_hash IS NOT NULL',
      ).get(user.id)) throw new ApiError(409, 'The employee must complete password setup.');
      if (user.role === 'admin' && user.status === 'active' && (next.role !== 'admin' || next.status !== 'active') &&
          !this.db.prepare(`SELECT 1 FROM sales_users u WHERE organization_id = ? AND id <> ? AND role = 'admin' AND status = 'active'
            AND (? = 0 OR EXISTS (SELECT 1 FROM sales_password_credentials c WHERE c.user_id = u.id AND c.password_hash IS NOT NULL)) LIMIT 1`)
            .get(actor.organization_id, userId, actor.password_authenticated)) throw new ApiError(409, 'At least one active administrator is required.');
      this.db.prepare('UPDATE sales_users SET role = ?, status = ?, team_id = ?, department = ? WHERE id = ?')
        .run(next.role, next.status, next.team, department, userId);
      this.revokeUserSessions(userId);
      if (next.status === 'disabled') this.clearPasswordActions(userId);
      this.audit(actor.organization_id, actor.id, userId, 'access-changed', {
        before: { role: user.role, status: user.status, team: user.team_id, department: user.department }, after: { ...next, department },
      });
    });
  }

  setZohoMapping(token: string, userId: string, input: VerifiedMapping | null) {
    const next = input === null ? null : mapping.parse(input);
    transaction(this.db, () => {
      const actor = this.administrator(token);
      this.target(actor, userId);
      const prior = this.db.prepare(`SELECT zoho_salesperson_id, verification_reference FROM sales_user_zoho_mappings
        WHERE organization_id = ? AND user_id = ?`).get(actor.organization_id, userId);
      if (!next && !prior) return;
      if (next) {
        if (prior?.zoho_salesperson_id === next.salespersonId && prior.verification_reference === next.verificationReference) return;
        if (this.db.prepare(`SELECT 1 FROM sales_user_zoho_mappings WHERE organization_id = ? AND zoho_salesperson_id = ? AND user_id <> ?`)
          .get(actor.organization_id, next.salespersonId, userId)) throw new ApiError(409, 'This salesperson is already mapped.');
        this.db.prepare(`INSERT INTO sales_user_zoho_mappings VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT (organization_id, user_id) DO UPDATE SET zoho_salesperson_id = excluded.zoho_salesperson_id,
            verification_reference = excluded.verification_reference, verified_by = excluded.verified_by, verified_at = excluded.verified_at`)
          .run(actor.organization_id, userId, next.salespersonId, next.verificationReference, actor.id, this.now());
      } else {
        this.db.prepare('DELETE FROM sales_user_zoho_mappings WHERE organization_id = ? AND user_id = ?')
          .run(actor.organization_id, userId);
      }
      this.audit(actor.organization_id, actor.id, userId, 'zoho-mapping-changed', {
        before: prior?.zoho_salesperson_id ?? null, after: next?.salespersonId ?? null,
      });
    });
  }

  private passwordAdministrator(token: string) {
    const actor = this.administrator(token);
    if (!actor.password_authenticated) throw new ApiError(403, 'Password administrator access required.');
    return actor;
  }

  private registerPassword(userId: string, email: string) {
    if (this.db.prepare('SELECT 1 FROM sales_password_credentials WHERE login_email = ?').get(email)) {
      throw new ApiError(409, 'That email is already enrolled.');
    }
    this.db.prepare('INSERT INTO sales_password_credentials (user_id, login_email) VALUES (?, ?)').run(userId, email);
  }

  private issuePasswordCode(userId: string, organization: string, actor: string | null, purpose: PasswordPurpose) {
    const code = newSessionToken();
    const expires = this.now() + (purpose === 'setup' ? setupLifetime : resetLifetime);
    this.db.prepare(`INSERT INTO sales_password_actions VALUES (?, ?, ?, ?)
      ON CONFLICT (user_id) DO UPDATE SET token_digest = excluded.token_digest, purpose = excluded.purpose, expires_at = excluded.expires_at`)
      .run(userId, passwordDigest('password-action', code), purpose, expires);
    this.db.prepare('DELETE FROM sales_password_reset_requests WHERE user_id = ?').run(userId);
    this.audit(organization, actor, userId, 'password-' + purpose + '-issued');
    return { code, purpose, expiresAt: new Date(expires).toISOString() };
  }

  bootstrapPasswordAdministrator(organization: string, input: Omit<PasswordEmployee, 'role'>) {
    const tenant = slug.parse(organization);
    const employee = passwordEmployee.parse({ ...input, role: 'admin' });
    return transaction(this.db, () => {
      const rows = this.db.prepare(`SELECT u.id, u.organization_id, u.email, u.issuer, u.role, u.status, c.password_hash
        FROM sales_users u LEFT JOIN sales_password_credentials c ON c.user_id = u.id LIMIT 2`).all();
      const initial = rows[0];
      if (!initial) {
        const id = this.addUser(tenant, { ...employee, issuer: localPasswordIssuer, subject: randomUUID(), status: 'pending' }, null);
        this.registerPassword(id, employee.email);
        return this.issuePasswordCode(id, tenant, null, 'setup');
      }
      if (rows.length !== 1 || initial.organization_id !== tenant || initial.email !== employee.email ||
          initial.issuer !== localPasswordIssuer || initial.role !== 'admin' || initial.status !== 'pending' || initial.password_hash) {
        throw new ApiError(409, 'The initial administrator has already been established.');
      }
      return this.issuePasswordCode(String(initial.id), tenant, null, 'setup');
    });
  }

  recoverSolePasswordAdministrator(organization: string, email: string) {
    const tenant = slug.parse(organization);
    const address = account.shape.email.parse(email);
    return transaction(this.db, () => {
      const eligible = this.db.prepare(`SELECT u.id, c.login_email FROM sales_users u
        JOIN sales_password_credentials c ON c.user_id = u.id WHERE u.organization_id = ?
        AND u.role = 'admin' AND u.status = 'active' AND c.password_hash IS NOT NULL LIMIT 2`).all(tenant);
      if (eligible.length !== 1 || eligible[0].login_email !== address) {
        throw new ApiError(409, 'Local recovery requires the matching sole active password administrator.');
      }
      return this.issuePasswordCode(String(eligible[0].id), tenant, null, 'reset');
    });
  }

  invitePasswordEmployee(token: string, input: PasswordEmployee) {
    const employee = passwordEmployee.parse(input);
    return transaction(this.db, () => {
      const actor = this.passwordAdministrator(token);
      if (this.db.prepare('SELECT 1 FROM sales_users WHERE organization_id = ? AND email = ?')
        .get(actor.organization_id, employee.email)) throw new ApiError(409, 'This employee is already in the directory.');
      const id = this.addUser(actor.organization_id, {
        ...employee, issuer: localPasswordIssuer, subject: randomUUID(), status: 'pending',
      }, actor.id);
      this.registerPassword(id, employee.email);
      return this.issuePasswordCode(id, actor.organization_id, actor.id, 'setup');
    });
  }

  issueEmployeePasswordCode(token: string, userId: string) {
    return transaction(this.db, () => {
      const actor = this.passwordAdministrator(token);
      const user = this.target(actor, userId);
      if (user.status === 'disabled') throw new ApiError(409, 'Enable the employee before issuing a code.');
      const credential = this.db.prepare('SELECT password_hash FROM sales_password_credentials WHERE user_id = ?').get(user.id);
      if (credential?.password_hash && user.status !== 'active') throw new ApiError(409, 'Enable the employee before issuing a reset code.');
      if (!credential) this.registerPassword(user.id, user.email);
      return this.issuePasswordCode(user.id, actor.organization_id, actor.id, credential?.password_hash ? 'reset' : 'setup');
    });
  }

  revokeEmployeeSessions(token: string, userId: string) {
    transaction(this.db, () => {
      const actor = this.passwordAdministrator(token);
      const user = this.target(actor, userId);
      this.revokeUserSessions(user.id);
      this.audit(actor.organization_id, actor.id, user.id, 'sessions-revoked');
    });
  }

  private revokeUserSessions(userId: string) {
    this.db.prepare('DELETE FROM sales_sessions WHERE user_id = ?').run(userId);
  }

  private clearPasswordActions(userId: string) {
    this.db.prepare('DELETE FROM sales_password_actions WHERE user_id = ?').run(userId);
    this.db.prepare('DELETE FROM sales_password_reset_requests WHERE user_id = ?').run(userId);
  }

  takePasswordAttempt(kind: Attempt, email: string) {
    transaction(this.db, () => {
      const at = this.now();
      this.db.prepare('DELETE FROM sales_password_rate_limits WHERE expires_at <= ?').run(at);
      const entries = [passwordDigest(kind, email), kind];
      const read = this.db.prepare('SELECT count FROM sales_password_rate_limits WHERE attempt_key = ?');
      const [perEmail, total] = attemptLimits[kind];
      if (Number(read.get(entries[0])?.count ?? 0) >= perEmail || Number(read.get(entries[1])?.count ?? 0) >= total) {
        throw new ApiError(429, 'Too many attempts. Try again in a few minutes.');
      }
      const record = this.db.prepare(`INSERT INTO sales_password_rate_limits VALUES (?, 1, ?)
        ON CONFLICT (attempt_key) DO UPDATE SET count = count + 1`);
      for (const key of entries) record.run(key, at + attemptWindow);
    });
  }

  requestPasswordReset(email: string) {
    this.takePasswordAttempt('forgot', email);
    this.db.prepare(`INSERT INTO sales_password_reset_requests (user_id, requested_at)
      SELECT u.id, ? FROM sales_password_credentials c JOIN sales_users u ON u.id = c.user_id
      WHERE c.login_email = ? AND u.status = 'active' AND c.password_hash IS NOT NULL
      ON CONFLICT (user_id) DO UPDATE SET requested_at = excluded.requested_at`).run(this.now(), email);
  }

  passwordLoginTarget(email: string) {
    return this.db.prepare(`SELECT u.id, u.organization_id, c.login_email AS email, c.password_hash
      FROM sales_password_credentials c JOIN sales_users u ON u.id = c.user_id
      WHERE c.login_email = ? AND u.status = 'active' AND c.password_hash IS NOT NULL`)
      .get(email) as PasswordTarget | undefined;
  }

  finishPasswordLogin(userId: string, digest: string, previousToken?: string) {
    return transaction(this.db, () => {
      const user = this.db.prepare(`SELECT u.organization_id, c.login_email FROM sales_users u JOIN sales_password_credentials c
        ON c.user_id = u.id WHERE u.id = ? AND u.status = 'active' AND c.password_hash = ?`).get(userId, digest);
      if (!user) throw new ApiError(401, 'Email or password is incorrect.');
      this.db.prepare('DELETE FROM sales_password_rate_limits WHERE attempt_key = ?')
        .run(passwordDigest('login', String(user.login_email)));
      return this.issueSession(userId, String(user.organization_id), true, previousToken);
    });
  }

  findPasswordAction(email: string, code: string) {
    return this.db.prepare(`SELECT u.id, u.organization_id, a.purpose, c.password_hash FROM sales_password_actions a
      JOIN sales_password_credentials c ON c.user_id = a.user_id JOIN sales_users u ON u.id = a.user_id
      WHERE c.login_email = ? AND a.token_digest = ? AND a.expires_at > ? AND
        ((a.purpose = 'setup' AND c.password_hash IS NULL AND u.status IN ('pending', 'active')) OR
        (a.purpose = 'reset' AND c.password_hash IS NOT NULL AND u.status = 'active'))`)
      .get(email, passwordDigest('password-action', code), this.now()) as PasswordAction | undefined;
  }

  private replacePassword(userId: string, hash: string) {
    const result = this.db.prepare(`UPDATE sales_password_credentials SET password_hash = ?, changed_at = ?
      WHERE user_id = ? RETURNING login_email`).get(hash, this.now(), userId);
    if (!result) throw new ApiError(409, 'Password credentials are unavailable.');
    this.db.prepare('DELETE FROM sales_password_rate_limits WHERE attempt_key IN (?, ?)')
      .run(passwordDigest('login', String(result.login_email)), passwordDigest('change', String(result.login_email)));
    this.clearPasswordActions(userId);
    this.revokeUserSessions(userId);
  }

  completePasswordAction(email: string, code: string, hash: string) {
    transaction(this.db, () => {
      const action = this.findPasswordAction(email, code);
      if (!action) throw new ApiError(400, 'The setup or reset code is invalid or expired.');
      this.replacePassword(action.id, hash);
      if (action.purpose === 'setup') this.db.prepare("UPDATE sales_users SET status = 'active' WHERE id = ?").run(action.id);
      this.audit(action.organization_id, action.id, action.id, 'password-' + action.purpose + '-completed');
    });
  }

  passwordChangeTarget(token: string) {
    const user = this.resolveSession(token, false);
    const credential = user?.password_authenticated ? this.passwordLoginTarget(user.email) : undefined;
    if (!credential || credential.id !== user?.id) throw new ApiError(401, 'Company sign-in required.');
    return credential;
  }

  changePassword(token: string, previousHash: string, nextHash: string) {
    transaction(this.db, () => {
      const user = this.passwordChangeTarget(token);
      if (user.password_hash !== previousHash) throw new ApiError(401, 'Company sign-in required.');
      this.replacePassword(user.id, nextHash);
      this.audit(user.organization_id, user.id, user.id, 'password-changed');
    });
  }

  zohoBinding(token: string) {
    const actor = this.passwordAdministrator(token);
    const binding = this.db.prepare(`SELECT organization_id, revision, state, approval_reference FROM sales_zoho_bindings
      WHERE tenant_id = ?`).get(actor.organization_id);
    return {
      tenantId: actor.organization_id, organizationId: zohoOrganizationId,
      eligible: actor.organization_id === this.bindingPolicy?.tenantId,
      state: binding?.state ?? 'unconfigured', revision: Number(binding?.revision ?? 0),
      liveAccess: false,
    };
  }

  changeZohoBinding(token: string, input: {
    action: 'approve' | 'revoke'; expectedRevision: number; approvalReference: string;
  }) {
    return transaction(this.db, () => {
      const actor = this.passwordAdministrator(token);
      const policy = this.bindingPolicy;
      if (!policy || policy.tenantId !== actor.organization_id || input.approvalReference !== policy.approvalReference) {
        throw new ApiError(403, 'A server-approved live tenant and approval reference are required.');
      }
      const previous = this.zohoBinding(token);
      if (previous.revision !== input.expectedRevision) throw new ApiError(409, 'The binding changed. Reload before updating.');
      const state = input.action === 'approve' ? 'approved' : 'revoked';
      this.db.prepare(`INSERT INTO sales_zoho_bindings VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT (tenant_id) DO UPDATE SET revision = excluded.revision, state = excluded.state,
        approval_reference = excluded.approval_reference, approved_by = excluded.approved_by, updated_at = excluded.updated_at`)
        .run(actor.organization_id, zohoOrganizationId, previous.revision + 1, state, policy.approvalReference, actor.id, this.now());
      this.audit(actor.organization_id, actor.id, actor.id, 'zoho-organization-binding-changed', {
        organizationId: zohoOrganizationId, before: previous.state, after: state,
        revision: previous.revision + 1, reference: policy.approvalReference,
      });
      return this.zohoBinding(token);
    });
  }

  reportingScope(user: UserRow): ReportingScope {
    if (user.role === 'admin') return { organizationId: user.organization_id, credit: 'all' };
    const team = user.role === 'sales_manager' ? user.team_id : null;
    const scopedUsers = this.db.prepare(`SELECT u.id FROM sales_users u JOIN sales_user_zoho_mappings m
      ON m.organization_id = u.organization_id AND m.user_id = u.id
      WHERE u.organization_id = ? AND u.status = 'active'
        AND (u.id = ? OR (? IS NOT NULL AND u.team_id = ? AND u.role IN ('sales_rep', 'sales_manager')))`)
      .all(user.organization_id, user.id, team, team);
    return { organizationId: user.organization_id, credit: 'selected', userIds: scopedUsers.map(row => String(row.id)) };
  }

  directory(token: string, passwords = false): SalesDirectory {
    return transaction(this.db, () => {
      const actor = this.administrator(token);
      const users = this.db.prepare(`SELECT u.id, u.name, u.email, u.role, u.department, u.team_id, u.status, u.last_login_at,
        m.zoho_salesperson_id, c.user_id AS credential, c.password_hash IS NOT NULL AS password_ready, r.requested_at
        FROM sales_users u LEFT JOIN sales_user_zoho_mappings m ON m.organization_id = u.organization_id AND m.user_id = u.id
        LEFT JOIN sales_password_credentials c ON c.user_id = u.id LEFT JOIN sales_password_reset_requests r ON r.user_id = u.id
        WHERE u.organization_id = ? ORDER BY u.name, u.id LIMIT 250`).all(actor.organization_id) as DirectoryRow[];
      const audit = this.db.prepare(`SELECT action, at, actor_id, target_id FROM sales_identity_audit
        WHERE organization_id = ? ORDER BY id DESC LIMIT 30`).all(actor.organization_id);
      return {
        users: users.map(row => ({
          id: row.id, name: row.name, email: row.email, role: row.role, department: row.department,
          team: row.team_id, status: row.status, zohoSalespersonId: row.zoho_salesperson_id,
          lastLogin: row.last_login_at === null ? null : new Date(row.last_login_at).toISOString(),
          ...(passwords ? {
            passwordStatus: !row.credential ? 'unenrolled' : row.password_ready ? 'ready' : 'setup-required',
            resetRequestedAt: row.requested_at === null ? null : new Date(row.requested_at).toISOString(),
          } : {}),
        })),
        audit: audit.map(row => ({
          action: String(row.action), at: new Date(Number(row.at)).toISOString(),
          actorId: row.actor_id === null ? null : String(row.actor_id), targetId: String(row.target_id),
        })),
      };
    }, 'read');
  }
}
