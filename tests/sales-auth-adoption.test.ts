import { describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { planSalesAdoption, type SalesAdoptionSnapshot, type VerifiedSalesBinding } from '../server/auth/sales-adoption-plan';
import { IdentityStore, migrateIdentity } from '../server/auth/store';
const source: SalesAdoptionSnapshot = {
  users: [
    { id: 'sales-rep-17', organizationId: 'pilot-org', name: 'Fixture rep', email: 'rep@example.test', issuer: 'password', subject: 'old-rep', department: 'sales', teamId: 'team-a', role: 'sales_rep', status: 'active' },
    { id: 'sales-admin-42', organizationId: 'pilot-org', name: 'Fixture admin', email: 'admin@example.test', issuer: 'password', subject: 'old-admin', department: 'sales', teamId: null, role: 'admin', status: 'disabled' },
  ],
  mappings: [{ organizationId: 'pilot-org', userId: 'sales-rep-17', zohoSalespersonId: 'fixture-zoho-17', verificationReference: 'fixture-evidence', verifiedBy: 'sales-admin-42' }],
  assignments: [{ organizationId: 'pilot-org', accountId: 'fixture-account-a', employeeId: 'sales-rep-17' }],
  approvals: [{ organizationId: 'pilot-org', id: 'historical-approval-1', actorId: 'sales-admin-42' }],
};
const bindings = (): VerifiedSalesBinding[] => source.users.map(u => ({ id: u.id, organizationId: u.organizationId, subject: 'verified-google-' + u.id, hostedDomain: 'example.test', grants: [] }));
describe('fixture-only Sales shared identity migration rehearsal', () => {
  it('preserves IDs/roles/teams/mappings/assignments/history and provisions an isolated target without inheriting grants', () => {
    const before = JSON.stringify(source), plan = planSalesAdoption(source, bindings());
    expect(JSON.stringify(source)).toBe(before); expect(plan.preserved).toEqual(source); expect(plan.passwordSessionsImported).toBe(false);
    const directory = mkdtempSync(join(tmpdir(), 'dizzle-sales-rehearsal-')); migrateIdentity(join(directory, 'target.sqlite')); const store = new IdentityStore(join(directory, 'target.sqlite'));
    try {
      for (const employee of plan.employees) store.provision(employee, 'fixture-rehearsal');
      expect(store.employee('sales-rep-17', 'pilot-org')?.grants).toEqual([]);
      expect(store.employee('sales-admin-42', 'pilot-org')).toBeNull();
      expect(store.employee('sales-admin-42', 'pilot-org', false)?.id).toBe('sales-admin-42');
      expect(plan.preserved.approvals[0].actorId).toBe('sales-admin-42');
    } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
  });
  it.each(['duplicate-subject', 'missing-binding', 'wrong-org', 'orphan-approval', 'cross-org-assignment'] as const)('holds the rehearsal for %s', reason => {
    const copy = structuredClone(source), proposed = bindings();
    if (reason === 'duplicate-subject') proposed[1].subject = proposed[0].subject;
    if (reason === 'missing-binding') proposed.pop();
    if (reason === 'wrong-org') proposed[0].organizationId = 'other-org';
    if (reason === 'orphan-approval') copy.approvals[0].actorId = 'missing';
    if (reason === 'cross-org-assignment') copy.assignments[0].organizationId = 'other-org';
    expect(() => planSalesAdoption(copy, proposed)).toThrow();
  });
});
