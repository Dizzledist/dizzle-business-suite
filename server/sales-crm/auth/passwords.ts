import { randomBytes } from 'node:crypto';
import * as argon2 from 'argon2';
import { ApiError } from '../../workflow';
import type { SalesIdentityStore } from './store';

const options = { type: argon2.argon2id, memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;
const blocked = new Set([
  '123456789012345', '1234567890123456', '12345678901234567890', '123456789123456789',
  'passwordpassword', 'password123456789', 'passwordpasswordpassword', 'letmeinletmeinletmein',
  'qwertyuiopasdfgh', 'qwertyuiopasdfghjkl', 'qwertyqwertyqwerty', 'adminadminadmin', 'iloveyouiloveyou',
  'correcthorsebatterystaple', 'thisisapassword', 'dizzlebusinesssuite', 'dizzlepassword',
]);
let activeWork = 0;

async function bounded<T>(task: () => Promise<T>) {
  if (activeWork >= 4) throw new ApiError(429, 'Too many password requests. Try again shortly.');
  activeWork++;
  try { return await task(); }
  finally { activeWork--; }
}

export function validateNewPassword(raw: string, email: string) {
  const password = raw.normalize('NFC');
  const length = [...password].length;
  if (length < 15 || length > 128 || !password.trim()) throw new ApiError(400, 'Use a password between 15 and 128 characters.');
  const compact = password.toLowerCase().replace(/[^a-z0-9]/g, '');
  const mailbox = email.split('@')[0].replace(/[^a-z0-9]/g, '');
  if (blocked.has(compact) || /^(?:password|letmein|welcome|admin|dizzle)\d+$/.test(compact) ||
      (!!mailbox && compact === mailbox) || /^(.{1,5})\1{2,}$/su.test(password.toLowerCase())) {
    throw new ApiError(400, 'Choose a password that is harder to guess.');
  }
  return password;
}

function hash(password: string) {
  return bounded(() => argon2.hash(password, options));
}

function verify(digest: string, password: string) {
  return bounded(() => argon2.verify(digest, password.normalize('NFC')));
}

export async function createPasswordAuth(identity: SalesIdentityStore) {
  const dummy = await hash(randomBytes(32).toString('base64url'));
  return {
    async login(email: string, password: string, previous?: string) {
      identity.takePasswordAttempt('login', email);
      const user = identity.passwordLoginTarget(email);
      const correct = await verify(user?.password_hash ?? dummy, password);
      if (!user || !correct) throw new ApiError(401, 'Email or password is incorrect.');
      return identity.finishPasswordLogin(user.id, user.password_hash, previous);
    },

    forgot(email: string) {
      try { identity.requestPasswordReset(email); }
      catch (error) {
        if (!(error instanceof ApiError) || error.status !== 429) throw error;
      }
    },

    async redeem(email: string, token: string, raw: string) {
      identity.takePasswordAttempt('redeem', email);
      const action = identity.findPasswordAction(email, token);
      if (!action) throw new ApiError(400, 'The setup or reset code is invalid or expired.');
      const replacement = validateNewPassword(raw, email);
      if (action.password_hash && await verify(action.password_hash, replacement)) throw new ApiError(400, 'Choose a different password.');
      const digest = await hash(replacement);
      identity.completePasswordAction(email, token, digest);
    },

    async change(session: string, current: string, raw: string) {
      const user = identity.passwordChangeTarget(session);
      identity.takePasswordAttempt('change', user.email);
      if (!await verify(user.password_hash, current)) throw new ApiError(400, 'The current password is incorrect.');
      const next = validateNewPassword(raw, user.email);
      if (next === current.normalize('NFC')) throw new ApiError(400, 'Choose a different password.');
      identity.changePassword(session, user.password_hash, await hash(next));
    },
  };
}

export type PasswordAuth = Awaited<ReturnType<typeof createPasswordAuth>>;
