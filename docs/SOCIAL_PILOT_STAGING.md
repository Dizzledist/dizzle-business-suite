# First Cheddr hosted social pilot: preparation and review

November 11, 2026. Reviewed draft [PR #5](https://github.com/Dizzledist/dizzle-business-suite/pull/5) at **96e8fc8c364248fc26614efc0993c862ef0de5b0** before changes. The owner confirmed the target is **@cheddrco_** and its X developer app is **not configured**. X is the prepared first platform because it avoids public media hosting; readiness is blocked, not assumed. No Instagram app/account was found ready either.

This is a prepared **private, fixture-only staging setup**, not a deployment or live-post authorization. No host, DNS, TLS certificate, developer app, credit purchase or account connection has been created. Both live provider gates remain hard-off. General provider details remain in [SOCIAL_PUBLISHING](SOCIAL_PUBLISHING.md).

## End-to-end review results

`npm run social:pilot:verify` exercises the actual HTTP API with an isolated private directory, fresh MarketingStore/SQLite connections and test image/caption/publishing adapters. It never imports the local `.env` or contacts OpenAI, Meta or X. Tests create an actual 512-square PNG, approve its version, create and approve a Cheddr X calendar entry, then queue its JPEG export.

| Case | Evidence |
|---|---|
| Approval and queued image survive API restart | Close API, recreate API/store/queue, read same approved caption/account/image/time and exact frozen JPEG |
| Wait for due time | Simulated 2026-11-12 11:59:59 PST: no send; noon PST: one send |
| Publish once and retain result | Repeated worker ticks produce one adapter call and one claimed event; subsequent API restart retains Published, test receipt and published timestamp |
| Editing invalidates approval | Change publish time through PATCH; approval becomes null/Draft, previous queued job becomes Canceled and cannot send |
| Cancellation prevents sending | Cancel through API, restart, run worker at due time: zero sends |
| Uncertain response | Test adapter checkpoints then throws uncertain error; API and worker restart retain Needs Review with no resend |
| Private staging guards | Production mode, checkout `.env`, enabled live gates, wrong handle or inconsistent storage paths fail preflight; no public-ready claim |

Existing tests additionally cover a separate worker OS process without API/browser, competing SQLite connections, OAuth state/PKCE, token encryption, provider payloads, manual fallback and browser exact-image review. This proves local behavior under test adapters; it does not prove actual host reboot, provider OAuth, billing, token refresh, provider media fetch or live delivery. Final full-suite outcomes are recorded in status/handoff.

## Auth and live-pilot blockers

The marketing branch still uses the server-defined `X-Demo-Identity` fixture selector. `server/index.ts` binds 127.0.0.1 and rejects NODE_ENV=production. Main is Phase 1 commit d4afc22; the reviewed baseline specifies Google Workspace identity with server-managed grants. No reviewed replacement auth/queue/hosting implementation is present here. Do not merge in or assume an unreviewed Sales CRM branch.

**Do not publicly proxy the UI or `/api`.** Removing the production guard, setting development mode on an internet-facing app, adding a proxy password or hiding the dropdown would not implement shared employee permissions. Private fixture staging may be accessed by a named operator through SSH forwarding with synthetic records only.

Before any live hosted pilot, integrate the reviewed real identity/session/organization/grant boundary. The worker currently consumes frozen approval metadata; it does **not** re-query current employee/reviewer grants or offboarding at execution time. [PERMISSIONS](PERMISSIONS.md) requires revocation to apply to queued work. This must be addressed using the shared reviewed service, without creating a parallel auth layer. The global hard-off gate also needs a separately reviewed **one-job/account scope** before one live test; simply enabling every overdue live job is unacceptable. These are blockers, not completed features or permission to change gates now.

Other blockers: X developer app/credits/scopes and verified numeric user ID; appointed host/operator; a private persistent disk and backup/restore procedure; exact image/content/future-time approval. The proposed source image is still a draft, not an approved real product image.

## Prepared one-host layout

Use one Linux host with reviewed Node 24.x, one service user `dizzle-staging`, one API process and one worker. Keep the existing local-disk SQLite model; no PostgreSQL or network-filesystem substitution is included.

| Item | Staging path / process |
|---|---|
| Code/dependencies | `/opt/dizzle/social-pilot` (read-only to runtime user) |
| Private server environment | `/etc/dizzle/cheddr-staging.env`, root-managed mode 0600, never in checkout |
| One persistent root | `/var/lib/dizzle/cheddr-staging`, runtime user owned, mode 0700 |
| Marketing approval history and file bytes | `<root>/state.json`, API single writer |
| Queue, frozen JPEGs, events, receipts | `<root>/publishing.sqlite` and its `-wal`/`-shm` sidecars, API/worker access |
| Encrypted provider credentials | `<root>/social-accounts.json`, OAuth/refresh writer; API reads metadata only |
| Refresh lock | `<root>/token-refresh.lock`, exclusive rotation lock; inspect after stopping workers if orphaned |
| API | 127.0.0.1:3001; never publicly proxied |
| Optional private test UI | 127.0.0.1:5173, SSH only |
| Temporary OAuth callback listener | 127.0.0.1:3499, only during explicit connect command |
| Optional Instagram media | 127.0.0.1:3498 behind dedicated signed HTTPS media route |

Set **both** `DIZZLE_MARKETING_DIR` and `DIZZLE_PUBLISHING_DIR` to that same root. The new shared resolver is used by API, worker, OAuth, media and reconciliation. This fixes a staging issue found during review: at 96e8fc8, publishing override alone left marketing history under a checkout-path-derived default, risking a different history on a new release path. Existing local defaults remain unchanged when the new marketing variable is absent. No existing local data was moved or copied into staging.

All processes must run as the same service user and use the same private EnvironmentFile and local disk. The AES-GCM vault key must remain stable across releases and be recoverable separately from encrypted backups. Never rotate it casually, expose it as VITE_* or replace the encrypted vault with plaintext tokens. Stop API/worker/connection/refresh processes for a coherent first-pilot backup, then back up the entire root including SQLite sidecars and a separately protected key reference. Restore into an isolated private directory, keep live gates off and rerun the pilot checks before use. Do not copy laptop business history, secrets or real customers into this synthetic staging environment.

## Prepared service/configuration artifacts

Templates are in [deploy/social-pilot](../deploy/social-pilot/cheddr-staging.env.example): API, worker and optional media systemd units, private environment example and provider-route nginx snippet. They were prepared on Windows and **have not been installed or executed on a Linux host**. Node/TypeScript preflight and application behavior are tested locally; Linux unit/proxy validation remains an operator step. Node's experimental SQLite and the existing Vite loader warning remain visible.

Operator sequence, after host/resource/operator approval:

1. Provision the host and durable local disk. Create the service user, code directory, private root and environment file with the ownership/permissions above. Install Node 24.x at the unit's `/usr/bin/node` path or review/change all unit paths consistently. No checkout `.env` is permitted on this host.
2. Check out the reviewed PR revision, run `npm ci` including tsx/test dependencies, `npm run check`, and `npm run social:pilot:verify`. These tests use temporary stores and test adapters. They do not populate or reset the persistent staging queue.
3. Privately populate the environment template. For initial test staging, X client fields/key/callback may remain blank; preflight reports presence only, never account readiness. `DIZZLE_PILOT_PRIVATE_ONLY=1`, both paths and `SOCIAL_EXPECTED_HANDLE=@cheddrco_` are mandatory.
4. Run `npm run social:staging:check` under the private environment. It checks Node, paths, absence of checkout `.env`, expected handle and hard-off source gates. It **does not** verify firewall, TLS, persistent disk, provider credits, identity integration or live readiness.
5. Review/install only API and worker units initially. On the host run `systemd-analyze verify` against the actual unit paths before starting them. Run `nginx -t` if installing the optional HTTPS route snippet. Validate Linux-specific settings and filesystem access on that actual host; Windows tests do not prove these.
6. Keep firewall access limited to the operator's SSH access. For optional UI inspection, start Vite on 127.0.0.1:5173 as a private transient service; forward the **same configured web port** because the API checks browser origin. Do not expose the dev server publicly.
7. Inspect service status/logs without printing environment values. Keep live worker and reconciliation gates false. Stop the worker during connection or restore operations.

Example private UI forwarding from the operator's computer:

```sh
ssh -N -L 5173:127.0.0.1:5173 -L 3499:127.0.0.1:3499 OPERATOR@HOST
```

Open `http://127.0.0.1:5173`. It is a fixture demo, even on this remote machine. A browser-less API check can use an SSH-forwarded API port; no public fixture route is required. Vite should be run in a separate private process, not used as an internet-facing production server.

The service units intentionally use private development fixture mode and keep the production rejection intact. Units/process sandbox directives follow [systemd execution documentation](https://www.freedesktop.org/software/systemd/man/latest/systemd.exec.html); optional upstream routing follows [nginx proxy documentation](https://nginx.org/en/docs/http/ngx_http_proxy_module.html#proxy_pass). These are prepared templates, not proof of a provisioned host or production authentication.

## First X connection checklist: @cheddrco_

- [ ] Create/select the Cheddr developer app in the X console. The owner confirmed this is not yet configured.
- [ ] Set user authentication to OAuth 2 and a **confidential Web App** client; select Read and Write app permissions, not DM permission. Supply the app's real website/privacy/terms information when requested.
- [ ] Confirm this app/account can access `GET /2/users/me`, `POST /2/media/upload`, `POST /2/tweets` and the owned-post read route needed for reconciliation. Confirm credits/billing and desired console spending controls. Do not make a test POST to verify access during this preparation task.
- [ ] Grant exactly `tweet.read tweet.write users.read media.write offline.access` during OAuth. The code uses S256 PKCE and validates returned scopes. An app-only bearer token is insufficient for this flow.
- [ ] Register the callback URI **exactly**: scheme, hostname, explicit port, path and trailing-slash choice must match `SOCIAL_OAUTH_REDIRECT_URI`. Proposed SSH-only loopback candidate: `http://127.0.0.1:3499/oauth/callback`, subject to acceptance in this app's console. `localhost` and `127.0.0.1` are not interchangeable registered strings. If rejected, choose an owned HTTPS callback `https://YOUR_OWNED_HOST/oauth/callback`, configure real DNS/TLS and forward only that path to 3499. No actual public domain has been selected.
- [ ] Privately configure `X_CLIENT_ID`, `X_CLIENT_SECRET`, `SOCIAL_TOKEN_KEY` and `SOCIAL_OAUTH_REDIRECT_URI`; set `SOCIAL_EXPECTED_HANDLE=@cheddrco_`, plus the shared paths. The key is 32 cryptographically random bytes encoded as 64 hex characters; store it privately, never in chat/logs/source. `SOCIAL_OAUTH_PORT=3499` is a nonsecret setting.
- [ ] Stop the worker; run `npm run social:connect -- x cheddr` on the host as the service user with its private environment. One option is a reviewed `systemd-run` transient command using `--property=EnvironmentFile=/etc/dizzle/cheddr-staging.env`, the code WorkingDirectory and the same uid. Do not paste secrets into shell arguments/history.
- [ ] Open the printed authorization URL and sign into **@cheddrco_**. Keep the SSH callback forward or temporary HTTPS callback route available. The callback listener lasts five minutes; code exchange starts immediately. No employee login flow is created by this provider connection.
- [ ] Verify the returned handle **and numeric user ID** before accepting the connection. The optional expected-handle guard rejects a different authorized handle before writing credentials. Restart API to reload verified metadata; preserve the same key and encrypted file when restarting worker. Do not enable live gates.
- [ ] Review the approval packet below and resolve every auth/hosting/one-job-scope blocker before requesting authorization for a real post.

Official references rechecked: [X OAuth/PKCE/scopes/callback matching](https://docs.x.com/fundamentals/authentication/oauth-2-0/authorization-code), [X image upload](https://docs.x.com/x-api/media/upload-media), [X current credits/prices](https://docs.x.com/x-api/getting-started/pricing). Console access/credits remain unverified; no purchase/read/write API call was made. Optional OpenAI image/caption secrets are deliberately omitted from this test-pilot environment.

## Instagram alternative and dedicated HTTPS routes

No Instagram handle or app is confirmed. Before switching platforms, identify the exact professional Business/Creator account and new approval packet. Configure `INSTAGRAM_APP_ID`, `INSTAGRAM_APP_SECRET`, a reviewed `META_GRAPH_VERSION`, `SOCIAL_TOKEN_KEY`, exact `SOCIAL_OAUTH_REDIRECT_URI`, and an appropriate expected handle. Grant `instagram_business_basic` and `instagram_business_content_publish`; meet owned-account/app-role or Advanced Access/App Review requirements as applicable. [Meta Login requirements](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/business-login/)

Also configure private `SOCIAL_MEDIA_SIGNING_KEY` and HTTPS `SOCIAL_MEDIA_ORIGIN`, run the optional media service, and route only `/social-media/<job-id>.jpg` to 127.0.0.1:3498. The one-hour signature is carried in the query string and must be forwarded unchanged with logs disabled/redacted. The service serves only an eligible approved queued JPEG; there is no public asset directory or app API. Forward `/oauth/callback` only while connecting; return 404 for everything else. Keep SSL certificate setup, domain ownership and external reachability as explicit operator checks. X requires no public image URL. [Meta publishing transport](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/content-publishing/)

## Exact first-live-test proposal, not an approval

Machine-readable record: [first-live-test.proposal.json](../deploy/social-pilot/first-live-test.proposal.json). It is a review artifact, not worker input. **Nothing has been queued or approved for live sending.**

| Field | Exact proposed value / blocker |
|---|---|
| Destination | X **@cheddrco_**, brand Cheddr; numeric provider ID must be captured/verified after OAuth |
| Caption | `Cheddr publishing pilot: a single-image test from our marketing workspace.` |
| Image | Existing Cheddr draft asset `asset-8578837e-f19f-4635-889d-655bcb5ed9f7`, version `version-e5ce065d-5aa3-4bad-897c-5e5c046af3c2` |
| Exact export | Private `pilot-review/cheddr-first-post.jpg`, JPEG 512×512, 47,201 bytes |
| JPEG SHA-256 | `777a123ebee2a46ffe32aaaf2f2a42b3cb4189988b911c56d73b6148d1460468` |
| Visual review | Generic unlabelled bottle on burgundy and dark stone; illustrative pilot artwork, **not a verified Cheddr product render** |
| Proposed time | **November 12, 2026, 12:00 PM Pacific (PST, UTC−08:00)** = `2026-11-12T20:00:00.000Z` |
| Time/approval rule | Reconfirm a future instant after setup. If this proposal becomes overdue, choose a new future time and renew approval; never catch up automatically |
| Current status | Source creative is still Draft; provider identity, exact image, caption and future time require named owner approval |

The candidate JPEG was exported from the existing saved image with the same no-crop JPEG conversion used by the app. It is in the existing private local marketing directory, not committed or uploaded to a host/provider. The source version's approval state was not changed. Transfer/import the exact candidate to private staging only when appropriate, verify its hash and explicitly approve its version there. Replacing the image, changing account/handle/caption/time or recreating it with different bytes requires a fresh packet and exact review.

Only after setup and a reviewed real-identity/execution-scope path exist should the owner authorize **one named job** with this exact verified account, image hash/version, caption and future instant. Record the approver, approved snapshot and job ID. Live gates remain false throughout this preparation. No account connection or calendar approval alone grants permission to turn them on.
