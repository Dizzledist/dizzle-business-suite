import { OAuth2Client, CodeChallengeMethod } from 'google-auth-library';
import type { GooglePrincipal } from '../../shared/identity';
import { ApiError } from '../workflow';
export interface GoogleOidc {
  authorizationUrl(state: string, nonce: string, verifier: string): string;
  verify(code: string, nonce: string, verifier: string): Promise<GooglePrincipal>;
}
export class GoogleWorkspaceOidc implements GoogleOidc {
  private client: OAuth2Client;
  constructor(private clientId: string, clientSecret: string, private redirectUri: string, private domain: string, client?: OAuth2Client) {
    if (!clientId || !clientSecret || !domain) throw new Error('Configure Google Workspace client and allowed hosted domain.');
    this.client = client ?? new OAuth2Client(clientId, clientSecret, redirectUri);
  }
  authorizationUrl(state: string, nonce: string, verifier: string) {
    const { createHash } = process.getBuiltinModule('node:crypto');
    return this.client.generateAuthUrl({ access_type: 'online', scope: ['openid', 'email', 'profile'], state, nonce, hd: this.domain,
      code_challenge_method: CodeChallengeMethod.S256, code_challenge: createHash('sha256').update(verifier).digest('base64url') });
  }
  async verify(code: string, nonce: string, verifier: string): Promise<GooglePrincipal> {
    try {
      const { tokens } = await this.client.getToken({ code, codeVerifier: verifier, redirect_uri: this.redirectUri });
      if (!tokens.id_token) throw new Error();
      const ticket = await this.client.verifyIdToken({ idToken: tokens.id_token, audience: this.clientId });
      const claims = ticket.getPayload() as any;
      if (!claims || !['https://accounts.google.com', 'accounts.google.com'].includes(claims.iss) || claims.aud !== this.clientId ||
        claims.azp && claims.azp !== this.clientId || claims.email_verified !== true || claims.hd !== this.domain || claims.nonce !== nonce ||
        !claims.exp || claims.exp * 1000 <= Date.now() || typeof claims.sub !== 'string' || !/^\S{1,255}$/.test(claims.sub) || typeof claims.email !== 'string' || typeof claims.name !== 'string' || !claims.email || !claims.name) throw new Error();
      return { issuer: 'https://accounts.google.com', subject: claims.sub, hostedDomain: claims.hd, email: claims.email, name: claims.name };
    } catch { throw new ApiError(401, 'Google Workspace sign-in could not be verified.'); }
  }
}
