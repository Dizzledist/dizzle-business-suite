import type { GooglePrincipal } from '../../shared/identity';
import type { GoogleOidc } from '../../server/auth/google';
import type { IdentityStore } from '../../server/auth/store';
export const principal = (subject = 'google-owner'): GooglePrincipal => ({ issuer: 'https://accounts.google.com', subject, hostedDomain: 'example.test', email: subject + '@example.test', name: 'Synthetic employee' });
export function provision(store: IdentityStore, id = 'owner', organizationId = 'demo-o1', active = true) {
  const subject = 'google-' + id; store.provision({ id, organizationId, ...principal(subject), active, grants: ['workspace:read', 'asset:review', 'asset:publish'] }, 'fixture-operator'); return principal(subject);
}
export class FixtureGoogle implements GoogleOidc {
  nonce = ''; calls = 0; selected = principal();
  authorizationUrl(state: string, nonce: string) { this.nonce = nonce; return 'https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams({ state, nonce }); }
  async verify(code: string, nonce: string) { this.calls++; if (code !== 'verified-fixture-code' || nonce !== this.nonce) throw new Error('Fixture verification failed'); return this.selected; }
}
