import { DatabaseSync } from 'node:sqlite';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { privateIdentityPath } from '../auth/store';
import type { EmployeeContext } from '../../shared/identity';
import type { ManagementDashboard } from '../../shared/retail-reporting';
export function migrateReportingPreferences(path: string) {
  privateIdentityPath(path); mkdirSync(dirname(path), { recursive: true, mode: 0o700 }); const db = new DatabaseSync(path);
  try { const version = (db.prepare('PRAGMA user_version').get() as any).user_version; if (version === 1) return; if (version !== 0) throw new Error('Unsupported reporting preference schema.'); db.exec('BEGIN IMMEDIATE'); try { db.exec(readFileSync(new URL('./001-preferences.sql', import.meta.url), 'utf8')); db.exec('COMMIT'); } catch (e) { db.exec('ROLLBACK'); throw e; } } finally { db.close(); }
}
export class ReportingPreferences {
  private db: DatabaseSync;
  constructor(path: string) { privateIdentityPath(path); if (!existsSync(path)) throw new Error('Run the explicit reporting preference migration first.'); this.db = new DatabaseSync(path); this.db.exec('PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL;'); if ((this.db.prepare('PRAGMA user_version').get() as any).user_version !== 1) { this.db.close(); throw new Error('Unsupported reporting preference schema.'); } }
  get(employee: EmployeeContext, dashboard: ManagementDashboard) { return Boolean((this.db.prepare('SELECT include_shopify FROM reporting_preferences WHERE organization_id=? AND employee_id=? AND dashboard=?').get(employee.organizationId, employee.id, dashboard) as any)?.include_shopify); }
  set(employee: EmployeeContext, dashboard: ManagementDashboard, include: boolean) { this.db.prepare('INSERT INTO reporting_preferences VALUES(?,?,?,?) ON CONFLICT(organization_id,employee_id,dashboard) DO UPDATE SET include_shopify=excluded.include_shopify').run(employee.organizationId, employee.id, dashboard, Number(include)); }
  close() { this.db.close(); }
}
