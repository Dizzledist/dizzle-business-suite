import { randomUUID } from 'node:crypto';
import { closeSync, mkdirSync, openSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { z } from 'zod';
import { accountStatuses, salesRoles, type AccountStatus, type SalesDirectory, type SalesRole } from '../../../shared/sales-auth';
import { openSqliteDatabase, transaction } from '../../sqlite';
import { ApiError } from '../../workflow';
import type { ReportingScope } from '../reporting/routes';
import { absoluteLifetime, idleLifetime, isSessionToken, newSessionToken, sessionDigest } from './sessions';

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
const access = account.pick({ status: true, role: true, team: true }).strict();
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
};
type SessionRow = UserRow & { expires_at: number };
type DirectoryRow = UserRow & { email: string; department: string; last_login_at: number | null; zoho_salesperson_id: string | null };

export function openSalesIdentity(path = resolve('.sales-auth-private', 'identity.sqlite'), now = Date.now) {
  if (path !== ':memory:') {
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    try { closeSync(openSync(path, 'wx', 0o600)); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
  }
  const db = openSqliteDatabase(path, [new URL('./migrations/001-identity.sql', import.meta.url)]);
  return new SalesIdentityStore(db, now);
}

export class SalesIdentityStore {
  constructor(private readonly db: DatabaseSync, private readonly now: () => number) {}

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
      const at = this.now();
      const token = newSessionToken();
      const id = String(user.id);
      this.db.prepare('DELETE FROM sales_sessions WHERE expires_at <= ? OR last_seen_at <= ?').run(at, at - idleLifetime);
      if (isSessionToken(previousToken)) {
        this.db.prepare('DELETE FROM sales_sessions WHERE token_digest = ? AND user_id = ?').run(sessionDigest(previousToken), id);
      }
      this.db.prepare('INSERT INTO sales_sessions VALUES (?, ?, ?, ?, ?)').run(
        sessionDigest(token), id, at, at, at + absoluteLifetime,
      );
      this.db.prepare('UPDATE sales_users SET last_login_at = ? WHERE id = ?').run(at, id);
      this.audit(String(user.organization_id), id, id, 'signed-in');
      return token;
    });
  }

  resolveSession(token: string | undefined, touch = true) {
    if (!isSessionToken(token)) return undefined;
    const at = this.now();
    const digest = sessionDigest(token);
    const row = this.db.prepare(`SELECT u.id, u.organization_id, u.name, u.role, u.status, u.team_id, s.expires_at
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
    const user = this.db.prepare('SELECT id, organization_id, name, role, status, team_id FROM sales_users WHERE id = ? AND organization_id = ?')
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
      if (next.role === user.role && next.status === user.status && next.team === user.team_id) return;
      if (user.role === 'admin' && user.status === 'active' && (next.role !== 'admin' || next.status !== 'active') &&
          !this.db.prepare(`SELECT 1 FROM sales_users WHERE organization_id = ? AND id <> ? AND role = 'admin' AND status = 'active' LIMIT 1`)
            .get(actor.organization_id, userId)) throw new ApiError(409, 'At least one active administrator is required.');
      this.db.prepare('UPDATE sales_users SET role = ?, status = ?, team_id = ? WHERE id = ?')
        .run(next.role, next.status, next.team, userId);
      this.db.prepare('DELETE FROM sales_sessions WHERE user_id = ?').run(userId);
      this.audit(actor.organization_id, actor.id, userId, 'access-changed', {
        before: { role: user.role, status: user.status, team: user.team_id }, after: next,
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

  directory(token: string): SalesDirectory {
    return transaction(this.db, () => {
      const actor = this.administrator(token);
      const users = this.db.prepare(`SELECT u.id, u.name, u.email, u.role, u.department, u.team_id, u.status, u.last_login_at,
        m.zoho_salesperson_id FROM sales_users u LEFT JOIN sales_user_zoho_mappings m
        ON m.organization_id = u.organization_id AND m.user_id = u.id
        WHERE u.organization_id = ? ORDER BY u.name, u.id LIMIT 250`).all(actor.organization_id) as DirectoryRow[];
      const audit = this.db.prepare(`SELECT action, at, actor_id, target_id FROM sales_identity_audit
        WHERE organization_id = ? ORDER BY id DESC LIMIT 30`).all(actor.organization_id);
      return {
        users: users.map(row => ({
          id: row.id, name: row.name, email: row.email, role: row.role, department: row.department,
          team: row.team_id, status: row.status, zohoSalespersonId: row.zoho_salesperson_id,
          lastLogin: row.last_login_at === null ? null : new Date(row.last_login_at).toISOString(),
        })),
        audit: audit.map(row => ({
          action: String(row.action), at: new Date(Number(row.at)).toISOString(),
          actorId: row.actor_id === null ? null : String(row.actor_id), targetId: String(row.target_id),
        })),
      };
    }, 'read');
  }
}
