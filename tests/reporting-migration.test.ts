import { describe, it, expect } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import { IdentityStore, migrateIdentity } from '../server/auth/store';
import { sessionDigest } from '../server/auth/sessions';
describe('explicit shared identity reporting migration', () => {
  it('preserves v1 employee IDs, existing grants and sessions while defaulting new roles/store access to empty', () => {
    const root = mkdtempSync(join(tmpdir(), 'dizzle-reporting-migration-')), path = join(root, 'identity.sqlite');
    const db = new DatabaseSync(path), token = 'a'.repeat(43), now = Date.now();
    db.exec(readFileSync(new URL('../server/auth/001-shared-identity.sql', import.meta.url), 'utf8'));
    db.prepare('INSERT INTO employees VALUES(?,?,?,?,?,?,?,?)').run('employee-17', 'pilot-org', 'https://accounts.google.com', 'verified-sub', 'example.test', 'fixture@example.test', 'Fixture employee', 1);
    db.prepare('INSERT INTO employee_grants VALUES(?,?)').run('employee-17', 'workspace:read');
    db.prepare('INSERT INTO sessions VALUES(?,?,?,?,?)').run(sessionDigest(token), 'employee-17', now, now, now + 3600000); db.close();
    try {
      expect(() => new IdentityStore(path)).toThrow('migration'); migrateIdentity(path); migrateIdentity(path); const store = new IdentityStore(path);
      try { expect(store.session(token, 'pilot-org').employee).toMatchObject({ id: 'employee-17', grants: ['workspace:read'], roles: [], retailStoreIds: [] }); store.changeAccess('employee-17', 'pilot-org', true, ['workspace:read', 'retail:read'], 'fixture-operator', ['marketing'], ['fixture-cheddr-us']); expect(store.session(token, 'pilot-org').employee.roles).toEqual(['marketing']); expect(store.session(token, 'pilot-org').employee.retailStoreIds).toEqual(['fixture-cheddr-us']); } finally { store.close(); }
    } finally { if (!root.startsWith(join(tmpdir(), 'dizzle-reporting-migration-'))) throw new Error('Unsafe cleanup'); rmSync(root, { recursive: true, force: true }); }
  });
});
