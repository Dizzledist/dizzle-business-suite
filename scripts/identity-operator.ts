import { readFileSync, writeFileSync } from 'node:fs';
import { userInfo } from 'node:os';
import { IdentityStore, migrateIdentity, privateIdentityPath } from '../server/auth/store';
const [command, ...args] = process.argv.slice(2), path = process.env.SHARED_IDENTITY_DB;
if (!path) throw new Error('Configure private SHARED_IDENTITY_DB.');
if (command === 'migrate') { migrateIdentity(path); console.log('Shared identity schema initialized explicitly.'); }
else {
  const store = new IdentityStore(path), operator = 'operator:' + userInfo().username;
  try {
    if (command === 'pending') console.log(JSON.stringify(store.pending(), null, 2));
    else if (command === 'provision') { store.provision(JSON.parse(readFileSync(privateIdentityPath(args[0]), 'utf8')), operator); console.log('Employee provisioned; no session or external message created.'); }
    else if (command === 'access') { const input = JSON.parse(readFileSync(privateIdentityPath(args[0]), 'utf8')); store.changeAccess(input.id, input.organizationId, input.active, input.grants, operator); console.log('Employee access updated.'); }
    else if (command === 'worker') { const [id, organizationId, file] = args; privateIdentityPath(file); const token = store.issueWorkload(id, organizationId, 3_600_000, operator); writeFileSync(file, token, { flag: 'wx', mode: 0o600 }); console.log('Scoped one-hour worker credential written to the named private file. No token displayed.'); }
    else if (command === 'revoke-worker') { store.revokeWorkload(args[0], args[1], operator); console.log('Worker credential revoked.'); }
    else throw new Error('Use migrate, pending, provision, access, worker or revoke-worker.');
  } finally { store.close(); }
}
