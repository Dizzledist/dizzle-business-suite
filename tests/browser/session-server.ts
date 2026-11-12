import { marketingSessionFixture } from '../fixtures/marketing-session';
import { principal } from '../fixtures/shared-identity';
// Isolated provider fixture: never imported by runtime, refuses any non-test launch.
if (process.env.NODE_ENV !== 'test') throw new Error('Session demo requires the isolated test launcher.');
const api = Number(process.env.DIZZLE_API_PORT ?? 3302), web = Number(process.env.DIZZLE_WEB_PORT ?? 5474);
const origin = 'http://127.0.0.1:' + web;
const f = await marketingSessionFixture(api, origin);
f.google.selected = principal('google-sales-editor-17');
const authorize = f.google.authorizationUrl.bind(f.google);
f.google.authorizationUrl = (state, nonce) => { authorize(state, nonce); return origin + '/api/auth/google/callback?' + new URLSearchParams({ code: 'verified-fixture-code', state }); };
console.log('Isolated session demo: ' + origin + ' — fixture Google employee, temporary data, test adapters only.');
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => { void f.close().then(() => process.exit(0)); });
