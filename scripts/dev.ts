import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const run = (relative: string, args: string[], env = process.env) =>
  spawn(process.execPath, [fileURLToPath(new URL(relative, import.meta.url)), ...args], { stdio: 'inherit', env });
const webEnv = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
  !/^(?:GOOGLE_OIDC|ZOHO)_/i.test(key),
));
const processes = [run('../node_modules/tsx/dist/cli.mjs', ['watch', 'server/index.ts']),
  run('../node_modules/vite/bin/vite.js', ['--host', '127.0.0.1', '--strictPort'], webEnv)];
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of processes) child.kill();
  process.exitCode = code;
}
for (const child of processes) {
  child.on('error', error => { console.error(error.message); stop(1); });
  child.on('exit', code => stop(code ?? 0));
}
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());
