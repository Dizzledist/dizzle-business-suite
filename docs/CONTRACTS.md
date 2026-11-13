# Shared domain contracts

Version: proposed v0.1, November 6, 2026. **Both builders must review C1-C5** before implementing consumers. Business invariants derive from [scope](PROJECT_SCOPE.md); field names, representations and persistence below are implementation proposals, not verified Zoho API schemas. Open mappings and policies are tracked in [DECISIONS](DECISIONS.md). Changes must identify affected consumers and add/update [acceptance cases](ACCEPTANCE.md).

## Common conventions (proposed)

- Every record has an immutable internal ID and Dizzle organization/workspace scope. A brand, legal entity and provider organization are separate identities, never inferred from a display name.
- References must resolve within authorized organization/account scope. Access checks apply to joins, lists, files, search, reports, exports and AI retrieval, not only detail routes.
- Dates are explicit UTC instants; display business times in America/Los_Angeles. Source business dates retain their original date/timezone semantics.
- Monetary values use exact decimal strings plus currency, never floating-point arithmetic; preserve provider precision and currency rules. Quantities use exact decimals and explicit units/source line IDs.
- Audit records are append-only: actor (employee or named service), action, target, timestamp, reason where required, correlation/idempotency key and relevant before/after/source references. Do not include credentials or unrestricted payloads.
- Unresolved identity, source conflicts and missing required evidence are visible exceptions. Unknown is not zero, unpaid, paid or permission to act.

## C1: Identity and authority

Consumers: all dashboards, APIs, files, background jobs and assistants. Shared review required.

| Record | Proposed required meaning |
|---|---|
| Employee | `employeeId`, `organizationId`, active/disabled state; immutable external identity issuer/subject mapping rather than email as primary key |
| Role membership | `employeeId`, role, organization scope, grantor and effective/revoked timestamps; supports multiple simultaneous roles |
| Explicit grant | Action/resource scope, grantee, grantor, effective/expiry/revocation data and reason; sensitive/full access must be deliberate |
| Authorization context | Server-resolved active employee, organization, effective permissions and current account assignments; never trust roles from a browser selector |
| Assistant context | Same caller permissions and allowed records; employee disclosure of admin oversight and memory inspection/correction |

Roles and sensitive grants follow [PERMISSIONS](PERMISSIONS.md). Disabled/offboarded employees lose effective access; retained business records preserve authorship. Proposed rule: effective permission is the union of authorized role/grant scopes, with organization boundaries, inactive state and explicit restrictions taking precedence. Owner/admin must confirm sensitive/multi-role conflict rules (Q10). Approved policy **R01 (joint sign-off November 6, 2026)**: a sales rep role alone grants access only to assigned accounts. A separately granted role or full-access permission can broaden access only within its authorized scope. See [DECISIONS](DECISIONS.md) for sign-off status. Dizzle grants never alter Zoho permissions.

## C2: Companies, stores, buyers and account assignment

Consumers: sales/owner dashboards, finance views, fulfillment, portals, Assets and AI. Shared review required.

| Record | Proposed fields / invariants |
|---|---|
| Company account | `accountId`, organization, legal/billing references, source customer mappings; brand and service-client relationships explicit |
| Store | `storeId`, `accountId`, address references; a billing company can have multiple stores |
| Person / buyer | `personId`, authorized company/store relationships; person and employee are distinct identities |
| Lead | `leadId`, organization, assignment and eventual account linkage; conversion preserves ownership/activity history |
| Assignment | Account/lead, assigned employee, assigning actor, effective interval and reason; changes audited |
| Source customer mapping | Provider application/organization/customer IDs to an internal account; unresolved or conflicting mappings block automatic release |

Primary rep per account is proposed pending Q05; no multiple-rep allocation policy is assumed. Current assignment governs access; source rep, invoice salesperson and historical author remain separate fields for attribution. On reassignment, old rep loses access and new rep gains scoped associated records; caches/search/AI and outstanding links must revalidate. Neither reassignment nor a historic author field changes financial attribution. Null assignment is unassigned, not visible to every rep. Owner/admin and sales manager manage assignment.

Do not merge similarly named companies automatically. Buyer/customer portal access will require separate verified relationships; no portal identity system is implemented here.

## C3: Zoho invoice mirror

Consumers: sales/owner, finance, release service, warehouse and future portal. Shared review required.

| Field group | Proposed contract |
|---|---|
| Identity | `invoiceId` internal; source key `{application, zohoOrganizationId, sourceInvoiceId}` plus data center and internal organization mapping; display number is never the unique key |
| Canonical mapping | Verified aliases link the same invoice across Zoho applications to one canonical internal invoice. Do not deduplicate by number alone or count each mirror as a sale |
| Customer | Account/store/billing/shipping references and original provider customer ID; unmatched accounts produce an exception |
| Content | Source status (raw and normalized), dates, currency, total, outstanding balance, credits, source document/payment URL when authorized, and stable line IDs with SKU, description, quantity/unit, price/tax |
| Provenance | Provider version/update marker where available, source observation time, last successful sync, last verification, freshness state, error/conflict reference |
| Operational eligibility | Fulfillment requirement and eligibility result with reasons; invalid states and unresolved mapping/policy cannot auto-release |

Invoice totals, balances, payment applications and invoice state are source-owned. Dizzle does not issue, number or edit invoices; only owner and sales manager use Zoho for creation. Validate source URLs and authorize the associated customer before exposing links. A payment-page return does not update the mirror to paid.

Normalize statuses only after Q01-Q03 discovery. Proposed semantic categories include draft, open, partially paid, paid, void/cancelled and unknown; these are not asserted Zoho enum names. Preserve raw status and source history. Do not treat archived fulfillment work as a second sale.

## C4: Payment evidence and synchronization

Consumers: release service, financial views, AI explanations and sync health. Shared review required.

| Record | Proposed contract |
|---|---|
| Source payment application | Composite source payment/application identity, canonical invoice reference, currency, applied amount, valid/reversed/refunded state, source time/version when available and provenance |
| Payment assessment | Invoice reference/revision, `verificationState` (verified / awaiting verification / review required), settlement classification (unpaid / partial / fully paid / ambiguous), source balance/status, evidence references, verified-at and freshness result |
| Sync envelope | Provider and organization, provider event ID if supported, local ingestion ID, canonical resource key, source version/update marker if reliable, received-at, retry count, reconciliation state and correlation key |

Verified full payment means current authoritative Zoho status, balance and valid payment applications jointly meet the agreed policy for an eligible invoice. Zero balance alone is insufficient. Money reported/verified/deposited locally in cash/check custody is a separate workflow and does not establish Zoho payment or enable release.

Freshness thresholds, field/status semantics, payment application coverage, event ordering and refund/credit rules are **unverified** (Q02-Q03). Until defined/proven, ambiguous, failed or stale verification shows **Awaiting verification** or **Review required** and cannot automatically release. Never invent a freshness duration or infer authoritative ordering from local arrival time.

Proposed processing guarantees:

1. Authenticate provider deliveries and validate organization/resource mapping. Persist an ingestion reference; deduplicate provider events when stable IDs exist.
2. Reconcile current source state; reject older versions where ordering is reliable. When ordering is uncertain, re-fetch/reconcile rather than overwrite newer facts from an old event.
3. Record assessments and mirror updates idempotently. Duplicate payment applications must not inflate collected amounts.
4. Invoke C5's single release command only on fresh, verified eligibility, or a separate authorized terms request. Retries/concurrent workers must preserve one job.
5. Expose pending/failed sync, last verified time and retry/reconciliation status. Refunds/disputes/reversals after release raise review; preserve job/shipment history.

No Zoho OAuth scope, webhook support, writeback endpoint or API schema is verified by this document. Polling/reconciliation, durable retries and rate handling need a later connector design. Q01-Q04 gate live behavior.

## C5: Warehouse job and release command

Consumers: sales manager/owner controls, warehouse, tracking, financial views and notifications. Shared review required.

Proposed domain command: `ReleaseInvoiceToWarehouse(canonicalInvoiceId, trigger, actor, reason, requestKey, expectedRevision)`.

| Input / record | Meaning |
|---|---|
| Trigger | `verified_payment` from the named verifier service, or `approved_terms` from an authenticated owner/admin or sales manager |
| Terms evidence | Applicable approved terms and reason for early release, actor and server timestamp. Proposed R03 evidence includes a reference or retained snapshot of the already documented terms; exact form/schema remains open. R03 is jointly approved (November 6, 2026); free text alone cannot bypass role/eligibility checks |
| Concurrency | Request key and revision check; unique job constraint on internal organization + canonical invoice ID, including archived jobs |
| Warehouse job | `jobId`, canonical invoice/account refs, release basis/evidence, released-by/at, original audit reason, source revision, worker/priority, operational status, items, packages and exception flags |
| Job line | Stable invoice line reference, required quantity/unit, package allocations, shipped and outstanding quantities; allocations cannot exceed required quantities without reviewed amendment |
| Package | Stable package ID, included line quantities, carrier/tracking, awaiting-pickup vs carrier-movement status, event timestamps; partial packages retain remaining work |
| Result | Created with job ID; existing job with same ID; held/awaiting verification; forbidden; invalid; conflict/review required. Exact HTTP routes/status codes remain to be designed |

Required behavior:

- Evaluate authority, account/source mapping, invoice validity and requested revision on the server. Manual release permits an eligible unpaid or partially paid invoice; it never alters balance or marks payment verified. Draft/void/cancelled invoices and unresolved eligibility remain blocked.
- For verified-payment trigger, demand fresh authoritative evidence meeting C4. Approved policy **R02 (joint sign-off November 6, 2026)**: hold a manual terms release when current invoice validity or the account mapping cannot be verified. If a warehouse job already exists, preserve it and flag stale verification for review. Refresh/reconcile the source before reconsidering a new release; stale or failed sync never itself counts as terms approval or payment. Preserve the last verified evidence with its timestamp, not a guessed current balance or paid state.
- Approved policy **R03 (joint sign-off November 6, 2026)**: an authorized releaser must record the applicable approved terms and reason for early release. That record is sufficient when approved terms are already documented. If terms are missing or disputed, hold the release for explicit approval. Record that approval's actor/time/evidence before proceeding, then revalidate authority, invoice eligibility and mapping. Explicit approval cannot bypass other release safeguards; approval authority/form remains open for joint review.
- Create job, release audit and durable work references atomically or with an equivalent recoverable guarantee. Simultaneous payment and terms triggers, retries and historical replay cannot create a second job. Persistence mechanism is proposed, invariant is required.
- Later payments, including partial payments, update linked financial evidence and source balance on the existing job. Keep original terms-release actor/reason/terms/history; repeated authorized manual requests return the existing job even with different request keys rather than rewriting release provenance. Request-key deduplication alone is insufficient; canonical invoice/job uniqueness still applies. Separate retry/request audits may be appended without replacing the original release audit.
- Authorization failure creates no job and changes no balance. Proposed denial audit records actor/target/reason safely without exposing unauthorized customer detail.
- Lifecycle names available from legacy are Orders, Partially Shipped, Shipped and Dropoff/Pickup; new transition graph and actor permissions need Q06 approval. Picking/packing actions do not imply an approved Packing column.
- Amendments after picking/shipping and subsequent reversals create review exceptions. Never erase completed quantities or silently recall shipments. Preserve archived jobs under the uniqueness rule.
- Record shipments/partial quantities and rep-visible tracking without performing local stock subtraction. Shipment writeback remains disabled until Q04 is proven.
- Notification work uses approved sender/template/recipient policy and durable delivery outcomes. Initial release alone does not send a shipment confirmation; actual shipment events drive it. Historical replay has outbound effects disabled.

## Review checklist

Both builders review C1-C5, assignment scope, money/quantity precision, audit/idempotency, source aliases, freshness semantics and role matrix. Sales manager validates sales/owner consumers; user validates operational and future marketing/Assets access. Owner resolves business exceptions; designated integration lead supplies provider evidence. No signoff is claimed by the presence of these documents.

## Local Phase 1 mapping for shared review

User authorized a local implementation on November 6; this does not resolve provider mappings above. [shared/contracts.ts](../shared/contracts.ts) defines UI projections, [server/workflow.ts](../server/workflow.ts) owns release/access logic, and [LOCAL_DEMO](LOCAL_DEMO.md) documents routes, fixture assumptions and acceptance gaps.

- C1/C2: server-owned test identity/grant/role records, organization boundary and a single current assigned rep per synthetic account; no real login or grant-management API. Assignment changes, buyer/store matching and generalized full-access grants remain deferred.
- C3/C4: seeded read-only normalized invoice mirror, integer USD cents serialized as decimal strings; a named fixture adapter supplies ordered cumulative payment snapshots, not arbitrary client amounts or actual Zoho webhooks. The five-minute freshness policy is local-only.
- C5: one synchronous release path creates one in-memory job per canonical fixture invoice. Original audit is frozen; later balances are joined from source invoice state. Stale/unverified/mapping uncertainty produces a hold or review flag without removing work. No persistence/worker recovery claim.
- Warehouse projection contains source reference, customer, required items, Orders status and review flag; it omits invoice balances and release-audit reasons. This concrete local projection is for both builders to review before broader warehouse implementation.

The local route/data representation and fixtures are implementation choices, not changes to approved R01-R03. Both builders review shared consumers; no new Zoho behavior, warehouse stage, stock transaction, invoice creation or external messaging contract is introduced.

## Local Marketing Workspace extension, November 9

Authorized scope and conservative demo choices: MKT04-MKT06 in [DECISIONS](DECISIONS.md). This is the PR #5 local mapping, not adoption of all C6-C8 proposals on PR #2.

- C1: `Identity` adds `departments` and explicit `marketingGrants`; `marketing` joins the role union. The existing API authenticates active/read-enabled server fixtures once per request; marketing actions additionally enforce organization and action grants. Departments select a home view; they do not grant data access. Owner gets explicit author/reviewer/publisher/read-all grants, editor gets author/generation grants, reps get published-read. Admin status alone does not imply marketing access.
- C2: `Workflow.isAssignedToAccount` reuses the existing canonical fixture invoice assignment. The current fixture has no separate account registry; this is not a new account-ownership service. Rep price-list authorization intersects publication membership with current account assignment on every list and file request.
- Marketing records: Brand, Campaign, ContentItem, MarketingAsset, AssetVersion, GenerationJob and AssetPublication remain distinct. Generation input retains prompt, references and dimensions; each successful variation appends a draft version without overwriting files. Content approvals retain an exact serialized snapshot and creator/latest-editor identities; PATCH clears approval and scheduling. Linked creative is approved and brand-matched.
- File contract: private in-memory bytes are returned through the API after authorization with no-store/nosniff headers. Editors cannot enumerate restricted price-list/COA metadata or download those documents. Reps see approved active publications in their recipient snapshot and current permissions only. Retirement disables that publication on lists and direct URLs. Other active publications remain effective. Publication deduplication applies to the same active version/audience/recipient set in one process.
- Consumers affected: Phase 1 shell/API/fixtures, marketing UI, reusable SalesAssetsPanel, and future Sales CRM/Warehouse integration. `src/main.tsx` remains unchanged. Sales CRM's authenticated route dispatch must remain ahead of fixture routes during integration; adapt marketing to the reviewed session actor rather than adding another login. Warehouse's job/move fields and board changes must be retained separately. Port helper is copied verbatim from the Sales branch; reconcile Warehouse's different environment naming later.

State, files and audit fields reset together; no persistence, durable idempotency, complete review-decision ledger, live generation, outbound queue or external-send contract exists. Both builders review these extensions before combining departments. See [MARKETING_DEMO](MARKETING_DEMO.md).

## MKT08 supersession: OpenAI generation and local persistence, November 11

The image task explicitly supersedes the earlier synchronous sample/in-memory-only mapping above for marketing. C1-C5 invoice/payment/warehouse behavior is unchanged.

- `ImageGenerator` replaces the sample adapter: asynchronous generation returns validated PNG bytes, native size, sanitized provider request ID and token usage. Server-only configuration selects the model/quality. Selected reference copies go through image edits; uploaded originals remain unchanged. No COA generation is permitted.
- `GenerationJob` adds running status, model/quality/native-size/usage, request UUID/fingerprint, deduplicated retry UUIDs, attempt dates, retryable flag and uncertain-outcome flag. Creation/retry return 202 and the authorized workspace projection supplies status for polling. A running job interrupted by restart is held uncertain; it is not resubmitted automatically. Same-command replays return the existing job; changed payload/key reuse conflicts. There is no claimed provider-side exactly-once guarantee.
- API adds `POST /api/marketing/references`; only the existing creative-generation grant can upload single PNG/JPEG/WebP originals up to 5 MB/24 million pixels. File previews/downloads continue through the same authorized gateways. Request body size is increased only on the reference-upload route.
- `MarketingStore` saves metadata and file bytes in an atomic local snapshot outside the Vite workspace. It is a single-process pilot store, not a production database, worker, backup system or multi-process lease. Reset demo preserves marketing snapshots and only resets invoice/payment fixtures. Local counts and deduplication survive restart. Key values never enter the snapshot or client projection.
- Current consumers: studio upload/generate/poll/retry, exact-version review/publication, protected rep PNG downloads and isolated tests. Shared review needed for API registration, shared types, environment loading, sharp dependency and future Sales CRM/session/storage integration. Existing Zoho credentials, services and ownership are unchanged.

Configuration/status exposes readiness and safe model/quality/count information only. Missing-key generation fails before creating a job; malformed/uncertain upstream responses do not create publishable versions. Complete production audit, worker recovery, managed files, dollar budgets and provider-account acceptance remain explicit gaps. See [OPENAI_IMAGE_GENERATION](OPENAI_IMAGE_GENERATION.md).

## MKT09: reusable brand direction, November 11

`BrandKit` adds a brand ID, revision, written image/style/palette/type/logo/avoid rules, default reference IDs, per-reference categories and updater/time. Authorized workspace data includes private kit projections. `PUT /api/marketing/brand-kits/:brandId` requires the existing campaign-write grant and an expected revision; IDs must resolve to same-brand/org original-reference assets. General identity, customer assignment and rep publication authority are unchanged.

Every new generation snapshots the current kit and composes an effective prompt on the server. Defaults are unioned with requested extras, then validated against the existing four-reference cap. The original user brief remains separate from that composed prompt. Request-key replay returns the original job even after a kit edit; retries preserve the snapshot. Legacy jobs may omit the new optional kit/prompt fields. Saved snapshot schema 1 is extended with an optional brandKits array; absent kits initialize blank, preserving prior metadata/files. This is an additive local format extension, not a production migration.

Affected consumers: Brand Kits editor/library, Studio defaults/provenance, generation service and workspace types, protected shared file UI and later Sales CRM integration. Both builders review these changes. File previews/downloads reuse the same gateway; kit saving never publishes files or calls a provider. The kit is private marketing context, not a rep/account permission grant. See [BRAND_KITS](BRAND_KITS.md).


MKT10 additive follow-up, November 11: optional `BrandKit.brandBibleMarkdown` (20,000 characters) and `brandBibleFileName` (255 characters) are accepted by the same revision-checked PUT route; its body ceiling is 300,000 bytes. Older kits remain valid without these fields. Imported UTF-8 Markdown is saved as private plain text, included verbatim in effective prompts and preserved in job/retry snapshots. Brand Kits, generation, API/schema/storage and shared-contract consumers require both builders' review. No new upload/file gateway or permission is introduced.


## MKT11: approved social calendar and persistent queue

ContentItem gains optional destinationAccountId; the server validates configured account brand/platform/exact handle and approved raster image. The content snapshot now binds account metadata and image bytes in addition to caption/time/version. Every edit clears approval and atomically cancels unclaimed jobs; an already claimed/uncertain/published job blocks edits. Legacy manual plans remain valid, but old approval snapshots cannot authorize a new external send without renewed review.

MarketingWorkspaceData adds socialAccounts (metadata only), publishingJobs and literal-false livePublishingEnabled. New shared publishing types separate content approval from Scheduled/Publishing/Published/Failed/Needs Review/Canceled delivery. Schedule is async and writes an immutable approved payload/JPEG to the isolated version-1 SQLite queue; exact original approval/reviewer/time and JPEG hash are retained. API and worker share a private local directory; the API marketing JSON store remains single-writer. Cross-host PostgreSQL/object storage and production identity are not implemented.

API additions: POST /marketing/social/propose (campaign-write, drafts only); GET /marketing/content/:id/social-image (workspace-read protected JPEG); POST /marketing/publishing-jobs/:id/cancel (campaign-write, queued only); POST /marketing/content/:id/mark-posted (campaign-write, approved content plus canceled/definitely-failed job, valid platform URL/actual time); POST /marketing/content/:id/confirm-existing (review grant, explicit inspectedExactPost=true, uncertain expired lease, existing post evidence). Public input cannot set approval, worker state, credentials or provider receipts. Existing version publication remains internal rep-library publishing.

Worker uses atomic SQLite claim, lease/checkpoint fencing and one approved queue input. Expired/uncertain writes hold for reconciliation; no automatic public-create retry. Provider adapters validate current identity and use fixed hosts. OAuth connection is an explicit local operator CLI; AES-GCM tokens remain server-side and account changes require reconnect/reapproval. A separate capability-signed media origin exposes only the exact approved JPEG temporarily to Meta. AI drafts use a separate server text model and never approve/queue. No live provider calls in validation; hard-off gates remain false.

Affected consumers: Calendar, Review, manual download/shared file button, workspace/content snapshots/types, API registration, private queue/vault/worker/media and future Sales CRM/session integration. Both builders review before merging. See [social publishing](SOCIAL_PUBLISHING.md).


MKT12 pilot preparation: publishingStorage resolves optional DIZZLE_MARKETING_DIR for the existing MarketingStore and DIZZLE_PUBLISHING_DIR for queue/vault/media/OAuth; all executable entry points share this resolver. Local defaults are preserved; pilot preflight requires identical absolute private paths outside the checkout. This is runtime path configuration, not a data migration or storage-schema change. Optional SOCIAL_EXPECTED_HANDLE is verified after OAuth profile lookup and before encrypted token save. Affected consumers: server startup, worker, OAuth, media, reconciliation and deployment runbook; both builders review. Public production identity and execution-time revocation remain unmet shared requirements, not silently replaced by SSH or preflight. See [pilot staging](SOCIAL_PILOT_STAGING.md).


## MKT13: execution authorization and one selected pilot attempt

POST /marketing/publishing-jobs/:id/authorize is read-only and requires the original approving employee's current active/read/org and asset:review + asset:publish grants from the existing Workflow service. A supplied canonical SHA-256 fingerprint must match the job and its current approved content/account/time/version; prepared JPEG bytes are recomputed from the approved original. Current connected profile metadata is resolved freshly at each API decision, including disconnection or identity changes. Worker queries this fixed-loopback endpoint at claim and immediately before a public write. It does not cache a grant decision. API unavailability/denial, stale approval, changed bytes or destination hold Needs Review. Fixture identity headers are still local-only; production must provide reviewed shared employee/workload authentication and durable grants.

PublishingControls is required by default-deny worker behavior. Trusted adapters must call the one-use beforePublish callback immediately before public creation. Runtime controls use a separate new version-1 pilot-control.sqlite schema, sharing the private root with existing queue/history/vault. Its singleton immutable selection binds job ID, full approved-payload fingerprint (account numeric ID/handle/brand/mode, caption, image version/hash, time and approval), and atomic consumed-at/reservation. Repeated selection is idempotent before consumption only; a different selection or any consumed slot refuses. The one attempt is consumed before adapter calls and cannot be reissued after interruption, failure or uncertainty. Queue leases/checkpoints still fence sending and preserve reconciliation. No existing queue/SQL business database is migrated.

CLI social:pilot:select requires current API approval and exact @cheddrco_ / Cheddr / X numeric identity. It does not enable a live gate or call a social provider. Worker/API must share the configured API port plus persistent directories. Both builders review authorization endpoint, service approval/image checks, fresh-account resolver, worker/adapter callback, control-store schema/CLI and future workload/session integration. Existing financial/rep scopes and permission policy remain unchanged. See [pilot staging](SOCIAL_PILOT_STAGING.md).

## Proposed shared C1 runtime interface, November 12, 2026

The current user authorizes shared real-session implementation; [SHARED_AUTHENTICATION](SHARED_AUTHENTICATION.md) records source/review status, Google/password conflict, schema and adoption boundaries. [shared/identity.ts](../shared/identity.ts) proposes `EmployeeContext` (canonical employee ID, organization and current server-managed grants) and a trusted `PublishingResourceResolver`. Neither browser nor worker may supply authoritative identity, organization, grants or approval facts. Google issuer/subject is bound privately to an employee; matching email is insufficient.

The scoped worker submits job ID plus approved fingerprint and authenticates separately. The API resolves current approval/destination from the domain consumer and checks the active approving employee's current review/publish grants. Unavailable or denied authorization holds queued work for review. PR #5's durable one-selected-job control and immediate pre-write recheck remain mandatory. No business permission is added by this technical grant vocabulary.

Affected consumers needing shared review: Sales CRM session/UI/domain actor mapping, Marketing API/files/AI and worker authorization, operator provisioning and both dashboards' CSRF integration. Main has no merged real-session code; Sales a81ddae and Marketing PR #5 2ad2e46 are unmerged. This contract is a proposed extraction, not evidence that either consumer already adopted it. No production Sales migration or account ownership replacement is included.

## Marketing shared session adoption, November 12, 2026

On the isolated integration branch, `/api/marketing/*`, `/api/assets*` and protected files use shared employee sessions with current server-managed grants and organization; all mutations require same-origin CSRF. `/api/workspace` is a Marketing-only projection with no financial/warehouse records or inferred roles. Fixture identity transport is rejected in employee mode; the local fixture API is guarded from production/auth configuration.

`SharedAuthOptions.handleEmployeeRequest` mounts the authenticated consumer and `afterLogin` permits a root redirect. Public `/api/auth/mode` selects the appropriate UI without exposing identity or secrets. The trusted job resolver uses the actual MarketingService approval/creative/account/time validation, then shared auth reloads current employee/workload authority. Worker scope remains job/fingerprint-only and now requires workspace/review/publish grants. The authenticated loopback client is shared by worker and private selector; a private operator still controls the immutable selection.

No Sales canonical ID, role/team, account ownership or history changes. Hosted Marketing's domain projection has no Sales rights; selected rep audiences and assignment-scoped consumption remain closed pending a reviewed Sales adapter. A configured foreign Marketing state is rejected rather than silently migrated. A synthetic Sales adoption planner is review evidence, not a production data import. Both builders review these shared contracts and actual Sales cutover before replacing passwords. See [MARKETING_SHARED_SIGNIN](MARKETING_SHARED_SIGNIN.md).

## Proposed C1 reporting extension, November 13, 2026

User's Phase 1 reporting task uses the existing Google employee/session/CSRF source. `EmployeeContext` adds server-managed roles and `retailStoreIds`; explicit identity migration 002 preserves canonical employee IDs, sessions/grants and gives existing employees empty memberships. Operator provision/access JSON manages these fields privately. No role is inferred from UI, email, department or old approval history. No Sales authentication, password migration or account assignment is changed. Both builders must review this shared schema/context extension before merge.

New `retail:read` and `wholesale:read` grants confer only reporting authority in combination with the required current role. Retail also requires employee organization and exact assigned store. Owner/admin is not implicit all-store access. Role/store/grant revocation applies to existing sessions. Direct reporting routes reject fixture identities; shared middleware supplies the canonical employee and protects mutations with exact-origin CSRF.

`shared/retail-reporting.ts` defines compatible period/channel aggregates and per-user/dashboard inclusion preferences. Marketing always exposes the retail section; absent/denied data is explicit. Future Owner/Admin/Sales Manager consumers mount the shared summary, default off independently for each employee/dashboard. Add independent wholesale/retail amounts for the same calendar period/currency without order matching/deduplication. An unavailable or incompatible included source makes combined null, not a partial sum labeled complete. Retail access revocation withholds retail metadata/subtotals while authorized wholesale remains visible. This is not a replacement for Sales' pending `shared/reporting.ts`, financial access or recognition rules.

Reporting source adapters, role/grant assignment, identity schema 002, private preference schema and all future management/Sales adoption are joint-review boundaries. The only implemented source is synthetic, with explicit coverage/snapshot and no network transport. See [RETAIL_ANALYTICS](RETAIL_ANALYTICS.md).
