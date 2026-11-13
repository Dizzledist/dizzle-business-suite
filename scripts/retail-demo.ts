import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const env = { ...process.env, NODE_ENV: 'test', DIZZLE_WEB_PORT: '5575', DIZZLE_API_PORT: '3403' };
const children = [spawn(process.execPath, [fileURLToPath(new URL('../node_modules/tsx/dist/cli.mjs', import.meta.url)), 'tests/browser/retail-session-server.ts'], { env, stdio: 'inherit' }), spawn(process.execPath, [fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url)), '--host', '127.0.0.1', '--port', '5575', '--strictPort'], { env, stdio: 'inherit' })];
let stopping = false;
function stop(code = 0) { if (stopping) return; stopping = true; for (const child of children) child.kill(); process.exitCode = code; }
for (const child of children) { child.on('error', () => stop(1)); child.on('exit', code => stop(code ?? 0)); }
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => stop());
