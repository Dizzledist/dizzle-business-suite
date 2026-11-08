import { readFileSync } from 'node:fs';
import type { DatabaseSync } from 'node:sqlite';

export function openSqliteDatabase(path: string, migrations: readonly URL[]) {
  const sqlite = process.getBuiltinModule('node:sqlite') as typeof import('node:sqlite');
  const db = new sqlite.DatabaseSync(path);
  try {
    db.exec('PRAGMA busy_timeout = 3000; PRAGMA foreign_keys = ON;');
    transaction(db, () => {
      const version = Number(db.prepare('PRAGMA user_version').get()?.user_version);
      if (version > migrations.length) throw new Error('Unsupported database version.');
      for (let index = version; index < migrations.length; index++) {
        db.exec(readFileSync(migrations[index], 'utf8'));
        db.exec('PRAGMA user_version = ' + (index + 1));
      }
    });
    return db;
  } catch (error) {
    db.close();
    throw error;
  }
}

export function transaction<T>(db: DatabaseSync, work: () => T, mode: 'write' | 'read' = 'write'): T {
  db.exec(mode === 'write' ? 'BEGIN IMMEDIATE' : 'BEGIN');
  try {
    const result = work();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
