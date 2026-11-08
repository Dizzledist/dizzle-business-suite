import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import type { CustomFetch } from 'openid-client';
import { googleAuthApi } from '../../shared/sales-auth';
import { googleIssuer, loadGoogleConfig } from '../../server/sales-crm/auth/google/config';

export const googleTestEnv = {
  NODE_ENV: 'test', SALES_CRM_ENABLED: 'true', SALES_CRM_AUTH_ENABLED: 'true',
  GOOGLE_OIDC_ENABLED: 'true', GOOGLE_OIDC_CLIENT_ID: 'fixture-web-client.apps.googleusercontent.com',
  GOOGLE_OIDC_CLIENT_SECRET: 'fixture-only-secret',
  GOOGLE_OIDC_REDIRECT_URI: 'http://127.0.0.1:5173' + googleAuthApi + '/callback',
};
export const googleTestConfig = loadGoogleConfig(googleTestEnv)!;
export const mockAdmin = { subject: 'google-fixture-admin', email: 'admin@example.test' };
export const authorizationEndpoint = googleIssuer + '/o/oauth2/v2/auth';
const tokenEndpoint = 'https://oauth2.googleapis.com/token';
const jwksEndpoint = 'https://www.googleapis.com/oauth2/v3/certs';
const discoveryEndpoint = googleIssuer + '/.well-known/openid-configuration';

type Claims = Record<string, string | boolean | number | undefined>;
type MockGrant = { nonce: string; challenge: string; claims: Claims; invalidSignature?: boolean; omitToken?: boolean };
const signingKey = generateKeyPairSync('rsa', { modulusLength: 2048 });

export function mockGoogleCode(authorization: string | URL, claims: Claims, options: {
  failPkce?: boolean; invalidSignature?: boolean; omitToken?: boolean;
} = {}) {
  const query = new URL(authorization).searchParams;
  const grant: MockGrant = {
    nonce: query.get('nonce')!, challenge: options.failPkce ? 'incorrect' : query.get('code_challenge')!, claims,
    invalidSignature: options.invalidSignature, omitToken: options.omitToken,
  };
  return Buffer.from(JSON.stringify(grant)).toString('base64url');
}

export function mockGoogleTransport(config = googleTestConfig) {
  const calls: { method: string; url: string }[] = [];
  const transport: CustomFetch = async (input, init) => {
    const url = String(input);
    const method = init.method ?? 'GET';
    calls.push({ method, url });
    if (url === discoveryEndpoint) return Response.json({
      issuer: googleIssuer, authorization_endpoint: authorizationEndpoint, token_endpoint: tokenEndpoint, jwks_uri: jwksEndpoint,
      response_types_supported: ['code'], grant_types_supported: ['authorization_code'],
      id_token_signing_alg_values_supported: ['RS256'], token_endpoint_auth_methods_supported: ['client_secret_post'],
      code_challenge_methods_supported: ['S256'], subject_types_supported: ['public'],
    });
    if (url === jwksEndpoint) return Response.json({
      keys: [{ ...signingKey.publicKey.export({ format: 'jwk' }), kid: 'test-key', alg: 'RS256', use: 'sig' }],
    });
    if (url !== tokenEndpoint) throw new Error('Unexpected mock Google URL.');
    const fields = new URLSearchParams(String(init.body));
    const grant = JSON.parse(Buffer.from(fields.get('code') ?? '', 'base64url').toString()) as MockGrant;
    if (fields.get('redirect_uri') !== config.redirectUri || fields.get('client_id') !== config.clientId ||
        fields.get('client_secret') !== config.clientSecret || fields.get('grant_type') !== 'authorization_code' ||
        createHash('sha256').update(fields.get('code_verifier') ?? '').digest('base64url') !== grant.challenge) {
      return Response.json({ error: 'invalid_grant' }, { status: 400 });
    }
    const now = Math.floor(Date.now() / 1000);
    const payload = {
      iss: googleIssuer, sub: mockAdmin.subject, aud: config.clientId, iat: now, exp: now + 300,
      nonce: grant.nonce, email: mockAdmin.email, email_verified: true, ...grant.claims,
    };
    const encoded = Buffer.from(JSON.stringify({ alg: 'RS256', kid: 'test-key' })).toString('base64url') + '.' +
      Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signature = sign('RSA-SHA256', Buffer.from(encoded), signingKey.privateKey);
    if (grant.invalidSignature) signature[0] ^= 1;
    return Response.json({
      token_type: 'Bearer', access_token: 'mock-google-access-token', expires_in: 300,
      ...(grant.omitToken ? {} : { id_token: encoded + '.' + signature.toString('base64url') }),
    });
  };
  return { transport, calls };
}
