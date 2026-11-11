# Approved Instagram and X publishing

November 11, 2026. Marketing branch / draft PR #5. **Live publishing is hard-disabled. No live post, account OAuth exchange or paid API request was made for this task.** Provider HTTP calls in tests are stubs. Existing OpenAI image-generation configuration/history is preserved.

## What works locally

Calendar entries can select a connected destination, approved raster creative, caption and Pacific posting time. The reviewer sees the handle, caption, time and exact JPEG export. Every content edit clears approval; account metadata and original image bytes are part of the approval snapshot. Editing queued content cancels its old queued job atomically before returning it to draft. Claimed, uncertain and completed posts are immutable; create a new entry for a new post.

**Queue approved post** freezes the approved payload and JPEG bytes in a separate private SQLite queue. It does not invoke a provider. Replaying the same approval cannot create a second job. Jobs show Scheduled, Publishing, Published, Failed, Needs Review and Canceled. The calendar status filter uses the current publishing result when present; internal/manual-only plans retain the earlier content-approval states.

Run from the same checkout with Node 24:

```sh
npm run dev
npm run social:worker
```

The worker is a separate process. Closing the browser does not stop it. Closing the worker or sleeping/shutting down the computer does stop local scheduling; an always-on host is required for dependable unattended operation. Test destinations are clearly marked `@cheddr_test`; their receipts are simulations, never Instagram/X posts. The live worker gate is a literal `false` in `scripts/social-worker.ts`, with a separate false gate in the reconciliation command. There is no browser or environment toggle that enables live posting in this PR.

Worker claims are atomic across SQLite connections/processes. A two-minute lease and durable provider checkpoints protect each job. Expired claims become Needs Review, never a new send. Checkpoints fence old workers before public writes. No public POST is automatically retried, including after timeout, restart or malformed success response. A definite rejection becomes Failed; edit/renew approval for another attempt. An uncertain result cannot be canceled, edited, retried or marked as a new manual post.

For an uncertain job:

```sh
npm run social:reconcile -- <job-id>
```

This is read-only toward the provider; live reads remain gated off. X reconciliation accepts a unique match of uploaded media key plus exact caption, or a previously saved post ID. Missing/ambiguous/paginated results remain Needs Review. Instagram can recover a saved media ID; a container marked PUBLISHED without the media ID stays in review rather than guessing from repeated captions. An authorized reviewer may inspect the actual destination and use **Record verified existing post** with its URL/time and explicit exact-post attestation, after the sending lease expires. This records existing publication only; it never sends another post. No-match is never treated as proof of non-publication.

## Manual fallback on the same entry

1. Get the exact account, creative, caption and time approved, then queue the entry.
2. **Cancel queued post** before manually posting, so the worker cannot also send it. Cancellation fails if a worker already claimed it.
3. **Download Image** and **Copy Caption**. Check the displayed handle, post using that platform's own interface, then use **Mark as Posted** with the actual platform post URL and Pacific time.
4. The entry shows Published, the recording employee/time and an **Open published post** link. A manual attestation is recorded as such; it is not API-verified evidence. Wrong-domain URLs and future posting times are rejected.

## Official provider verification

Sources were inspected November 11. Meta pages returned 429 in the web reader but were successfully fetched directly from developers.facebook.com with HTTP 200; requirements below come from those official pages, not third-party tutorials. X pages were read from docs.x.com. Recheck account-specific access and prices before a live test.

| Area | Instagram | X |
|---|---|---|
| Chosen login | Instagram API with Instagram Login; Business or Creator account; no linked Facebook Page required | OAuth 2 authorization-code flow with S256 PKCE, confidential Web App client |
| Minimum scopes | `instagram_business_basic`, `instagram_business_content_publish` | `tweet.read`, `tweet.write`, `users.read`, `media.write`, `offline.access` |
| Image transport | Meta retrieves a publicly reachable JPEG URL; then create container, check FINISHED and call media_publish | Upload bytes to `POST /2/media/upload` with `tweet_image`; pass returned ID to `POST /2/tweets` |
| This pilot | One feed image; JPEG/sRGB, at least 320px wide, max 1440px export width, 4:5–1.91:1; no crop | One JPEG image; no thread, reply, carousel, video or poll |
| Local guardrails | 2,200-character caption; stricter shared 5 MB image cap than Meta's 8 MB limit | Conservative 280 **UTF-8 byte** caption cap, stricter than X's weighted-character rules; shared 5 MB image cap |

Sources: [Instagram Login overview](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/), [Instagram Business Login and token lifecycle](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/business-login/), [Instagram publishing](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/content-publishing/), [image/caption specifications](https://developers.facebook.com/documentation/instagram-platform/instagram-graph-api/reference/ig-user/media), [X OAuth](https://docs.x.com/fundamentals/authentication/oauth-2-0/authorization-code), [X upload](https://docs.x.com/x-api/media/upload-media), [X create post](https://docs.x.com/x-api/posts/create-post).

Instagram documents a 100 API-published-post moving 24-hour limit, enforced by Meta; provider limit/access errors surface without automatic retry. Both adapters verify the current profile ID and exact handle immediately before uploading/publishing. Account changes stop sending and require reconnection/renewed approval. AI-origin creatives are disclosed using the providers' documented AI fields. Instagram's polling is bounded; unfinished or rejected containers do not trigger a blind media_publish retry. Other provider-supported post types are deliberately outside this implementation. [Meta publishing](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/content-publishing/)

X currently documents pay-per-use credits: Post Create $0.015/request, Post Create with URL $0.200/request, and User Read $0.010/resource. Reads for reconciliation can incur additional costs; qualifying owned reads have separate pricing. Upload-specific/account-specific billing must be confirmed in the developer console. These are provider prices, not a complete per-post quote or a configured spend cap. [X pricing](https://docs.x.com/x-api/getting-started/pricing)

No per-call Instagram publishing price was specified in the inspected official publishing/setup pages; do not interpret that as a verified permanent zero-cost guarantee. Confirm the account's console/terms. Hosting, storage, domain/TLS and optional OpenAI caption/image calls are separate costs. No subscription, credit purchase or hosting resource was provisioned by this task.

## Exactly what the account owner must do

### Instagram

1. Confirm the intended handle is a **Business or Creator** professional account. Create/select a Meta developer app and add **Instagram → API setup with Instagram login**. Use its Instagram App ID/Secret, not a Facebook Page token or unrelated app secret.
2. Add your owned/managed professional account in the app dashboard and accept required tester/role invitations. Standard Access is for owned/managed accounts added to the app; serving other accounts requires Advanced Access/App Review. Complete any business verification, privacy-policy/data-deletion URLs, app-mode or additional checks requested by your dashboard. [Access/setup requirements](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/business-login/)
3. Register the exact OAuth redirect URI. This CLI listens on loopback port 3499 at that URI's path. Use a registered loopback callback only if accepted by Meta; otherwise provide an HTTPS callback/tunnel forwarding to that port. No callback domain/TLS has been provisioned.
4. Privately set `INSTAGRAM_APP_ID`, `INSTAGRAM_APP_SECRET`, `META_GRAPH_VERSION`, `SOCIAL_OAUTH_REDIRECT_URI`, and `SOCIAL_TOKEN_KEY` server-side. Meta's current get-started example uses `v27.0`; explicitly select a supported reviewed version for your app rather than silently upgrading. [Meta get started](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/get-started/)
5. Stop workers while changing account configuration, then run `npm run social:connect -- instagram cheddr` (substitute the correct brand ID). Open the printed authorization URL, sign into the intended professional account and approve the two scopes. The callback exchanges the code, obtains a long-lived token and verifies `/me` before saving the exact handle/ID. Restart the API to show the account. No token is printed or sent to the browser UI.
6. Before any authorized live test, provide the public HTTPS media origin described below. This is required even though the rest of the creative library stays private.

Instagram short-lived credentials are exchanged for long-lived credentials. The vault refreshes eligible unexpired long-lived tokens before expiry; an expired/ineligible token requires reconnecting. Meta documents the 60-day lifecycle and refresh conditions. [Token lifecycle](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/business-login/)

### X

1. Create/select your developer account and app in the [X Developer Console](https://console.x.com/). Enable OAuth 2 user authentication with a confidential Web App client, register the exact callback URI and configure the app's website/permissions. Confirm API access, purchase credits yourself if needed, and set your desired console spending controls.
2. Privately configure `X_CLIENT_ID`, `X_CLIENT_SECRET`, `SOCIAL_OAUTH_REDIRECT_URI` and `SOCIAL_TOKEN_KEY`. These are OAuth client credentials; an app-only bearer token cannot publish as the user.
3. Stop workers during connection changes. Run `npm run social:connect -- x cheddr`, open the printed URL, sign into the intended handle and grant the five scopes. The server exchanges the code with PKCE, verifies the granted scopes and `/2/users/me`, then saves the verified ID/handle and encrypted credentials. Restart the API. No public media host is needed for X uploads.
4. Confirm credits and per-endpoint access in your console before authorizing one exact test post. X access tokens normally last two hours; `offline.access` supplies refresh tokens. The vault rotates and saves refreshed tokens server-side. [OAuth and lifetime](https://docs.x.com/fundamentals/authentication/oauth-2-0/authorization-code)

Configured brand IDs: `dizzle`, `cheddr`, `puffr`, `frosty`, `georgia-hemp`. Connect each desired brand/account deliberately. Build ownership does not grant account access. Connection is an explicit operator command, not a production multi-user web OAuth flow.

## Storage, credentials and hosting boundary

The existing `MarketingStore` remains a single-API-process local JSON store. The new versioned `server/publishing/001-publishing.sql` creates a **separate new queue**, not a migration to Zoho, Sales CRM or another database. Existing queue schemas are checked; no automatic upgrade of a future schema is performed. Node's built-in SQLite currently emits an experimental warning under the pinned Node 24 environment.

Default queue/vault location is the existing checkout-specific private marketing data directory outside the web root. `DIZZLE_PUBLISHING_DIR` may override it with an **absolute private directory outside the checkout**; API, worker, OAuth CLI, reconciliation and media origin must use the same directory. Keep the same persistent disk/path across restarts and releases. The queue contains approved JPEG bytes, so the worker does not need the browser or fixture API to send. SQLite atomic claims support multiple workers on **one host/local disk**; this is not multi-host PostgreSQL or a network-filesystem claim guarantee. The API's JSON store still requires a single writer.

`social-accounts.json` contains public account metadata plus AES-256-GCM encrypted tokens. Set `SOCIAL_TOKEN_KEY` to a private random 32-byte hex key and retain it in server secret storage; losing it requires reconnecting accounts. Restrict filesystem permissions/ACLs and backups. Server client secrets remain environment variables. Credential refresh uses an exclusive directory lock; after a crash, stop workers and inspect/recover an orphaned `token-refresh.lock` before reconnecting. Never steal the lock from an alive refresh process. No credential or signed media URL enters a client projection, handoff, Git file or error response.

For Instagram media, configure `SOCIAL_MEDIA_ORIGIN` (public HTTPS) and private `SOCIAL_MEDIA_SIGNING_KEY`, then run `npm run social:media`. It binds loopback 3498; place only that dedicated route behind the HTTPS reverse proxy. The worker gives Meta a signed one-hour URL for the exact queued JPEG. The server accepts valid unexpired capabilities only for live Instagram jobs that have begun publishing; no asset listing, token, employee endpoint or private original-reference library is exposed. Disable/redact query-string access logs. These temporary URLs intentionally allow Meta to retrieve that one approved image without a Dizzle session.

**Current hosting inspection:** no hosting manifest or provisioned API/database/worker/media origin was found. Vercel/Render/PostgreSQL/private object storage are proposals in PROJECT_SCOPE. The existing fixture API binds loopback and rejects production mode; test identity headers must never be deployed as authentication. A production web UI/API needs the shared reviewed identity/session integration first.

An operator must provision an always-on Node host, persistent disk, process supervision/restart policy, encrypted secret storage/backups, clock synchronization and TLS/media routing. This implementation can run its queue and worker on one host; separate Render API/worker services cannot be assumed to share a local disk. A multi-host design needs an explicitly reviewed PostgreSQL queue and private object-storage integration. Vercel frontend hosting alone does not run this worker. No provider hosting account, deployment operator, resources or cost commitments were selected here.

Before a live test: finish identity/hosting/account setup, identify the operator, review the exact account/image/caption/time and explicitly authorize that one test post. Then separately review changing the worker's hard-off gate and bounded test scope. Connecting an account or approving a calendar item alone does not enable live publishing in this PR.

## AI proposals

The calendar can request **Draft caption & propose time with AI**. It uses the saved brand kit and brief; a proposal only fills editable caption/time fields. It cannot approve, queue, select recipients or call the publishing worker. The normal exact review is mandatory afterward. Timing is a suggestion, not audience-performance evidence.

Set `OPENAI_CAPTION_MODEL` to a text model your project can access, using the existing server-only `OPENAI_API_KEY`. Without an explicit text model it returns an actionable setup message; the image model is not reused as a text model. The adapter uses the [OpenAI Responses API](https://developers.openai.com/api/docs/guides/text), validates its proposed caption/time and never exposes a publishing tool. Tests inject a labeled deterministic proposal provider, with no paid calls.

## Validation and next steps

Run `npm run check`. Tests cover a separate worker process with no browser/API, persistence, simulated due time, concurrent claims, approval/image snapshots, edit fencing, cancellation/manual attestation, uncertain/restart recovery, positive reconciliation, token encryption, OAuth state/PKCE, signed media access, provider payloads/redaction, and browser approval/queue/manual posting. Live account eligibility, app review, real OAuth callbacks, refresh, paid billing and real Instagram/X publication remain unverified until the owner completes setup and authorizes testing.

See [marketing demo](MARKETING_DEMO.md), [contracts](CONTRACTS.md) and [handoff](HANDOFF.md) for shared-review boundaries and verification outcomes.
