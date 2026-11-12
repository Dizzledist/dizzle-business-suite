import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const env = { ...process.env, NODE_ENV: 'test', DIZZLE_WEB_PORT: '5474', DIZZLE_API_PORT: '3302' };
const children = [
  spawn(process.execPath, [fileURLToPath(new URL('../node_modules/tsx/dist/cli.mjs', import.meta.url)), 'tests/browser/session-server.ts'], { stdio: 'inherit', env }),
  spawn(process.execPath, [fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url)), '--host', '127.0.0.1', '--port', '5474', '--strictPort'], { stdio: 'inherit', env }),
];
let stopping = false;
function stop(code = 0) { if (stopping) return; stopping = true; for (const child of children) child.kill(); process.exitCode = code; }
for (const child of children) { child.on('error', () => stop(1)); child.on('exit', code => stop(code ?? 0)); }
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => stop());
