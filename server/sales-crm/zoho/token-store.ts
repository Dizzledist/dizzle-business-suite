import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { lstat, readFile, realpath, rename, unlink, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { outsideCheckout, zohoScopes, type ZohoConfig } from './config';

const version = 1;
const nonceBytes = 12;
const tagBytes = 16;
const headerBytes = 1 + nonceBytes + tagBytes;
export const validProviderToken = /^[\x21-\x7e]{1,4096}$/;

export interface ZohoTokenStore {
  load(): Promise<string | null>;
  save(refreshToken: string): Promise<void>;
}

export function createEncryptedTokenStore(config: ZohoConfig): ZohoTokenStore {
  const context = Buffer.from(JSON.stringify([
    config.organizationId, config.clientId, config.accountsUrl, config.apiBaseUrl, zohoScopes,
  ]));

  async function destination() {
    const folder = await realpath(dirname(config.tokenStorePath));
    const path = join(folder, basename(config.tokenStorePath));
    if (!outsideCheckout(await realpath(config.checkoutPath), path)) throw new Error('Unsafe token store path.');
    return path;
  }

  async function loadFrom(path: string) {
    let data: Buffer;
    try {
      const entry = await lstat(path);
      if (!entry.isFile() || entry.size > headerBytes + 4096) throw new Error('Invalid token store.');
      data = await readFile(path);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
    if (data[0] !== version || data.length <= headerBytes) throw new Error('Invalid token store.');
    const decipher = createDecipheriv('aes-256-gcm', config.encryptionKey, data.subarray(1, 1 + nonceBytes));
    decipher.setAAD(context);
    decipher.setAuthTag(data.subarray(1 + nonceBytes, headerBytes));
    const token = Buffer.concat([decipher.update(data.subarray(headerBytes)), decipher.final()]).toString('utf8');
    if (!validProviderToken.test(token)) throw new Error('Invalid token store.');
    return token;
  }

  return {
    async load() {
      return loadFrom(await destination());
    },
    async save(refreshToken) {
      if (!validProviderToken.test(refreshToken)) throw new Error('Invalid token.');
      const path = await destination();
      // Refuse to replace an unrelated file, a symlink, or another grant.
      await loadFrom(path);
      const nonce = randomBytes(nonceBytes);
      const cipher = createCipheriv('aes-256-gcm', config.encryptionKey, nonce);
      cipher.setAAD(context);
      const encrypted = Buffer.concat([cipher.update(refreshToken, 'utf8'), cipher.final()]);
      const blob = Buffer.concat([Buffer.from([version]), nonce, cipher.getAuthTag(), encrypted]);
      const temporary = path + '.' + randomBytes(16).toString('hex') + '.tmp';
      await writeFile(temporary, blob, { flag: 'wx', mode: 0o600 });
      try {
        await rename(temporary, path);
      } finally {
        await unlink(temporary).catch(() => undefined);
      }
    },
  };
}
