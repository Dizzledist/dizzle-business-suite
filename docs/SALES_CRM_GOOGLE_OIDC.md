# Google employee sign-in

The Google adapter adds to the Sales CRM identity store and existing revocable sessions. It supports individual Google accounts and an optional managed Workspace hosted-domain policy. Browser invoice reporting remains synthetic. The Zoho localhost operator workflow stays separate.

## Configure Google Cloud

1. Open the company-controlled Google Cloud project for the local pilot. In Google Auth Platform, complete **Branding** with the application name and company support and contact information.
2. Under **Audience**, use **External** to support individual Google accounts. Keep the client in testing for the pilot and add the named test accounts where applicable. Use **Internal** only if everyone is in the project's managed Workspace organization.
3. Under **Data Access**, use only `openid email profile` or the console's equivalent OpenID Connect identity entries. Employee sign-in requests those three scopes. Mailbox authorization is a separate integration.
4. Under **Clients**, create an OAuth client with application type **Web application**. Add this exact authorized redirect URI for the isolated local preview:

   ```text
   http://127.0.0.1:5380/api/sales-crm/auth/google/callback
   ```

   The frontend on port 5380 forwards that route to the loopback backend on port 3380. The backend checks the exact frontend origin. A default-port checkout uses port 5173 and needs its own exact redirect. Keep the same hostname in the browser and configured URI.

5. Store the client ID and secret in a private local environment file outside Git. Use separate OAuth clients and redirect registrations for future staging and production. [Google Cloud client setup](https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid) · [Consent settings](https://developers.google.com/workspace/guides/configure-oauth-consent) · [Audience settings](https://support.google.com/cloud/answer/15549945?hl=en)

## Private environment contract

| Name | Setting |
| --- | --- |
| `NODE_ENV` | `development` for the local pilot |
| `SALES_CRM_ENABLED`, `SALES_CRM_AUTH_ENABLED`, `GOOGLE_OIDC_ENABLED` | Enable all three for Google employee sign-in |
| `DIZZLE_WEB_PORT`, `DIZZLE_API_PORT` | 5380 and 3380 for the isolated pilot. Default ports remain 5173 and 3001 |
| `GOOGLE_OIDC_CLIENT_ID`, `GOOGLE_OIDC_CLIENT_SECRET` | Credentials from the approved Google web client |
| `GOOGLE_OIDC_REDIRECT_URI` | Exact registered frontend callback |
| `GOOGLE_OIDC_WORKSPACE_DOMAIN` | Optional lowercase hosted domain. Leave empty for individual accounts |
| `SALES_CRM_SESSION_IDLE_MINUTES` | Default 30, allowed 1–60 |
| `SALES_CRM_SESSION_MAX_HOURS` | Default 8, allowed 1–24 |
| `ZOHO_ENABLED` | Leave false for this separate local pilot. The original Zoho process uses its own configuration |

From the feature worktree, start the local application with the private file. Restart only this pilot when changing its configuration. The Vite process receives the CRM flags and port settings while the backend receives the Google OAuth credentials.

```powershell
node --env-file="C:\path\outside-git\.env.google" --import tsx scripts/dev.ts
```

## First administrator and employee approval

1. A trusted local operator independently confirms the initial administrator's Google account address through a known channel. From this feature worktree, use the private configuration and run the interactive bootstrap command.

   ```powershell
   node --env-file="C:\path\outside-git\.env.google" --import tsx scripts/bootstrap-google-admin.ts
   ```

2. Enter the CRM organization ID, approved name and verified account address. Use demo-o1 to review the existing synthetic organization. Confirm **APPROVE** at the terminal. The command is available on the local filesystem and creates the single preapproved initial administrator in an empty identity store. Use the same organization and address if the initial invitation needs replacement before claim.
3. Keep the invitation private. Open the configured Sales CRM URL, expand **First sign-in with an invitation**, enter the code and select **Continue with Google**. Choose the exact approved account. The code expires after 24 hours and is consumed upon a successful claim.
4. A signed-in administrator can approve additional employees in **User management**, choose their role and team, and issue a one-time invitation. Verify the address independently and share the code through a trusted private channel. Admins can replace an unused invitation, change access, and record a Zoho salesperson mapping with an independent verification reference.
5. Returning employees use **Continue with Google**. The verified Google issuer and subject must match an active employee record and the approved email. An invitation plus the exact verified email is required for the first binding. Disabled accounts and unknown subjects are denied. Account linking preserves the existing user ID, role, team and mappings. A previously bound subject cannot be transferred through an invitation.

## Security and operating limits

- `openid-client` handles discovery, Authorization Code with PKCE S256, validated state and nonce, server-side exchange and ID-token claims. Signature verification is enabled against Google's JWKS, with RS256, issuer, audience and expiry checks. The adapter also requires a verified email and an exact hosted-domain claim when configured. [Google OIDC](https://developers.google.com/identity/openid-connect/openid-connect) · [openid-client signature checks](https://github.com/panva/openid-client/blob/main/docs/functions/enableNonRepudiationChecks.md)
- Sign-in starts from a same-origin POST. A five-minute browser-bound flow is consumed before token exchange. The process holds pending flows in memory and a restart requires starting the sign-in again. Google tokens stay in the exchange and are discarded. The application issues its own Secure, HttpOnly, SameSite=Lax session cookie and binds the session to the OAuth client, callback and hosted-domain policy.
- Administrator mutations and logout require the existing server session, exact Origin and a session-bound CSRF token. Disabling an employee or changing their access revokes their sessions. The admin directory and activity history remain organization-scoped. Reports enforce rep or authorized team scope in the backend.
- The additive migration creates `sales_google_enrollments` and adds an optional policy column to existing session rows. The one-time invitation is stored as a digest. The approved employee's stable Google subject is written only after successful proof. No second user database is created.
- This branch is a loopback implementation. A production deployment requires a separately reviewed HTTPS origin, identity storage and migrations, audit and offboarding policies, and real employee pilot validation. Live reporting remains gated on verified first-email evidence and approved production controls.

## Test modes

The unit suite uses a signed mock issuer transport with discovery, token and JWKS responses. The browser Google suite uses `NODE_ENV=test`, both Sales CRM flags and `DIZZLE_E2E_GOOGLE=true`; it intercepts the outbound authorization response and returns to the real local callback. The mock server is confined to the Playwright test runner and uses synthetic identities. The normal disabled, fixture CRM and session-only Chromium suites remain available. Configurable loopback ports let the suites run alongside the earlier previews.
