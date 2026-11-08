import { localPorts } from '../../../../shared/local-ports';
import { isSalesAuthEnabled, googleAuthApi } from '../../../../shared/sales-auth';
import { isSalesCrmEnabled } from '../../../../shared/sales-crm';

export const googleIssuer = 'https://accounts.google.com';
export const googleScopes = 'openid email profile';

export function loadGoogleConfig(env: NodeJS.ProcessEnv) {
  if (env.GOOGLE_OIDC_ENABLED !== 'true') return undefined;
  if (!isSalesCrmEnabled(env) || !isSalesAuthEnabled(env)) throw new Error('Google sign-in requires session-only CRM mode.');
  const { web } = localPorts(env);
  const clientId = env.GOOGLE_OIDC_CLIENT_ID;
  const clientSecret = env.GOOGLE_OIDC_CLIENT_SECRET;
  const redirectUri = env.GOOGLE_OIDC_REDIRECT_URI;
  const hostedDomain = env.GOOGLE_OIDC_WORKSPACE_DOMAIN || undefined;
  if (!clientId || !/^[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$/.test(clientId) ||
      !clientSecret || !/^[\x21-\x7e]{8,256}$/.test(clientSecret)) {
    throw new Error('Google OAuth web client configuration is incomplete.');
  }
  if (redirectUri !== 'http://127.0.0.1:' + web + googleAuthApi + '/callback' &&
      redirectUri !== 'http://localhost:' + web + googleAuthApi + '/callback') {
    throw new Error('Google callback must match the configured loopback frontend and callback path.');
  }
  if (hostedDomain && (hostedDomain.length > 253 ||
      !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(hostedDomain))) {
    throw new Error('Invalid Google Workspace hosted domain.');
  }
  return { clientId, clientSecret, redirectUri, origin: new URL(redirectUri).origin, hostedDomain };
}

export type GoogleConfig = NonNullable<ReturnType<typeof loadGoogleConfig>>;
