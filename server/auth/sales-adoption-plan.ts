import { createHash } from 'node:crypto';
import { z } from 'zod';
import { employeeInput } from './store';
const user = z.object({ id: z.string(), organizationId: z.string(), name: z.string(), email: z.string(), issuer: z.string(), subject: z.string(), department: z.string(), teamId: z.string().nullable(), role: z.enum(['sales_rep', 'sales_manager', 'admin']), status: z.enum(['pending', 'active', 'disabled']) }).strict();
const snapshotSchema = z.object({
  users: z.array(user),
  mappings: z.array(z.object({ organizationId: z.string(), userId: z.string(), zohoSalespersonId: z.string(), verificationReference: z.string(), verifiedBy: z.string() }).strict()),
  assignments: z.array(z.object({ organizationId: z.string(), accountId: z.string(), employeeId: z.string() }).strict()),
  approvals: z.array(z.object({ organizationId: z.string(), id: z.string(), actorId: z.string() }).strict()),
}).strict();
export type SalesAdoptionSnapshot = z.input<typeof snapshotSchema>;
export type VerifiedSalesBinding = Pick<z.input<typeof employeeInput>, 'id' | 'organizationId' | 'subject' | 'hostedDomain' | 'grants'>;
// Dry-run plan only. No file/DB writes, passwords, session import or automatic role-to-grant mapping.
export function planSalesAdoption(input: SalesAdoptionSnapshot, bindings: VerifiedSalesBinding[]) {
  const snapshot = snapshotSchema.parse(input), ids = new Set(snapshot.users.map(u => u.id));
  if (ids.size !== snapshot.users.length || new Set(bindings.map(b => b.id)).size !== bindings.length || bindings.length !== snapshot.users.length) throw new Error('Review unique canonical IDs and an explicit verified binding for every employee.');
  for (const reference of [
    ...snapshot.mappings.flatMap(m => [{ organizationId: m.organizationId, id: m.userId }, { organizationId: m.organizationId, id: m.verifiedBy }]),
    ...snapshot.assignments.map(a => ({ organizationId: a.organizationId, id: a.employeeId })),
    ...snapshot.approvals.map(a => ({ organizationId: a.organizationId, id: a.actorId })),
  ]) if (!snapshot.users.some(u => u.id === reference.id && u.organizationId === reference.organizationId)) throw new Error('Orphan or cross-organization historical reference; hold migration.');
  const subjects = new Set<string>();
  const employees = snapshot.users.map(source => {
    const binding = bindings.find(b => b.id === source.id);
    if (!binding || binding.organizationId !== source.organizationId || subjects.has(binding.subject)) throw new Error('Missing, reused or cross-organization Google binding. Never match on email.');
    subjects.add(binding.subject);
    return employeeInput.parse({ ...binding, issuer: 'https://accounts.google.com', name: source.name, email: source.email, active: source.status === 'active' });
  });
  return { dryRun: true as const, sourceDigest: createHash('sha256').update(JSON.stringify(snapshot)).digest('hex'), employees,
    preserved: structuredClone(snapshot), passwordSessionsImported: false as const,
    requiredSignoff: ['Sales manager: IDs, roles, teams, assignments, mappings and historical actors', 'Cheddr/admin: verified Google bindings, grants, offboarding and cutover/rollback'] };
}
