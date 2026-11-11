# Project status

Updated: November 11, 2026 (America/Los_Angeles).

## Current task: reusable Brand Kits

Active lead: Cheddr with Codex, November 11. User requests saved sample references, brand-bible images, logos and written branding guidelines so Image Studio reuses a consistent style. Implement per-brand settings/library and automatic generation guidance/default references using the existing private asset store. Shared contracts/API/generation snapshots require both builders' review; preserve existing permissions and image billing guards. No extra paid generation is needed for verification; use isolated providers.

Implemented: Brand Kits left navigation, per-brand written rules, batch raster uploads, categorized/searchable/paginated library, four reusable default references, revision-safe saves and server-composed generation guidance. Every new job retains its exact kit snapshot/effective prompt; retries keep the original direction. Existing saved images/history remain intact. See [Brand Kit setup](BRAND_KITS.md), MKT09 and the latest handoff for checks/publication. No new role, provider setting, account permission or production infrastructure is introduced.

Verification: `npm run check` passes typecheck, 56 API/provider/store tests, build and 8 Chromium tests. The new browser case saves/reopens brand settings and generates using defaults through an isolated provider. All 82 relative Markdown links resolve; no additional paid OpenAI call was made for this feature.

## Previous task: OpenAI image generation

Active lead: Cheddr with Codex, November 11. Explicit user request authorizes server-side OpenAI image generation in the existing Image Studio. Scope: key configuration, bounded provider calls, asynchronous job states/retry, raster output, protected file persistence and existing approval/publication consumption. Shared API/contracts need both builders' review; invoice, account and Warehouse logic remain unchanged. Tests use an isolated mock provider; real account verification depends on a locally supplied key. No external campaign sends, merge or deployment.

Implemented: fixed-host OpenAI generation/edits, private key loading, PNG exports, original raster-reference uploads, immediate job responses with polling, sanitized failures, explicit bounded retries, saved UUIDs/counts and protected local marketing history. New paid artwork survives restart and invoice Reset demo. See [OpenAI setup](OPENAI_IMAGE_GENERATION.md) and MKT08. Initial verification used isolated providers; the live activation result below supersedes the earlier missing-key state. Existing Zoho private configuration remains separate and unchanged. Final check/publication evidence follows in HANDOFF.

Verification: `npm run check` passes with typecheck, 51 API/provider/store tests, build and 7 Chromium tests, including existing invoice-to-warehouse cases. Browser tests use an isolated PNG provider and exercise reference upload, generation/retry, review and protected rep PNG download. Provider payload, quota/redaction, persistence, interrupted jobs and request deduplication are covered with stubs. Missing-key UI is explicit; direct web access to `.env` and the local store returns 403.

Live activation, November 11: user saved the private key and selected GPT-Image-2.6 Sunburst. Reloaded this API and submitted exactly one authorized medium-quality image test. OpenAI returned a 1024-square PNG, fitted to a 512-square export; the app saved the draft and its authorized download returned a valid PNG. Visually inspected the result. Reported token usage: 92 input, 1449 output, 1541 total; no dollar amount was returned. This verifies generation/model access for this project, not a live reference-edit or production rollout. Key values remain private and Git-ignored.

## Previous task: marketing navigation and visual design

Active lead: Cheddr with Codex. The user requests intuitive left-panel navigation for Home, Calendar, Image Studio, Review and Assets, plus a polished Dizzle visual system. Work stays on feat/marketing-workspace / draft PR #5. Implemented persistent desktop navigation, an accessible mobile drawer, contextual page headings, actionable overview counts, a creative launch area, thumbnail library, calmer forms and a plan-first Calendar with explicit editors. The new visual stylesheet is scoped to marketing. Both builders review App shell changes; existing fixture APIs/grants and Sales CRM/Warehouse boundaries are unchanged. MKT07 records this presentation decision. Verification/publication evidence is appended in HANDOFF; prior implementation records follow.

November 11 verification: `npm run check` passes (typecheck, 38 HTTP tests, build, 6 Chromium tests). Home, Studio, Assets and mobile navigation/layout screenshots were visually reviewed. The local preview remains at http://127.0.0.1:5473. No separate lint tool is configured; the existing Vite future-native-loader warning remains non-blocking.

## Current task: finish fixture-backed Marketing Workspace

Active implementation lead: Cheddr with Codex, November 9, 2026. The user supplied the original implementation prompt and explicitly requested completion of the existing Copilot prototype on `feat/marketing-workspace`, [draft PR #5](https://github.com/Dizzledist/dizzle-business-suite/pull/5). The branch now implements marketing home, campaigns/date-grouped content planning, Pacific internal scheduling, sample SVG generation with retry/versioning, exact-version review, internal selected/all-recipient publication and protected rep search/previews/downloads. [MARKETING_DEMO](MARKETING_DEMO.md) documents identities, steps and limitations. MKT04-MKT06 supersede the earlier setup-only scope for this task.

`npm run check` passes: typecheck, 38 HTTP tests (31 existing + 7 marketing), build and 5 Chromium tests (3 existing + 2 marketing). Desktop/mobile screenshots were visually inspected. No separate lint configuration exists. Final handoff records checks/publication, shared-contract changes and future slices. Preview: http://127.0.0.1:5473 with API 3301; defaults remain 5173/3001. Browser tests use isolated 5373/3201.

Shared surfaces: identity projections, fixture grants, assignment predicate, API registration, app entry/styles and configurable preview/test ports. Both builders review these changes; Sales CRM and Warehouse remain separate. This is a local in-memory demo, with no real login, provider generation, external posting/sends, production files, live reporting or deployment. Conservative self-review/audience/document rules are demo choices, not jointly approved production policy.

Implementation published as `401dbf5`; a focused follow-up normalizes two new files' line endings and records publication. PR #5 stays draft with an updated implementation description. Use the final branch head for review. See the latest handoff correction for staged-whitespace findings and the final response for remote CI status.

## Earlier task: marketing workstream setup

Active lead: Cheddr (Marketing / Admin) with Codex. Created `feat/marketing-workspace` in the separate `dizzle-marketing-workspace` worktree from fetched main at `d4afc223d7313274ecea75f3655d2188abbbbbd6` (merged Phase 1 PR #3). Tracked files were clean at setup. The original Warehouse checkout, its untracked workspace file, and the pinned Sales CRM preview are preserved.

This task documents separate sales/marketing ownership and future integration into one authorized app; it adds no dashboard, login, API or dependency changes. See [MARKETING_WORKSPACE](MARKETING_WORKSPACE.md) for branch references, shift handoff and shared-review needs. Sales CRM at `a81ddae`, Warehouse PR #4 and Assets proposal PR #2 remain separate/unmerged; their behavior is not included in this branch.

Next for Cheddr: choose a fixture-backed marketing home/Assets draft-review slice. Next for sales manager: continue sales/pipeline on the sales branch and coordinate shared shell/auth/config changes. Next shared review: department grants/default dashboard, reporting versus assigned-account scope, and reuse of one identity and asset service. Runtime authorization and routing remain unimplemented beyond the merged Phase 1 fixture workflow.

Historical Phase 1 status below is retained as the record before PR #3 merged; its draft/base references are not the current integration state. Setup verification and publication are recorded in the latest handoff.

## Verified starting state and current task

Repository: Dizzledist/dizzle-business-suite, origin `https://github.com/Dizzledist/dizzle-business-suite.git`. Phase 0 PR #1 merged as `19662f7cd731a64828801d52e825d5406be98633`. Fetched origin/main was that commit and ancestry was verified before creating **feat/phase-1-local-workflow**. Starting tracked tree was clean; `dizzle-business-suite.code-workspace` remains untracked/excluded.

Current task: user's explicit Phase 1 local workflow request. Active foundation/build lead is Cheddr (Marketing / Admin), with this Codex session implementing the scoped task. The request supersedes the earlier scaffolding hold for this local prototype only. Main stays unchanged during review; PR #2 remains a separate draft.

Published in [draft PR #3](https://github.com/Dizzledist/dizzle-business-suite/pull/3) against main. Implementation commit: `3439260`; publication notes follow on the same branch. Local checks pass; GitHub Actions results are tracked on the PR independently from local evidence.

## Implemented local slice

- React/TypeScript/Vite shell with server-defined sales manager, rep, warehouse, owner/admin and negative test identities.
- Loopback Node API with organization/assignment scope and active read/release grants enforced on every request. Warehouse receives released operational jobs only, without invoice balances/release reasons.
- Synthetic invoice/payment adapter, verified-full-payment release, documented approved terms/reason release, single canonical job, preserved original audit, replay/older-event handling, and holds/review flags for stale/unverified/mapping uncertainty.
- Invoice list/detail, source balance/payment/freshness, linked job/release audit, demo event/reset controls and scoped warehouse board. All state is in memory.
- PR CI for typecheck, HTTP tests, client build and Chromium browser tests; [run guide and API/coverage details](LOCAL_DEMO.md).

Approved R01-R03 and A26-A30 are the business baseline. [DECISIONS](DECISIONS.md) records local implementation choices; they do not verify Zoho. [CONTRACTS](CONTRACTS.md) records the local API mapping for shared review. No marketing/Assets scope from PR #2 was imported.

## Validation and acceptance evidence

`npm run check` passed locally on Node 24: typecheck, **31 HTTP integration tests**, build and **3 Chromium browser tests**. The added automatic-payment regression starts with a fresh unpaid invoice, proves the warehouse is empty, receives full payment without a terms release, and verifies one warehouse job with unchanged ID/original audit after replay. Desktop and mobile screenshots were visually inspected in the initial implementation. No separate lint configuration exists.

Implemented acceptance evidence: A02-A10; denial-response/no-job portion of A11 (safe denial audit remains unimplemented); in-process concurrency portion of A12; A13-A14; draft/credit/mapping safeguards from A15-A17; invoice/job scope portion of A18/A28; active-job behavior of A26-A27; A29; missing/disputed terms hold from A30. See the precise limits in [LOCAL_DEMO](LOCAL_DEMO.md). These are fixture tests, not live provider acceptance or completed production Phase 1.

## Gaps and next steps

No Google Workspace authentication, durable persistence/queue/audit, multi-process transactions, protected files/search/AI, reassignment UI, source aliases/import, invoice amendments/reversals, shipment quantities/tracking, notifications, migration, live Zoho or staging/production environment. Jobs use only Orders; no new warehouse stage was approved. Archive-specific A27 behavior and durable crash recovery are deferred. Terms-dispute resolution has no authority/UI contract yet; these invoices stay held.

Q01-Q04 remain open: actual Zoho origin/organization/data-center mapping, payment/credit semantics, event ordering/freshness and stock effects. Demo five-minute freshness and ordered source snapshots are labeled fixture assumptions.

| Builder | Next safe task |
|---|---|
| Cheddr / Phase 1 lead and merge operator | Review this local slice with sales manager; select a separate real identity/persistence foundation task with isolated tests and one shared implementation lead. Keep live connectors/infrastructure separately authorized |
| Dizzle Sales Manager | Validate sales account/invoice/terms examples, rep isolation and audit behavior in the demo; define account/store ownership cases before dashboard work |
| Both builders | Review the local C1-C5 mapping and remaining permission/terms-dispute decisions. Reconcile the separate Assets proposal in PR #2 independently |

Department dashboards, marketing studio/Assets, live integration, infrastructure, deployment and operational cutover remain future tasks. Replit remains operational; this demo does not replace any production writer.
