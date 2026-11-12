# Shared employee sessions and publishing authority

Integration follow-up, November 12: [Marketing shared sign-in](MARKETING_SHARED_SIGNIN.md) describes adoption on a separate branch. Its `marketing:serve` mounts the domain resolver; standalone `auth:serve` below remains module-only. Source PR #5/#6 remain unchanged; Sales adoption is pending joint review.

Prepared November 12, 2026 by Cheddr with Codex on `feat/shared-google-workspace-auth`. This is a proposed shared extraction for joint review, not a deployed sign-in or authorization service. Live publishing remains disabled. Business authority remains [C1](CONTRACTS.md) and [PERMISSIONS](PERMISSIONS.md); build ownership grants no employee privileges.

## What is actually merged

| Source inspected | Verified state | Consequence |
|---|---|---|
| Fetched `origin/main` `d4afc223d7313274ecea75f3655d2188abbbbbd6` | Phase 0 PR #1 and local Phase 1 PR #3 merged; only fixture identity selection exists | No reviewed real employee-session implementation to reuse from main |
| `origin/feature/sales-crm-management-parity` `a81ddaed3e838e0a03256578b8faae3650d1e6b8` | Durable sessions, employee/role/mapping tables and password login; unmerged. No Sales PR in the repository PR listing at inspection | Treat all extracted primitives and schema changes as pending shared review |
| [Marketing PR #5](https://github.com/Dizzledist/dizzle-business-suite/pull/5) `2ad2e46e41dfdc73322c23536c695209b929df3e` | Draft, unmerged; no submitted reviews at inspection | Queue, execution checks and single-post control are tested consumers, not main dependencies |

Sales history inspected includes `680e432` (session foundation), `a0455ed` (company email/password), and its November 8 decision deferring Google. Its referenced isolated Google commit `ac9d842` was unavailable in fetched objects/refs and GitHub's commit lookup; no code from it is assumed or reused. The current user explicitly selects Google Workspace for this shared task. This supersedes password selection for this new slice only; Sales password behavior is untouched and its adoption conflict requires joint review. See [DECISIONS](DECISIONS.md).

Session token generation, namespaced hashes, CSRF derivation, cookie attributes and 8-hour/30-minute expiry conventions were adapted from Sales `server/sales-crm/auth/sessions.ts` at `a81ddae`. The new generic store deliberately does not import password/reporting modules. This provenance does not establish prior approval. Both builders must review this extraction and their migration/adoption together; do not deploy a second identity authority alongside Sales.

## Minimum implementation

- Google authorization code flow with PKCE S256, browser-bound one-use state and nonce. `google-auth-library` verifies ID-token signature, audience, issuer and expiry; explicit checks additionally require the configured Workspace `hd`, verified email, nonce and valid claims. The immutable Google issuer/subject binds the employee. Email suffix, browser claims and the department selector cannot grant access. [Google OIDC](https://developers.google.com/identity/openid-connect/openid-connect), [token verification](https://developers.google.com/identity/gsi/web/guides/verify-google-id-token).
- Unknown verified users become pending principals without a session. A private operator must verify and bind their immutable subject to a canonical employee ID and organization and explicitly assign grants. No automatic admin or email-based account linking. Disabling the Workspace account alone does not revoke an already-issued app session: the operator must disable the Dizzle employee promptly; Directory deprovisioning integration is not implemented.
- Opaque 32-byte session secrets, digest-only storage, `__Host-dizzle_session` Secure/HttpOnly/SameSite=Lax cookie, 8-hour absolute and 30-minute idle expiry, rotation on sign-in, exact-origin plus CSRF protection for mutations. Current active employee/organization/grants are read on every session check. Persistent SQLite sessions survive process restart until revoked/expired.
- A separate opaque worker credential is hashed, expiring, revocable and limited to `publishing:authorize` for one organization. The CLI issues a one-hour credential to a private file; it cannot sign in, approve content, select a pilot or publish. Rotation/renewal scheduling remains an operator task, and expiry causes review holds rather than automatic sends.
- The worker submits only job ID and fingerprint. A trusted server-side consumer resolves the current job, approving employee, approval, image/account binding and organization. The API rechecks current workload and employee authority after resolution, requiring both `asset:review` and `asset:publish`. Missing/revoked authority, destination changes and unavailable dependencies deny authorization. No cached approval substitutes for current grants.

The grant vocabulary in [shared/identity.ts](../shared/identity.ts) is a proposed shared adapter surface, not an approved expansion of Sales/warehouse privileges. Sales role, team, account mapping and ownership enforcement must continue in their domain services. `identity:admin` grants no HTTP administration route in this slice; provisioning is host-operator-only. Only the operator process/file boundary protects these commands, so host access must be restricted.

## Routes and deployment boundary

| Route | Authority and result |
|---|---|
| `POST /api/auth/google/start` | Same-origin browser form, no body; starts verified Google flow |
| `GET /api/auth/google/callback` | Exact registered HTTPS callback, one-use state and browser binding |
| `GET /api/auth/session` | Employee cookie; fresh employee context, CSRF token and expiry |
| `POST /api/auth/logout` | Employee cookie, exact Origin and `X-CSRF-Token`; revokes session |
| `POST /api/internal/publishing/authorize` | Direct loopback socket and worker bearer credential; strict job/fingerprint only |

`npm run auth:serve` hosts only this module on `127.0.0.1:3443` by default. Public routes require an exact configured HTTPS Host; no forwarded headers are trusted. Worker requests use direct `http://127.0.0.1:3443`, never a public proxy. A reverse proxy must preserve the exact configured public Host, terminate TLS, allow only the intended auth routes, exclude `/api/internal/`, redact callback queries/cookies/authorization and enforce perimeter limits. HTTP browser origin is allowed only through an explicit test constructor option, never the runtime host. The start route has a modest per-socket rate limit; review edge limits before exposure.

The standalone host intentionally supplies **no publishing resource resolver**: that endpoint returns 503 until PR #5 adopts it. It does not mount or authenticate the old fixture invoice/marketing API. Do not proxy a fixture application publicly or claim that adding this module secures other routes. Both dashboards must mount the shared auth/session middleware and remove fixture headers/selectors from hosted operation before exposing their APIs, files, AI or search. Their browser UI needs one common sign-in form and cookie/CSRF integration; that UI is not changed in this foundation PR.

## Private configuration and explicit setup

| Name | Private value / use |
|---|---|
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Google OAuth **Web application** client, server environment only; secret never enters Vite/browser configuration |
| `GOOGLE_WORKSPACE_DOMAIN` | Exact approved Workspace hosted domain, not guessed from an email suffix |
| `AUTH_PUBLIC_ORIGIN` | Owned HTTPS origin, no path/trailing slash; exact callback is `AUTH_PUBLIC_ORIGIN/api/auth/google/callback` |
| `DIZZLE_ORGANIZATION_ID` | Canonical organization ID shared by employees, queue and account records |
| `SHARED_IDENTITY_DB` | Absolute private SQLite path outside the checkout and web root |
| `SHARED_AUTH_PORT` | Optional private loopback listener port; default 3443 |

Create an internal Google consent application in the actual Workspace organization where available, configure the web client and **exact** redirect URI above, and obtain administrator approval if organization policy requires it. Scopes are only `openid email profile`; no Gmail/Drive/Directory permissions or refresh token is required. The `hd` request is a hint; server verification is mandatory. No actual Workspace domain, OAuth app, hosted origin or employee subject is confirmed. Configure these privately, not in chat. Real Google login and TLS remain untested.

Review `server/auth/001-shared-identity.sql` before an operator runs the explicit migration. Startup never creates/upgrades a database. This version-1 schema is for a new isolated store, **not a migration of Sales tables**. Do not point it at Sales data. Example operator commands, with all environment values injected privately:

```sh
npm ci
npm run auth:operator -- migrate
npm run auth:serve
# After a verified user attempts sign-in, inspect privately:
npm run auth:operator -- pending
npm run auth:operator -- provision /PRIVATE/verified-employee.json
npm run auth:operator -- access /PRIVATE/current-access.json
npm run auth:operator -- worker pilot-worker CANONICAL_ORG /PRIVATE/worker-credential
npm run auth:operator -- revoke-worker pilot-worker CANONICAL_ORG
```

Provision JSON fields: `id`, `organizationId`, `issuer` (`https://accounts.google.com`), `subject`, `hostedDomain`, `email`, `name`, `active`, `grants`. Access JSON: `id`, `organizationId`, `active`, `grants`. These are private operator files, not repository seeds. Restrict file ACLs, the database and WAL/SHM sidecars to the service/operator; mode bits do not establish Windows ACLs. `pending` contains employee identity information and must not be pasted into public logs. The worker output file uses exclusive creation; if writing fails, revoke its workload ID before issuing a new one. No credential appears in CLI output.

## Shared adoption review bundle

Mergeable after joint review: generic employee/principal/grant contracts, Google verifier/flow, opaque session/CSRF primitives, explicit versioned identity schema/operator, scoped worker endpoint/client, and fixture tests. This does not authorize deployment or claim a production migration is complete.

Sales and Marketing adoption must be reviewed together:

1. Preserve canonical employee IDs, organization, role/team/account mappings and approval actor IDs. Review a **versioned** Sales migration or deliberate empty staging provisioning plan. No email-only matching, automatic role escalation, parallel session store or unreviewed historical import. Decide how existing Sales password sessions retire; this PR does not change them.
2. Mount the single session implementation/cookie at the common app origin. Derive domain actors from current `EmployeeContext`; retain all account assignment and domain permission checks. Migrate Sales `/api/auth/*` consumers to this common contract and propagate CSRF to every mutation. No fixture fallback on hosted routes.
3. PR #5 supplies `PublishingResourceResolver` from its actual queue and MarketingService: load job, compare the current approved content snapshot, image version/hash, connected account/verified numeric ID/handle, time and approving employee. Its result is server-derived, never a trusted request body. Preserve both execution-time checks, immediately before the adapter write as well as before reservation.
4. PR #5 replaces `Workflow` fixture authorization and the current unauthenticated loopback authorization call with `SharedWorkerAuthorization` and a privately loaded worker token. Wire `pilot.controls(job => client.authorize(job.id, publishingFingerprint(job)))`; preserve `SinglePostPilot`, the one immutable selected slot and all hard-off live gates. Expired/unavailable authority must continue to produce Needs Review without automatic retry.
5. Review APIs, worker, asset/media routes and both UIs end to end with real login on private staging before public exposure. The fixture integration tests are a contract proof, not proof this wiring has already landed in either consumer branch.

## One-host persistence and remaining pilot steps

Keep the existing one-host model: one durable private local disk, service account and canonical private root. API and worker share PR #5's marketing state/assets, `publishing.sqlite`, immutable `pilot-control.sqlite` and encrypted provider token file plus `SOCIAL_TOKEN_KEY`. The shared identity API/operator alone own `SHARED_IDENTITY_DB` in that root (including WAL/SHM); the worker uses the authenticated loopback endpoint and does not need identity DB or Google-secret access. A separate private runtime credential file is read by the adopted worker; its path setting must be added in PR #5. No cloud database, network filesystem, multiple-host workers or object-storage replacement is introduced. Review ownership, backup/restore consistency and actual Linux service/proxy configuration before hosting. Restoring an old unused pilot slot is prohibited; keep live off after restores pending reconciliation.

For **@cheddrco_**, the developer app is still not configured and numeric X account ID is unknown. After shared adoption and host approval:

- Configure an X confidential Web App with OAuth 2.0 Read and Write; grant `tweet.read tweet.write users.read media.write offline.access`. Register the exact chosen `SOCIAL_OAUTH_REDIRECT_URI` (distinct from the employee Google callback). Privately set `X_CLIENT_ID`, `X_CLIENT_SECRET`, `SOCIAL_TOKEN_KEY`, `SOCIAL_EXPECTED_HANDLE=@cheddrco_` and shared storage paths. Stop the worker while connecting and verify both returned handle and numeric ID. [X OAuth setup](https://docs.x.com/fundamentals/authentication/oauth-2-0/authorization-code).
- Confirm endpoint access and credits/spending controls in the X console for profile lookup, image upload, post creation and owned-post reconciliation. X documents prepaid credits and per-endpoint pricing; account readiness has not been verified and no purchase or publishing call was made. [X pricing](https://docs.x.com/x-api/getting-started/pricing).
- Select only the named approved job for that verified numeric ID. PR #5's previous proposed November 12 time is not a standing approval: choose a future Pacific instant and renew the exact account/caption/image version+hash/time approval. Keep both live gates off until explicit owner authorization of that one post.
- Instagram, if later selected, additionally requires its reviewed signed HTTPS JPEG route and provider setup from PR #5's `docs/SOCIAL_PILOT_STAGING.md`. This shared identity listener does not serve media. No Instagram route is needed for the X image-upload path.

## Local evidence and limits

`npm run check` runs typecheck, Vitest, build and three existing Chromium fixture tests. Auth tests use temporary private SQLite stores and a fixture Google provider/mocked SDK verifier: no real identity or provider token is used. Consumer tests archive **actual PR #5 source at pinned `2ad2e46`** into ignored `test-results/marketing-auth-consumer`, never runtime code. Lifecycle hooks prepare it; CI fetches full history. The dependency is a fixture only, not an implicit merge of PR #5.

Coverage includes valid/disabled/pending/wrong-domain/wrong-organization sessions, Google claim/state/nonce failures, fresh/revoked grants across connections, cookie/CSRF/expiry boundaries, invalid/revoked/expired worker credentials, forged worker actors, unavailable authorization, and PR #5's two-stage authorization with test adapters/simulated time. The actual durable pilot control rejects a second job, changed selected caption/image version/time even with renewed approval, and replay after restart. No real OAuth login, deployed TLS, Sales migration, production dashboard sign-in, Linux hosting or live provider write is claimed.
