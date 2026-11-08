import * as oidc from 'openid-client';
import { googleIssuer, googleScopes, type GoogleConfig } from './config';

export class GoogleIdentityRejected extends Error {}

export function createGoogleProvider(config: GoogleConfig, fetcher?: oidc.CustomFetch) {
  let discovery: Promise<oidc.Configuration> | undefined;

  function configuration() {
    discovery ??= oidc.discovery(new URL(googleIssuer), config.clientId, {
      client_secret: config.clientSecret,
      id_token_signed_response_alg: 'RS256',
    }, oidc.ClientSecretPost(config.clientSecret), {
      timeout: 10,
      execute: [oidc.enableNonRepudiationChecks],
      ...(fetcher ? { [oidc.customFetch]: fetcher } : {}),
    }).catch(error => {
      discovery = undefined;
      throw error;
    });
    return discovery;
  }

  return {
    async begin() {
      const state = oidc.randomState();
      const nonce = oidc.randomNonce();
      const verifier = oidc.randomPKCECodeVerifier();
      const challenge = await oidc.calculatePKCECodeChallenge(verifier);
      const parameters = {
        redirect_uri: config.redirectUri, scope: googleScopes, state, nonce, code_challenge: challenge,
        code_challenge_method: 'S256', prompt: 'select_account',
        ...(config.hostedDomain ? { hd: config.hostedDomain } : {}),
      };
      const url = oidc.buildAuthorizationUrl(await configuration(), parameters);
      return { url, state, nonce, verifier };
    },

    async verify(callback: URL, checks: { state: string; nonce: string; verifier: string }) {
      const result = await oidc.authorizationCodeGrant(await configuration(), callback, {
        expectedState: checks.state, expectedNonce: checks.nonce, pkceCodeVerifier: checks.verifier, idTokenExpected: true,
      });
      const claims = result.claims();
      if (!claims || claims.iss !== googleIssuer || typeof claims.sub !== 'string' ||
          typeof claims.email !== 'string' || claims.email_verified !== true ||
          (config.hostedDomain && claims.hd !== config.hostedDomain)) {
        throw new GoogleIdentityRejected();
      }
      return { issuer: googleIssuer, subject: claims.sub, email: claims.email } as const;
    },
  };
}

export type GoogleProvider = ReturnType<typeof createGoogleProvider>;
