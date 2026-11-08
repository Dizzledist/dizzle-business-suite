import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { loadGoogleConfig } from '../server/sales-crm/auth/google/config';
import { loadSessionPolicy } from '../server/sales-crm/auth/sessions';
import { openSalesIdentity } from '../server/sales-crm/auth/store';

async function bootstrap() {
  process.env.NODE_ENV ??= 'development';
  if (!stdin.isTTY || !stdout.isTTY || process.env.NODE_ENV !== 'development' || !loadGoogleConfig(process.env)) {
    throw new Error('Use an interactive local terminal with the private Google sign-in configuration.');
  }
  const terminal = createInterface({ input: stdin, output: stdout });
  try {
    const organization = (await terminal.question('CRM organization ID: ')).trim();
    const name = (await terminal.question('Approved administrator name: ')).trim();
    const email = (await terminal.question('Independently verified Google account email: ')).trim();
    if (await terminal.question('Type APPROVE to issue the first administrator invitation: ') !== 'APPROVE') return;
    const store = openSalesIdentity(undefined, Date.now, loadSessionPolicy(process.env));
    try {
      const result = store.bootstrapGoogleAdministrator(organization, { name, email, department: 'sales', team: null });
      stdout.write('One-time invitation (keep private): ' + result.invitation + '\nExpires at ' + result.expiresAt + '\n');
    } finally {
      store.close();
    }
  } finally {
    terminal.close();
  }
}

try { await bootstrap(); }
catch {
  process.stderr.write('Bootstrap could not complete. Check the local configuration and initial administrator status.\n');
  process.exitCode = 1;
}
