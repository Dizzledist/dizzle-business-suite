import { createHash } from 'node:crypto';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';

// This local store is intentionally outside the Vite workspace/public tree.
// One API process owns it; production storage and concurrent writers are separate work.
export class MarketingStore {
  readonly directory: string;
  constructor(directory = join(homedir(), '.dizzle-data', 'marketing', createHash('sha256').update(resolve('.')).digest('hex').slice(0, 16))) {
    this.directory = directory;
    mkdirSync(directory, { recursive: true, mode: 0o700 });
  }
  load(): unknown | null {
    const file = join(this.directory, 'state.json');
    if (!existsSync(file)) return null;
    try { return JSON.parse(readFileSync(file, 'utf8')); }
    catch { throw new Error('Saved marketing state could not be read. Preserve the local data directory and recover it before restarting.'); }
  }
  save(state: unknown) {
    const temporary = join(this.directory, 'state.json.tmp');
    writeFileSync(temporary, JSON.stringify(state), { mode: 0o600 });
    renameSync(temporary, join(this.directory, 'state.json'));
  }
}
