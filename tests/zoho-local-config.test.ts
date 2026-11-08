import { mkdtemp, readFile, rmdir, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadZohoConfig, zohoRedirectUri } from '../server/sales-crm/zoho/config';
import { createEncryptedTokenStore } from '../server/sales-crm/zoho/token-store';
import { oauthFixtureEnv } from './fixtures/zoho-oauth';

describe('local Zoho configuration and storage', () => {
  it('requires both opt-in flags and disables production', () => {
    expect(loadZohoConfig({})).toBeUndefined();
    expect(loadZohoConfig({ ...oauthFixtureEnv, SALES_CRM_ENABLED: 'false' })).toBeUndefined();
    expect(loadZohoConfig({ ...oauthFixtureEnv, NODE_ENV: 'production' })).toBeUndefined();
    expect(loadZohoConfig(oauthFixtureEnv)?.redirectUri).toBe(zohoRedirectUri);
  });

  it.each([
    ['ZOHO_ORGANIZATION_ID', '999'],
    ['ZOHO_REDIRECT_URI', 'http://localhost:3000/api/integrations/zoho/callback'],
    ['ZOHO_REDIRECT_URI', zohoRedirectUri + '?extra=1'],
    ['ZOHO_ACCOUNTS_URL', 'https://accounts.zoho.eu'],
    ['ZOHO_API_BASE_URL', 'https://www.zohoapis.com.example.invalid/inventory/v1'],
    ['ZOHO_TOKEN_STORE_PATH', join(process.cwd(), 'local-token.enc')],
    ['ZOHO_LOCAL_ADMIN_KEY', 'short'],
    ['ZOHO_TOKEN_ENCRYPTION_KEY', oauthFixtureEnv.ZOHO_LOCAL_ADMIN_KEY],
  ])('rejects unsafe %s settings', (key, value) => {
    expect(() => loadZohoConfig({ ...oauthFixtureEnv, [key]: value })).toThrow();
  });

  it('encrypts the refresh grant at rest and rejects tampering or another configuration', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'dizzle-zoho-store-'));
    const path = join(directory, 'refresh.enc');
    const config = loadZohoConfig({ ...oauthFixtureEnv, ZOHO_TOKEN_STORE_PATH: path })!;
    const token = 'fixture-private-refresh';
    const store = createEncryptedTokenStore(config);
    try {
      expect(await store.load()).toBeNull();
      await store.save(token);
      const first = await readFile(path);
      expect(first.includes(Buffer.from(token))).toBe(false);
      expect(await store.load() === token).toBe(true);

      await store.save(token);
      const second = await readFile(path);
      expect(first.equals(second)).toBe(false);
      await expect(createEncryptedTokenStore({ ...config, clientId: 'another-fixture' }).load()).rejects.toThrow();
      await expect(createEncryptedTokenStore({ ...config, encryptionKey: Buffer.alloc(32, 3) }).load()).rejects.toThrow();

      second[second.length - 1] ^= 1;
      await writeFile(path, second);
      await expect(store.load()).rejects.toThrow();
    } finally {
      await unlink(path).catch(() => undefined);
      await rmdir(directory);
    }
  });

  it('preserves a pre-existing unrelated file at the configured token path', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'dizzle-zoho-store-'));
    const path = join(directory, 'existing.txt');
    const config = loadZohoConfig({ ...oauthFixtureEnv, ZOHO_TOKEN_STORE_PATH: path })!;
    try {
      await writeFile(path, 'Existing fixture file');
      await expect(createEncryptedTokenStore(config).save('fixture-refresh')).rejects.toThrow();
      expect(await readFile(path, 'utf8')).toBe('Existing fixture file');
    } finally {
      await unlink(path).catch(() => undefined);
      await rmdir(directory);
    }
  });
});
