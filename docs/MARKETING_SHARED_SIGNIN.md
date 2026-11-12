# Marketing shared sign-in integration

November 12, 2026. Lead: Cheddr with Codex. Branch `feat/marketing-shared-signin` combines main `d4afc223d7313274ecea75f3655d2188abbbbbd6`, [PR #5](https://github.com/Dizzledist/dizzle-business-suite/pull/5) `2ad2e46e41dfdc73322c23536c695209b929df3e`, and [PR #6](https://github.com/Dizzledist/dizzle-business-suite/pull/6) `9f6a9b5847f0b437c3c39298a9d104f1462f7f1e`. Both source PRs remain draft/unmerged and untouched; candidate status is not approval to deploy. Local integration merge `1adc6bd` preserves both histories. Main is unchanged.

This implements Marketing adoption of [SHARED_AUTHENTICATION](SHARED_AUTHENTICATION.md). Standalone `auth:serve` still has no domain resolver; new **`marketing:serve`** mounts the real Marketing resolver and routes behind the same Google sessions and CSRF checks. No second identity authority is introduced.

## Implemented boundary

- Hosted `/api/marketing/*`, `/api/assets*`, protected file downloads and `/api/workspace` require a current shared employee session. Every mutation also checks exact Origin and session CSRF token. Campaign/calendar writes, generation, approvals, internal asset publication, cancellation and manual posting retain action grants. Active status, organization and grants are read per request; fixture headers are rejected.
- The browser discovers employee mode from `/api/auth/mode`, uses one Google sign-in form, cookies and CSRF transport for Marketing and files, and signs out through shared auth. No identity selector appears. Expired sessions remove the employee UI; grants refresh on focus and periodically. API revocation is immediate regardless of UI refresh timing. Google verifier, principal binding, provisioning and session expiry remain PR #6's implementation.
- Hosted organization is explicit. Startup creates empty business records, without seeded approvals, rep identities or implicit test destinations. A saved store from another organization is rejected, not rewritten. Queue listing/cancellation are organization-scoped. Canonical employee IDs and current grants are projected to Marketing without Sales/owner/admin roles, release rights or inferred assignments. Hosted invoice/warehouse/demo routes expose no data. Rep-selected publication and restricted rep consumption stay closed until a reviewed Sales role/assignment adapter exists.
- The worker authenticates on direct loopback using its expiring organization-scoped credential, submitting only job ID/fingerprint. The trusted resolver loads the actual queue job and approving employee and checks account/numeric ID/handle/mode, caption, time, image version, original-to-JPEG hash, content approval snapshot/actor/time. It checks account and approval again after image conversion; the API reloads current employee/workload authority afterward. Workspace, review and publishing grants are required for execution.
- `workerAuthority` connects the runtime worker and private pilot selector to PR #6's client. Hosted configuration cannot fall back to fixture impersonation. Its private credential file is reread per check, allowing controlled rotation. The actual worker reauthorizes immediately before public write, checks queue bytes/fingerprint, and retains atomic claims and the immutable one-selected-job slot. Denied/unavailable authority produces Needs Review without automatic retry. Editing a queued draft cancels its old job and invalidates approval, as before.
- Live publishing and live provider-read source gates remain **false**. Tests use test adapters, simulated time, temporary databases and a test Google provider. No real Google/X login, provider purchase, paid image call, migration or post occurred.

## Localhost demo and checks

From this integration worktree with Node 24.x:

```sh
npm ci
npm run demo:signin
```

Open **http://127.0.0.1:5474** (isolated API 3302). Click **Sign in with Google Workspace**: the local test provider signs in provisioned fixture employee `sales-editor-17` without contacting Google. Use Calendar → New campaign, create a draft, inspect Image Studio/Assets/Brand Kits, reload, and Sign out. There is no Test identity selector. Data is temporary, reset on a new launch; Ctrl+C stops both processes. This launcher never loads checkout `.env` or existing marketing state and must never be hosted as real authentication.

`npm run dev` remains the separate local fixture-identity demo. Production, employee mode or a configured auth origin prevents fixture API/worker fallback. Runtime has no environment-selectable test Google provider; only the test launcher imports it.

```sh
npm run check
npx vitest run tests/marketing-signin.test.ts tests/sales-auth-adoption.test.ts
```

Checks include the nine original browser cases plus a shared sign-in case proving callback/session, authorized navigation, CSRF campaign write, reload, sign-out and no fixture headers. API tests use two different provisioned employees to create/approve real raster creative/content, schedule/select a job and send once through the actual worker/test adapter. Cases cover disabled users, revoked workspace/publish grants, foreign organizations, bad/expired/revoked worker credentials, unavailable authority, pre-write revocation, changed account/caption/version/hash/bytes/time, edited approval, second job and restart/replay. Existing provider/queue/manual/financial regressions remain.

## Private staging setup

Run **`npm run marketing:serve`** / `server/marketing-index.ts`, not fixture `server/index.ts` or standalone auth host. Inject a private service environment; this entry refuses checkout `.env`. Build/serve static `dist` at the same HTTPS origin and proxy only to the authenticated listener. Never expose Vite or fixture APIs. [Proxy template](../deploy/marketing-auth/nginx.conf.example) is for review; actual Linux/nginx/TLS validation is an operator step.

API settings: `NODE_ENV=production`, `DIZZLE_AUTH_MODE=employee`, `AUTH_PUBLIC_ORIGIN`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_WORKSPACE_DOMAIN`, `DIZZLE_ORGANIZATION_ID`, `SHARED_IDENTITY_DB`, `DIZZLE_MARKETING_DIR`, `DIZZLE_PUBLISHING_DIR`; optional `SHARED_AUTH_PORT` defaults to 3443. Google Web application callback is exactly **`AUTH_PUBLIC_ORIGIN/api/auth/google/callback`**. Use an owned HTTPS origin without trailing slash and verify Workspace/domain/subject bindings privately. No `VITE_` secrets. The identity schema requires the reviewed explicit migration before startup; use [private operator commands](SHARED_AUTHENTICATION.md#private-configuration-and-explicit-setup).

Worker/selector settings: `NODE_ENV=production`, `DIZZLE_AUTH_MODE=employee`, `SHARED_AUTH_PORT`, `SOCIAL_WORKER_TOKEN_FILE`, shared marketing/publishing paths, plus private provider configuration when connected. `auth:operator worker` writes a one-hour credential to a private absolute file. Rotate with a new workload ID/output file, atomically update the private path/file and revoke the old ID. Expiry holds work; it does not auto-renew or resend. No token in `.env`, chat, shell arguments or logs. The API needs no worker bearer secret; the worker needs no Google secret or identity DB access. Restrict ACLs and split private service environments accordingly.

Keep **one host and durable local disk**. The API alone writes `DIZZLE_MARKETING_DIR/state.json`; API/worker share `DIZZLE_PUBLISHING_DIR/publishing.sqlite`, image blobs, `pilot-control.sqlite` and encrypted `social-accounts.json`; provider connection/refresh uses the same `SOCIAL_TOKEN_KEY`. Identity API/operator share `SHARED_IDENTITY_DB` plus WAL/SHM, outside checkout/web root, under the same private root if desired. No network filesystem, second identity authority or Sales production database is introduced. Back up history/images/queue/consumed pilot state consistently; preserve encryption keys separately. Never restore an unused slot to repeat a consumed attempt; keep live off pending reconciliation after restore.

Review actual host mounts, service users/ACLs, startup ordering, rotation, backup and restore. Existing PR #5 queue/pilot version-1 initialization is unchanged and must be reviewed before startup against persistent paths. Former `deploy/social-pilot` fixture units/preflight are not the new production-auth setup; do not install them unchanged. Proxy preserves exact Host, terminates TLS, blocks external `/api/internal/`, redacts callback queries/cookies/Authorization, and never aliases private files. Only the local worker calls `http://127.0.0.1:SHARED_AUTH_PORT/api/internal/publishing/authorize`. Instagram would retain its separate signed HTTPS media service/route; none is needed for X's image upload.

## Sales manager adoption and synthetic migration rehearsal

Sales source inspected: `origin/feature/sales-crm-management-parity` `a81ddae`, including canonical user IDs, roles, teams and verified Zoho salesperson mapping references. It remains unchanged/unmerged. Its password/Google conflict remains recorded in AUTH01. This integration does not replace Sales login.

`server/auth/sales-adoption-plan.ts` is a **dry-run contract planner**, not an executable production migration. It accepts synthetic Sales inventory and explicit verified Google bindings/grants, returns the unchanged IDs/roles/teams/assignments/mappings/historical actor references plus a source digest and proposed shared employees with the same IDs. Tests provision only a temporary target, preserving disabled actors and assigning no grants from roles. Duplicate subjects, missing bindings, orphan actors and cross-organization references hold the rehearsal. No password/hash/session is copied; no source DB is opened/written. This fixture inventory is not a complete real Sales database migration.

Reviewable adoption sequence:

1. Inventory canonical employee/organization IDs, active status, roles, teams, current assignments, verified Zoho mappings/evidence, historical approval/audit actors and schema/source digest. Preserve disabled/departed identities; resolve orphan actors without rewriting history or inferring assignments from invoice salesperson.
2. Admin verifies immutable Google issuer/subject/domain bindings independently and explicitly approves grants. Never join on email alone or inherit Marketing privileges from Sales admin status. Missing/deleted Workspace users need an explicit non-login historical identity strategy, not invented Google subjects.
3. Jointly review a **versioned** schema/data migration, rollback, reconciliation counts, full mapping evidence/timestamps and every FK consumer against a copied synthetic Sales database. Current rehearsal proves only the documented contract fields; it does not authorize a real import.
4. Adopt one cookie/session/CSRF implementation across Sales API, files, AI and UI while retaining current role/team/account checks. Test cross-dashboard sign-in, disabled/revoked/foreign users and assignment changes through shared sessions; never deploy a parallel password/session authority.
5. **Joint sign-off before replacing passwords:** Sales manager validates canonical IDs, roles, teams, mappings, assignments and historical actor preservation. Cheddr/admin validates principal evidence, explicit grants, offboarding ownership/timing, migration/rollback and password-session retirement. Both review private staging evidence. Only then schedule a separately authorized cutover/revoke old sessions. No password or old Sales session is disabled here.

## Remaining blockers

Shared review of both candidates/integration; Sales adoption/migration remains separate. Appoint host/operator and configure owned DNS/TLS, private durable storage, reviewed service/proxy/ACL/backup and credential rotation. Verify real Workspace login/offboarding privately. Directory offboarding sync is not implemented: Dizzle employee disable/revocation remains an operator responsibility.

For **@cheddrco_**, configure the X confidential app, exact separate social callback, API access/credits and private `X_CLIENT_ID`, `X_CLIENT_SECRET`, `SOCIAL_TOKEN_KEY`, `SOCIAL_OAUTH_REDIRECT_URI`, `SOCIAL_EXPECTED_HANDLE`; connect and verify numeric ID. No app/account/credit readiness is assumed. Provider setup references remain in [SOCIAL_PILOT_STAGING](SOCIAL_PILOT_STAGING.md). Prepare a new future Pacific approval for the exact account/caption/image version+hash/time and select only that job; keep worker stopped during connection/selection/restore. The old proposed time is not standing approval, and live gates remain off until separately authorized.
