# Sales CRM authentication foundation

## Current boundary

The prior app used a server-defined fixture role selected through a client-controlled `X-Demo-Identity` header. Session storage carried that choice between pages. The server enforced fixture scope, while any loopback client could select a different fixture identity. There was no account database, provider sign-in, or durable session. The Zoho operator endpoints already required their separate private key and direct localhost access.

`SALES_CRM_AUTH_ENABLED=true` with `SALES_CRM_ENABLED=true` enables session-only Sales CRM routes in development or test. The server rejects fixture identity headers in that mode. The local warehouse workflow keeps its original explicit fixture mode. The production build omits the fixture application and the backend entry point refuses to start in production mode. Browser-accessible reporting uses the synthetic reporting store in both local modes.

The company sign-in screen identifies the pending configuration. The server accepts sessions issued by its internal verified-principal boundary. There is no HTTP route for sign-in, public account bootstrap, or changing accounts while provider approval is pending. Authenticated administrators can inspect an organization-scoped, read-only directory and recent audit activity. The existing Zoho localhost operator workflow remains separate and still needs its existing operator key.

## Provider decision for review

| Option | Fit and cost of adoption |
| --- | --- |
| Google Workspace OIDC with `openid-client` | Recommended if the team uses a managed Workspace domain. The company controls workforce accounts and MFA policy. The app keeps tenant membership and record authorization. Setup requires an approved company OAuth client and Workspace configuration. |
| Auth0 Organizations | Managed federation and organization features fit multiple IdPs or external groups. This adds a vendor tenant, administration, and a plan and pricing review. |
| Existing enterprise IdP | An already approved corporate OIDC provider could serve the same boundary. Confirm workforce membership and MFA requirements before choosing an adapter. |

Use Authorization Code with PKCE S256, exact redirect URI, a short-lived one-use state and nonce, and a maintained OIDC library for discovery, signatures and claim validation. Verify issuer, audience, expiry, nonce and the Google hosted-domain claim when Workspace is selected. Bind users by verified issuer and subject. Email is directory metadata and cannot authorize an account. Require explicit provisioning and active status even for users in the approved domain. The proposed Google scopes are `openid email profile`. Keep tokens on the server and evaluate provider MFA and reauthentication in staging. [Google OIDC](https://developers.google.com/identity/openid-connect/openid-connect) · [openid-client](https://github.com/panva/openid-client) · [Auth0 Organizations](https://auth0.com/organizations)

## Session and data design

A random 256-bit opaque token identifies each session. SQLite stores the token digest, user reference, issuance time, idle activity and expiration. The host-only cookie uses Secure, HttpOnly, SameSite=Lax and Path=/. Sessions expire after 30 minutes idle and eight hours absolute. Reauthentication can replace the same account's prior session. Logout requires an exact allowed Origin and a session-bound CSRF token, revokes the record and clears the cookie. Role, team and status updates revoke the user's existing sessions. The server checks current account status on every protected request. [OWASP session guidance](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html) · [OWASP CSRF guidance](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html)

The additive migration creates a separate local identity database in `.sales-auth-private`. Git and Vite exclude the directory. The Node 24 SQLite runtime is used for the local implementation. Production needs a reviewed PostgreSQL migration, restricted storage, backup and retention controls, a trusted HTTPS origin, and reviewed proxy and cookie settings.

| Table | Contents |
| --- | --- |
| `sales_users` | Stable internal ID, issuer and subject, tenant, name, normalized email, role, department, team, status, creation and last-login timestamps. |
| `sales_sessions` | Session digest, user reference and deadlines. |
| `sales_user_zoho_mappings` | One verified source ID per user, unique within the organization, plus verifying administrator, date and an evidence reference. |
| `sales_identity_audit` | Organization, actor, target, event, timestamp and restricted change details. |

## Authorization and integration boundaries

- Sales representatives see their own credited invoices with a verified local salesperson mapping. Managers see their own and active mapped teammates' credited records in the same organization. A manager without a team has individual scope. Admins can see their organization's synthetic reports and directory.
- A single server-derived scope limits aggregates, search, pagination and invoice detail. Tenant, team, role and credited IDs come from durable server records. Fixture headers, role fields and browser state confer no access to session routes.
- Internal administrator commands validate the tenant and session before provisioning, changing access, or recording or removing a mapping. Mapping requires a numeric source identifier and an administrator-attested reference from independent verification. No name matching or provider lookup runs. Historical invoice credit remains stored independently of current mappings and customer ownership.
- Team membership currently has one team per user. Customer sharing, sensitive finance grants, broader departments and team history need separate approved policies before their modules use the identity model.
- The existing Zoho OAuth endpoints and restricted local operator flow are independent of CRM sessions. Keep live financial data outside browser reporting until provider acceptance, production authorization and the first-email evidence gate all pass.

## Local review and testing

Use Node 24. Set both CRM flags to true for the session-only sign-in screen. Use the regular local run commands and a free pair of loopback ports. With the authentication flag off, the prior synthetic CRM and warehouse fixture selector are available under the existing local settings. [Local run commands](LOCAL_DEMO.md)

For the full Chromium session suite, set `NODE_ENV=test`, both CRM flags to true and `DIZZLE_E2E_IDENTITY_DB` to a fresh absolute temp filename of the form `dizzle-identity-e2e-<UUID>.sqlite`, then run `npm run test:e2e`. The Playwright-only server seeds synthetic accounts, and the test runner creates sessions through trusted test code. It serves no session-minting endpoint. The ordinary disabled and fixture suites continue to use the existing startup path.

After provider approval, confirm the Workspace domain or alternative issuer, authorized HTTPS callback and provider MFA policy. Configure a confidential client and secret storage, implement and verify the adapter, enroll the first administrator by verified issuer and subject, and test revocation and tenant scope end to end. Review identity and reporting migrations before enabling real business data.
