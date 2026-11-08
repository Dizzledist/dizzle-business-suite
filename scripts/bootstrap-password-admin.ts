import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { isSalesPasswordEnabled } from '../shared/sales-auth';
import { isSalesCrmEnabled } from '../shared/sales-crm';
import { openSalesIdentity } from '../server/sales-crm/auth/store';

async function bootstrap() {
  process.env.NODE_ENV ??= 'development';
  if (!stdin.isTTY || !stdout.isTTY || process.env.NODE_ENV !== 'development' ||
      !isSalesCrmEnabled(process.env) || !isSalesPasswordEnabled(process.env)) {
    throw new Error('Use an interactive local terminal with password sign-in enabled.');
  }
  const args = process.argv.slice(2);
  const recover = args.length === 1 && args[0] === '--recover';
  if (args.length && !recover) throw new Error('Unexpected bootstrap arguments.');
  const terminal = createInterface({ input: stdin, output: stdout });
  try {
    const organization = (await terminal.question('CRM organization ID: ')).trim();
    const name = recover ? '' : (await terminal.question('Approved administrator name: ')).trim();
    const email = (await terminal.question('Independently verified company email: ')).trim();
    const confirmation = recover ? 'RECOVER' : 'APPROVE';
    if (await terminal.question('Type ' + confirmation + ' to issue the administrator code: ') !== confirmation) return;
    const store = openSalesIdentity();
    try {
      const result = recover ? store.recoverSolePasswordAdministrator(organization, email)
        : store.bootstrapPasswordAdministrator(organization, { name, email, department: 'sales', team: null });
      stdout.write('One-time ' + result.purpose + ' code (keep private): ' + result.code + '\nExpires at ' + result.expiresAt + '\n');
    } finally { store.close(); }
  } finally { terminal.close(); }
}

try { await bootstrap(); }
catch {
  process.stderr.write('Bootstrap could not complete. Check the local configuration and initial administrator status.\n');
  process.exitCode = 1;
}
