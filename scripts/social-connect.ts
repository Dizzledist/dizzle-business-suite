import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { MarketingStore } from '../server/marketing-store';
import { SocialAccountVault } from '../server/publishing/accounts';
import { consumeOAuthState, oauthScopes, oauthStart } from '../server/publishing/oauth';
if (existsSync('.env')) loadEnvFile('.env');
const [platform, brandId] = process.argv.slice(2);
if (!['instagram', 'x'].includes(platform) || !['dizzle', 'cheddr', 'puffr', 'frosty', 'georgia-hemp'].includes(brandId)) throw new Error('Usage: npm run social:connect -- <instagram|x> <brandId>');
const provider = platform as 'instagram' | 'x';
const clientId = process.env[provider === 'x' ? 'X_CLIENT_ID' : 'INSTAGRAM_APP_ID'];
const clientSecret = process.env[provider === 'x' ? 'X_CLIENT_SECRET' : 'INSTAGRAM_APP_SECRET'];
const redirectUri = process.env.SOCIAL_OAUTH_REDIRECT_URI;
if (!clientId || !clientSecret || !redirectUri || !/^[a-f0-9]{64}$/i.test(process.env.SOCIAL_TOKEN_KEY ?? '')) throw new Error('Configure server client credentials, SOCIAL_OAUTH_REDIRECT_URI and SOCIAL_TOKEN_KEY. See SOCIAL_PUBLISHING.md.');
const redirect = new URL(redirectUri); if (redirect.protocol !== 'https:' && !['127.0.0.1', 'localhost'].includes(redirect.hostname)) throw new Error('OAuth requires HTTPS or a registered loopback callback.');
const pending = oauthStart(provider, clientId, redirectUri);
const vault = new SocialAccountVault(process.env.DIZZLE_PUBLISHING_DIR ?? new MarketingStore().directory);
async function api(url: string, init?: RequestInit) { const r = await fetch(url, { ...init, redirect: 'error', signal: AbortSignal.timeout(20_000) }); if (!r.ok) throw new Error('Provider rejected OAuth/profile request. Check permissions and app configuration.'); return r.json(); }
const server = createServer(async (req, res) => {
  const callback = new URL(req.url ?? '/', 'http://callback');
  if (callback.pathname !== redirect.pathname) { res.writeHead(404); res.end(); return; }
  try {
    consumeOAuthState(pending, callback.searchParams.get('state') ?? '');
    const code = callback.searchParams.get('code'); if (!code || callback.searchParams.has('error')) throw new Error('Authorization declined or incomplete.');
    let accessToken: string, refreshToken: string | undefined, expiresIn: number;
    if (provider === 'x') {
      const tokens = await api('https://api.x.com/2/oauth2/token', { method: 'POST', headers: { Authorization: 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64'), 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: redirectUri, code_verifier: pending.verifier }) });
      if (!oauthScopes.x.every(scope => (tokens.scope ?? '').split(' ').includes(scope))) throw new Error('Required X scopes were not granted.');
      accessToken = tokens.access_token; refreshToken = tokens.refresh_token; expiresIn = tokens.expires_in;
    } else {
      const form = new FormData(); for (const [key, value] of Object.entries({ client_id: clientId, client_secret: clientSecret, grant_type: 'authorization_code', redirect_uri: redirectUri, code })) form.set(key, value);
      const response = await api('https://api.instagram.com/oauth/access_token', { method: 'POST', body: form }); const short = response.data?.[0] ?? response;
      const permissions = Array.isArray(short.permissions) ? short.permissions : String(short.permissions ?? '').split(',');
      if (!oauthScopes.instagram.every(scope => permissions.includes(scope))) throw new Error('Required Instagram scopes were not granted.');
      const exchange = new URL('https://graph.instagram.com/access_token'); exchange.searchParams.set('grant_type', 'ig_exchange_token'); exchange.searchParams.set('client_secret', clientSecret); exchange.searchParams.set('access_token', short.access_token);
      const tokens = await api(exchange.href); accessToken = tokens.access_token; expiresIn = tokens.expires_in;
    }
    if (!accessToken || !Number.isFinite(expiresIn)) throw new Error('OAuth returned incomplete credentials.');
    const version = process.env.META_GRAPH_VERSION; if (provider === 'instagram' && !/^v\d+\.\d+$/.test(version ?? '')) throw new Error('Configure a reviewed META_GRAPH_VERSION.');
    const response = await api(provider === 'x' ? 'https://api.x.com/2/users/me' : `https://graph.instagram.com/${version}/me?fields=user_id,username`, { headers: { Authorization: `Bearer ${accessToken}` } });
    const profile = response.data?.[0] ?? response.data ?? response, id = provider === 'x' ? profile.id : profile.user_id;
    if (!/^\d+$/.test(id ?? '') || !/^[A-Za-z0-9_.]+$/.test(profile.username ?? '')) throw new Error('Could not verify the authorized account identity.');
    const account = { id: `${provider}-${brandId}-${id}`, brandId, platform: provider, providerUserId: id, handle: '@' + profile.username, mode: 'live' as const, connected: true };
    vault.save(account, { accessToken, refreshToken, issuedAt: Date.now(), expiresAt: Date.now() + expiresIn * 1000 });
    console.log(`Connected ${provider} ${account.handle} to ${brandId}. Live publishing remains OFF. Restart the local API to show the account.`);
    res.writeHead(200, { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' }); res.end('Account connected. Close this tab. Live publishing remains OFF.'); server.close();
  } catch { res.writeHead(400, { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' }); res.end('Connection failed. Check scopes, callback, app access and server configuration. No credentials were displayed.'); }
});
server.listen(Number(process.env.SOCIAL_OAUTH_PORT ?? 3499), '127.0.0.1', () => console.log('Open this authorization URL in your browser:\n' + pending.url));
const expiry = setTimeout(() => server.close(), 300_000); expiry.unref();
