# Session handoffs

Append entries and later outcome/correction notes; preserve prior session evidence. Dates use America/Los_Angeles. Never include secrets or customer data.

## Session 2026-11-06 / user with Codex: Phase 0 preparation

- **Task:** Establish documentation and shared domain contracts only.
- **Starting state:** main tracked origin/main at `aeab1c854041e3ee1ae4ed1ffd084c86738b687c`; fetched origin/main before branching. Tracked tree clean; only untracked file was `dizzle-business-suite.code-workspace`.
- **Branch / review:** `docs/phase-0-foundation`, based on that fetched commit. Draft PR publication outcome will be appended after push; no merge authorized by this task.
- **What changed:** README navigation; repository conventions; status, decisions, shared contracts, role matrix and concrete invoice-to-warehouse acceptance scenarios. Baseline PROJECT_SCOPE remains unchanged.
- **Modules/contracts affected:** Documentation for identity, account assignment, Zoho invoice/payment, fulfillment release and permissions (C1-C5). Both builders must review; no signoff or deployed behavior claimed.
- **Checks at preparation:** Read README and scope; verified branch, working tree, remote URL and fetched base. Final diff/link/staging checks and publication are recorded in the outcome entry.
- **Schema/environment:** None. No code, dependencies, infrastructure, credentials or live provider setup added.
- **External actions at preparation:** Read/fetch GitHub state. Task authorizes pushing the documentation branch and opening a draft PR; later outcome records completion.
- **Known failures/incomplete:** No app or runtime tests exist. Provider statuses, payment applications, freshness/event ordering and stock-impact contracts are unverified. Review/merge operator and active foundation lead are not yet assigned.
- **Decisions/blockers:** Confirmed rules and open Q01-Q11 are in [DECISIONS](DECISIONS.md). Proposed types/permissions are clearly labeled; unresolved provider behavior cannot establish release eligibility.
- **Next: sales manager:** Review C1-C5/permissions, define fixture-backed sales/owner account and invoice requirements, assignment/isolation cases and source mapping questions. Do not build a parallel connector.
- **Next: user / marketing lead:** Review C1-C5/permissions, define image studio/Assets approval, versioning, access and rep-consumption contract with sales manager. No live publishing/sends in that documentation task.
- **Next: shared foundation:** Appoint one lead, agree layout and shared reviews, then open a separate local scaffolding/isolated foundation task before Zoho integration. Main remains unchanged during this task.

## Session 2026-11-06 / Phase 0 verification and publication outcome

- **Commit / review:** Foundation commit `f73ef93` on `docs/phase-0-foundation`; [draft PR #1](https://github.com/Dizzledist/dizzle-business-suite/pull/1) targets main. This outcome note is a follow-up documentation commit on the same PR.
- **Checks:** Reviewed all eight changed documents and README navigation against the baseline. All 40 relative links resolved; staged whitespace check passed. Staged names were exactly the eight intended documentation files; PROJECT_SCOPE was unchanged. No runtime typecheck/lint/build/tests were available or claimed.
- **Git / preservation:** Initial documentation commit pushed with upstream `origin/docs/phase-0-foundation`. Local main and origin/main stayed at the verified base. The workspace file remained untracked and excluded from staging/commit.
- **External actions:** Fetched origin, pushed only the task branch, and created the draft PR. GitHub connector returned 404 for PR creation; existing Git authentication via GitHub API successfully created it. No merge, deployment, provider integration, customer data action or external message send occurred.
- **Remaining review / next tasks:** Both builders review C1-C5 and permissions. Sales manager defines sales/owner fixtures, assignments and isolation cases; user defines marketing/image studio/Assets approval and rep-consumption contract. Appoint one shared foundation lead before separate scaffolding; provider questions remain explicitly unverified.

## Session 2026-11-06 / user with Codex: Phase 0 review follow-up

- **Task / lead:** Current Codex session for the user; documentation-only follow-up to the user/sales-manager review. No implementation or joint sign-off claimed.
- **Starting branch / verified PR head:** Began on `docs/image-studio-sales-assets` at `451b6b5`, tracked tree clean with only the workspace file untracked. Read AGENTS, scope and existing foundation docs. Verified GitHub PR #1 open/draft/unmerged at `925f11d65fce1b7d1de890d4429b58e4938ec207`, head `docs/phase-0-foundation`, base main; fetched origin and switched to that matching foundation branch before editing.
- **Branch / review / commit reference:** `docs/phase-0-foundation`, existing [draft PR #1](https://github.com/Dizzledist/dizzle-business-suite/pull/1). Follow-up commit subject: `docs: record Phase 0 review follow-up`. No new PR or Assets-proposal changes.
- **What changed / contracts:** Pending R01-R03 recorded in DECISIONS and referenced in C1/C5, permissions, status and acceptance. Added A26-A30; no Zoho source ownership, invoice creator rights or one-job invariant changed.
- **Joint sign-off recommendation R01 — pending user + sales manager:** A sales rep role alone grants access only to assigned accounts. A separately granted role or full-access permission can broaden access only within its authorized scope.
- **Joint sign-off recommendation R02 — pending user + sales manager:** Hold a manual terms release when current invoice validity or the account mapping cannot be verified. If a warehouse job already exists, preserve it and flag stale verification for review.
- **Joint sign-off recommendation R03 — pending user + sales manager:** An authorized releaser must record the applicable approved terms and the reason for early release. That record is sufficient when approved terms are already documented. If the terms are missing or disputed, hold the release for explicit approval.
- **Checks / results:** Documentation diff, relative-link and whitespace results are recorded in the verification note below. No runtime test harness exists; acceptance cases remain specifications.
- **Schema / environment:** None. No app scaffolding, dependencies, migrations, infrastructure or live integrations.
- **External actions / scope:** Read GitHub PR state and fetched origin; task authorizes committing/pushing only this documentation follow-up to PR #1. Keep PR #1 and PR #2 draft; do not merge, push main, change PR #2 or send messages.
- **Open decisions / assignments:** User and sales manager must assign the merge operator and Phase 1 lead; both remain unassigned. Q01-Q04 Zoho source/payment/freshness/ordering/stock behavior remains open. Terms-dispute approver and evidence format remain for joint review.
- **Next: sales manager:** Review R01-R03, account scope and A26-A30; record sign-off/amendments with user. Sales/owner requirements remain their build responsibility.
- **Next: user / marketing lead:** Review R01-R03 with sales manager; jointly assign merge operator and Phase 1 lead when ready. Keep the Assets proposal separate; no generation/publishing is authorized.
- **Next safe shared step:** Complete joint review and recorded assignments. App scaffolding stays on hold; no implementation may infer approval from these recommendations.

Verification note: reviewed the six-file documentation diff against starting PR head `925f11d`. All 45 relative links across nine Markdown documents resolve; A01-A30 have 30 unique scenario rows; working-tree whitespace check passed. README, AGENTS and PROJECT_SCOPE are unchanged. Only the six named foundation documentation files are to be staged; the workspace file remains untracked. No runtime checks were available or claimed. Final staged whitespace/preservation checks precede commit/push; the task's final response records the published commit and verified PR states.

## Session 2026-11-06 / Cheddr with Codex: Phase 0 joint sign-off recorded

- **Task:** Record explicit joint approval and assignments only, on the existing PR #1 branch. Approving participants: **Cheddr and Dizzle Sales Manager**, as explicitly reported by the user.
- **Verified reviewed revision:** Before edits, current branch, fetched `origin/docs/phase-0-foundation` and GitHub PR #1 head all matched `609f2cae3059c98873274afd60c76885f261dbb7`; diff from reviewed commit was empty. Tracked tree clean; workspace file remained untracked. PR #2 was draft at `451b6b5`; main was `aeab1c8`.
- **Branch / review / commit reference:** `docs/phase-0-foundation`, [draft PR #1](https://github.com/Dizzledist/dizzle-business-suite/pull/1); sign-off commit subject `docs: record joint Phase 0 sign-off and assignments`.
- **Approved policies:** R01 scoped rep-role/additional-grant access; R02 hold unverifiable new releases and preserve existing jobs with stale-review flags; R03 record documented approved terms/reason, holding missing/disputed terms for explicit approval. Approved acceptance specifications: A26-A30 at the reviewed commit. Wording/behavior is unchanged; only sign-off status and assignments are recorded.
- **Assignments:** Merge operator **Cheddr (Marketing / Admin)**; Phase 1 lead **Cheddr (Marketing / Admin)**. Deployment operator and terms-dispute approver remain open. These assignments supersede the historical unassigned entries above.
- **Documents/contracts:** DECISIONS holds the dated approval source/revision/participants; status and conventions reflect assigned roles. C1/C5, permissions and acceptance references change from pending to approved, without approving all other proposed implementation details. Prior handoff entries remain historical evidence.
- **Schema/environment/runtime:** None. Acceptance specifications are approved, not executed tests. Zoho mappings, payment/credit semantics, freshness/ordering and stock behavior remain unverified/open.
- **External scope:** Read PR metadata and fetched Git state; commit/push the sign-off record only to PR #1. Both PRs stay draft; no main/PR #2 push, merge, app scaffolding, deployment, integration write or external message send.
- **Checks:** All 46 relative links across nine Markdown documents resolved; whitespace check passed. Approved R01-R03 wording exactly matches the reviewed revision, and A26-A30 are unchanged apart from sign-off labels. The seven-file diff was reviewed for sign-off/assignment changes only; staged scope/whitespace are checked before commit. Published commit and PR state verification are reported in the final response. No runtime tests were run or claimed.
- **Next: Cheddr:** Handle merge as a separate step; plan a separately authorized Phase 1 task as designated lead. Scaffolding remains on hold.
- **Next: Dizzle Sales Manager:** Carry approved account/release/acceptance behavior into sales/owner fixture requirements; coordinate remaining shared technical choices with Cheddr.

## Session 2026-11-06 / Cheddr with Codex: Phase 1 local workflow

- **Task / active lead:** Cheddr (Marketing / Admin); implement the explicitly authorized local workflow/app shell, not the entire production foundation. User request supersedes the historical scaffolding hold for this task only.
- **Starting Git:** Fetched origin/main at `19662f7cd731a64828801d52e825d5406be98633`, verified required Phase 0 merge ancestry, created `feat/phase-1-local-workflow`. Tracked tree clean; workspace file untracked and preserved. PR #2 stays a separate draft; no Assets proposal work is included.
- **Branch / commit reference:** `feat/phase-1-local-workflow`; implementation commit subject `feat: demonstrate local invoice-to-warehouse workflow`. Draft PR link/publication outcome follows when available.
- **Modules/contracts:** React shell, shared UI types, loopback HTTP API, fixture adapter, authorization/release domain, in-memory original audit and job uniqueness, HTTP/browser tests, PR CI. C1-C5 mapping and concrete warehouse projection documented for both builders; approved R01-R03 unchanged.
- **What works:** Assigned rep scope, manager/owner/admin terms release with documented terms + reason, full verified fixture payment auto-release, event replay/older snapshots and distinct-key release idempotency, later partial/full payments on same job/audit, stale/unverified/mapping holds and existing-job review flags, disabled/revoked/cross-organization denial. Warehouse sees released operational jobs only.
- **Checks:** `npm run check` passed: typecheck, 31 HTTP tests, build, 2 Chromium browser tests. Desktop/mobile screenshots visually inspected. No lint tool configured. Initial CSS import/Host-test transport/browser-server orchestration failures were fixed and final checks pass. Documentation links/whitespace and staged scope checked before publication.
- **Acceptance coverage/gaps:** See LOCAL_DEMO's matrix. Covers A02-A11, in-process portion of A12, A13-A14, selected safeguards from A15-A18, active-job A26-A27, API portion of A28, A29 and terms-hold A30. No claim of full source mirror, durable crash recovery, archives, files/search/AI, reassignment workflow, shipping/notifications, migration or live Zoho verification.
- **Schema/environment:** No database/migrations/secrets. Node 24, npm lockfile, local API port 3001 and web port 5173. NODE_ENV=production rejects API startup. Playwright sets CI=true for its Vite child; no credential values or provider environment required.
- **External actions:** Downloaded npm dependencies/Chromium for local checks; task authorizes push of task branch and draft PR only. No merge/main push, live provider calls, stock/payment writes, deployment or customer communication.
- **Open questions:** Q01-Q04 remain open. Five-minute freshness, ordered USD payment snapshots, in-memory uniqueness and server-defined identity selection are local assumptions, not production contracts. Terms-dispute approver/UI and durable identity/file/worker foundations remain future decisions.
- **Next: Cheddr:** Review demo with sales manager, then select a scoped real identity/persistence foundation task with one active lead. Keep infrastructure/live connectors separately authorized.
- **Next: Dizzle Sales Manager:** Reproduce rep isolation and invoice/terms/audit cases; refine company/store assignment fixtures and sales/owner data needs before dashboards.
- **Next shared step:** Review local API/C1-C5 mapping and remaining choices; keep PR #2 draft and reconcile its Assets proposal independently.

## Session 2026-11-06 / Phase 1 publication outcome

- **Commit / review:** Implementation `3439260` on `feat/phase-1-local-workflow`; [draft PR #3](https://github.com/Dizzledist/dizzle-business-suite/pull/3) targets main. This publication note is a follow-up documentation commit in the same PR.
- **Final local validation:** Clean `npm ci` and `npm run check` passed: typecheck, 31 HTTP integration tests, build and 2 Chromium browser tests. All 51 relative links across 10 Markdown documents resolved; diff/staged whitespace checks passed. Runtime code unchanged after the passing checks. Coverage gaps and exact reproduction commands are in LOCAL_DEMO; no live Zoho acceptance is claimed.
- **Preservation / external actions:** Pushed only the task branch and created the draft PR. PR #2 verified open/draft/unmerged with unchanged head `451b6b5`; main remains `19662f7`. Workspace file remains untracked with original SHA-256 `4F888FE1084D2A9091583D5093693D81453C0B8D06DFD6192B096972BAE551D4`. No merge/deployment/provider write/send occurred.
- **Handoff:** Both builders can run `npm ci` then `npm run dev`; stop the demo before Playwright checks. Cheddr reviews local identity/persistence next-task scope with sales manager; sales manager validates assigned account/terms/payment/audit fixtures. Keep remaining provider, production identity, durable storage and wider acceptance work explicit; keep PR #2 separate.

## Session 2026-11-06 / Cheddr with Codex: PR #3 review follow-up

- **Task / active lead:** Cheddr with Codex; address only the two non-blocking Phase 1 review findings. No production authentication, persistence, live sync or runtime API behavior changes.
- **Verified starting state:** Current branch `feat/phase-1-local-workflow`, local/fetched head and GitHub PR #3 head all `3bb181dc33f749c953fa8c0f3bffb46216ec9d29`, equal to the reviewed commit. Intervening diff empty; tracked tree clean; no overlapping changes. PR #3 remains draft against main.
- **Changes / contracts:** LOCAL_DEMO narrows A11 coverage to tested denial responses/no-job behavior and explicitly states safe denial audit is unimplemented. Added a Chromium automatic-payment regression, using reset fixtures, with no manual release: fresh unpaid invoice/no job -> verified full payment -> exactly one warehouse-view job -> replay preserves job ID and complete original audit. Manager API projection is used to inspect the audit because warehouse role intentionally cannot read it. Shared business contracts and runtime API code unchanged.
- **Checks:** `npm run check` passed: typecheck, 31 HTTP tests, build and 3 Chromium tests. All 51 relative links across 10 Markdown documents resolved; whitespace check passed. GitHub Actions on the new pushed head must be verified and reported in the final response. No separate lint tool configured.
- **Branch / commit reference:** Existing `feat/phase-1-local-workflow`, [draft PR #3](https://github.com/Dizzledist/dizzle-business-suite/pull/3); commit subject `test: cover automatic payment release and clarify denial coverage`.
- **Schema/environment:** None. Existing loopback/in-memory fixture setup unchanged. No production services, credentials or integrations introduced.
- **External actions / preservation:** Task authorizes push to PR #3 branch only. Main stays at `19662f7`; PR #2 stays draft at `451b6b5`. Workspace file stays untracked with original SHA-256 `4F888FE1084D2A9091583D5093693D81453C0B8D06DFD6192B096972BAE551D4`. No merge, deployment, provider write or external send.
- **Next: Cheddr and Dizzle Sales Manager:** Jointly demo fresh full-payment auto-release/replay, terms release followed by partial/full payment, stale flags and rep/warehouse scopes. Keep PR #3 draft for explicit sign-off; remaining real auth, storage, live Zoho and safe denial audit remain deferred/unimplemented.

## Template for the next session

```markdown
## Session YYYY-MM-DD / builder
Task / issue and active lead:
Starting branch, working tree and fetched base:
Branch / commit or stable Git reference / review link:
What changed:
Modules and shared contracts affected / reviewers needed:
Checks run and results:
Schema/environment changes (names only):
External actions actually performed:
Known failures / unfinished work:
Decisions or blockers:
Next task: sales manager:
Next task: user / marketing lead:
Next safe shared foundation step:
```

## Session 2026-11-07 / Codex: Sales CRM foundation

- **Task and lead:** User's Master Prompt #3 authorizes the first local Sales CRM shell. Codex implemented this scoped task for the user. Both builders review the identity boundary and sales navigation before integration.
- **Starting state and stable reference:** Fresh clean clone of origin/main at `d4afc223d7313274ecea75f3655d2188abbbbbd6`. Local branch `feature/sales-crm-foundation`. Review takes place on the local branch.
- **Changes and contracts:** Added /sales and eight subroutes with responsive navigation, placeholders, and a reusable dashboard card. Added read-only GET /api/sales-crm/workspace with server flag and CRM-only access checks after existing fixture authentication. Legacy request/response contracts and C1–C5 business policy are preserved. The browser carries the existing fixture selector ID across CRM links in the current tab. See the [local CRM guide](SALES_CRM_FOUNDATION.md).
- **Checks:** Node 24 baseline passed typecheck, build, 31 HTTP tests and three Chromium tests. Branch passed typecheck, build, 46 HTTP tests, four Chromium tests with the flag unset and seven with it enabled. Both browser runs used isolated loopback ports to avoid the existing demo and included the three original workflow tests. Lint is unconfigured.
- **Schema and environment:** No schema changes. New opt-in flag name is SALES_CRM_ENABLED. Existing default dependencies and environment setup were reused.
- **External actions:** Read and cloned GitHub main, installed the locked local packages and the pinned Chromium test binary, and ran isolated tests. The branch is local. Provider accounts and data were outside the execution scope.
- **Incomplete work:** Shared builder and user review. The local selector remains a fixture mechanism. Customer data, real sessions, persistent records, finance, AI, maps and live connectors are later work.
- **Next:** Sales manager reviews navigation and pending states. The user and both builders review the CRM-only scope and approve shared customer access before the durable account/reassignment slice. Update the approved policy and acceptance matrix through that later task.

## Session 2026-11-07 / Codex: Zoho Inventory reporting preparation

- **Task and lead:** Master Prompt #4 authorized a read-only invoice adapter and synthetic verification. Codex performed this isolated slice. Both builders review the reporting boundary with the sales manager and finance.
- **Starting state and stable reference:** Clean local CRM foundation at `ebfe961baca29be770b7157ec268079f2c63d8ce`. Created local branch `feature/sales-crm-zoho-reporting` in a separate checkout. Existing localhost remained on the foundation checkout.
- **Changes and contracts:** CRM-only Zoho reads and in-memory reconciliation are exercised through a mocked server transport. The dashboard links to status explaining the evidence gate. There are no new data routes or changes to C1–C5, API payloads, or legacy workflow behavior. See the [Zoho reporting guide](SALES_CRM_ZOHO_REPORTING.md).
- **Checks:** Baseline passed typecheck, build, 46 Vitest tests and four disabled/seven enabled Chromium tests. Branch passed typecheck, build, 76 Vitest tests and four disabled/eight enabled Chromium tests. Browser harness used separate loopback ports. Lint is unconfigured.
- **Schema and environment:** No schema changes, dependency changes, or new runtime configuration. SALES_CRM_ENABLED continues to guard the local CRM.
- **External actions:** Read public Zoho docs. Installed the existing lockfile from local cache and ran tests with synthetic data. Work is local.
- **Decision and next task:** M5 remains blocked. Validate first-success evidence, revisions and supported history in a separately approved sandbox. Confirm the timezone, credit mapping and adjustment policy before durable reporting or live reads.

## Session 2026-11-07 / Codex: Zoho Inventory read-only OAuth

- **Task and lead:** Prompt #5 authorized a secure local backend with mocked verification. Codex performed the scoped work. Shared security and sales review precede live activation.
- **Starting reference:** Clean reporting branch at `9c336ea9395b49ebd736589e1c1d639848ef30af`. Isolated checkout on `feature/zoho-readonly-integration`. Running localhost remains on the foundation checkout.
- **Changes:** OAuth code exchange and refresh, local operator authorization, secure refresh store, fixed organization and GET allowlist, and an explicitly initiated one-record-per-resource sample. CRM settings stay fixture-only. Existing C1–C5 behavior is preserved. See the [setup guide](ZOHO_READONLY_OAUTH.md).
- **Checks:** Baseline passed 76 Vitest tests, typecheck, build and Chromium four disabled/eight enabled. Branch passed 106 Vitest tests, typecheck, build and the same Chromium counts on isolated ports. Lint is unconfigured.
- **Schema and environment:** No migrations or dependency changes. Example configuration documents SALES_CRM_ENABLED, ZOHO_ENABLED, ZOHO_ORGANIZATION_ID, ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET, ZOHO_REDIRECT_URI, ZOHO_ACCOUNTS_URL, ZOHO_API_BASE_URL, ZOHO_LOCAL_ADMIN_KEY, ZOHO_TOKEN_ENCRYPTION_KEY and ZOHO_TOKEN_STORE_PATH.
- **External actions:** Read official public documentation and ran synthetic tests. No live grants, reads, or writes were executed.
- **Next:** Owner rotates the exposed credential and confirms Console region and redirect. Run the separately approved limited connection test. Sales manager reviews existing historical email evidence before authorizing financial reports.

## Session 2026-11-07 / Codex: Durable Sales CRM reporting preview

- **Task and lead** · Codex implemented the scoped local reporting module from Prompt #7 and its calendar addendum. Sales manager, owner and the shared foundation reviewer own business acceptance.
- **Git reference** · feature/sales-crm-reporting, based on approved OAuth commit 8769fec. The feature worktree isolates this scope from the original running Zoho checkout.
- **Contracts and schema** · Versioned synthetic SQLite migration, organization-scoped invoice mirror, rep mapping, sync state and queue. Browser reporting reads fixture data through the existing local identity mechanism. The status endpoint reuses the private Zoho operator gate. See the [reporting guide](SALES_CRM_REPORTING.md).
- **Checks** · TypeScript, build, 171 Vitest tests, Chromium 4 disabled and 9 enabled, including the original warehouse suite in each mode. Chromium used isolated loopback ports. Lint is unconfigured.
- **External actions** · Consulted official Zoho documentation. Development used synthetic data and mocked provider transport. Live import, invoice history, GitHub publication and deployment are separate actions.
- **Open work** · Approve genuine authentication and production database migration. Separately authorize a restricted invoice history verification against known sends and original revisions. Confirm settlement exceptions, attribution and business timezone, then reconcile a bounded import before enabling live reports. M5 remains blocked.

## Session 2026-11-07 / Codex: Sales CRM authentication foundation

- **Task and lead** · Codex implemented Prompt #8 as an additive local CRM capability. The owner/admin and shared foundation reviewer own provider and production acceptance.
- **Git reference** · feature/sales-crm-authentication in its own worktree, based on approved reporting commit 03e0fed. The prior worktrees continue to serve their separate local previews.
- **Contracts and schema** · Separate versioned SQLite identity store, secure session cookies and revocation, organization and team scoping, audited internal user and mapping commands, and a read-only admin directory. The previously restricted Zoho operator boundary is unchanged. [Authentication guide](SALES_CRM_AUTHENTICATION.md)
- **Checks** · Baseline typecheck, build, 171 Vitest and 13 Chromium checks. Final typecheck, build, 188 Vitest and 20 Chromium checks across three modes. The production bundle excludes the fixture selector and client identity header code. No lint script exists.
- **External actions** · Consulted official OIDC and security guidance. Synthetic test identities exercised the verified-principal boundary. No identity provider was provisioned or contacted and no live financial data was read.
- **Open work** · Approve an identity provider and review the production database and origin configuration. Implement and validate a server-side OIDC adapter with genuine employee sessions in staging. M1 remains in progress and M5 remains blocked.

## Session 2026-11-08 / Codex: Company email and password sign-in

- **Task and lead** · Codex implemented the corrective local password workflow. The owner/admin retains control of first-administrator enrollment and acceptance.
- **Git reference** · feature/sales-crm-email-password in a separate worktree at base 680e432. Verified ancestry includes reporting 03e0fed and Zoho 8769fec. Google commit ac9d842 and its disabled preview were preserved.
- **Contracts and schema** · Additive local password credentials and one-time actions within the existing user and session store. Admin-only enrollment, reset codes, role and session management. Reused bounded request parsing and exact-origin proxy behavior from the separate Google branch. [Setup guide](SALES_CRM_EMAIL_PASSWORD.md)
- **Checks** · Baseline typecheck, build and 188 Vitest tests. Final typecheck, build, 202 Vitest and 25 Chromium checks across four modes. The production dependency audit reported zero vulnerabilities. Lint is unconfigured.
- **External actions** · Installed the pinned Argon2 dependency and checked the npm advisory feed. The pilot uses synthetic reports and an empty employee directory. Google remains disabled, and the original Zoho operator status remains read-only.
- **Open work** · Establish the first administrator and verify the local employee pilot. Approve any future email delivery service and production hosting and migration. M1 remains in progress and M5 remains blocked for live reporting.

## Session 2026-11-08 / Codex: Sales CRM invoice details

- **Task and lead** · Codex implemented Prompt #9 using synthetic data and a separate worktree. Sales and shared identity/integration owners review the reporting rules and access checks.
- **Git reference** · `feature/sales-crm-invoice-details` based on the clean password branch at `a0455ed`. The existing password worktree and administrator were preserved.
- **Contracts and schema** · Additive reporting migration 002, normalized current and original line snapshots, initial coverage, scoped product results and protected PDF response. Configuration adds `INITIAL_SALES_RECOGNITION_DATE`. [Invoice details guide](SALES_CRM_INVOICE_DETAILS.md)
- **Checks** · TypeScript and build passed, with 218 Vitest tests and 27 Chromium checks across four isolated modes. The synthetic PDF was rendered and inspected. Lint is unconfigured.
- **External actions** · Consulted official Zoho documentation and attempted read-only access to Dizzle Management source. The connector returned 404 and local GitHub authentication was invalid. No live Zoho requests, financial imports or publication ran.
- **Open work** · Owner and sales manager select independently documented invoice cases and review the proposed bounded read. Shared foundation review must approve the real tenant binding and original invoice revision evidence. M5 remains blocked for live reporting.

## Session 2026-11-08 / Codex: Sales CRM Management parity

- **Task and lead** · Codex implemented the revised Prompt #10 on `feature/sales-crm-management-parity` from `42006fb`. Sales and shared reporting owners review the reconciliation evidence.
- **Source access** · The owner made Management accessible during the session. Reviewed a local clone at `f8da43c` with no changes to the reference checkout or deployment. [Source audit](SALES_CRM_MANAGEMENT_PARITY.md)
- **Changes** · Invoice name fallback, reusable synthetic cost and profit formulas, and a pinned fixture runner comparing the original implementation with Business Suite. No new API or database schema is needed.
- **Checks** · TypeScript, build, 224 Vitest and 27 Chromium checks passed, including six new parity cases. The reference capture uses a fake provider and database.
- **Open work** · Sales verifies first-send evidence and original invoice values. Shared integration review approves the tenant binding and the cost source, currency and effective-date rules before live reporting. Samples integration stays deferred.

## Session 2026-11-12 / Codex: Revenue reconciliation preparation

- **Task and lead** · Codex completed the synthetic implementation authorized by Prompt #11. Sales/accounting and shared identity owners review evidence and tenant policy.
- **Git reference** · `feature/sales-crm-revenue-reconciliation`, exact parent `a81ddaed3e838e0a03256578b8faae3650d1e6b8`; commit subject `Prepare synthetic revenue reconciliation and tenant binding`. No remote branch or PR was created.
- **Compatibility** · Fetched main `928a45c`; parity-only 8 / main-only 17. Reviewed Marketing routing, shared Google sessions/grants/schema, developer tooling and the dry-run Sales adoption plan. Applied no main changes and retained password login.
- **Changes and contracts** · Independent evidence checks/history, immutable original normalized snapshots, administrator-only synthetic comparison, constrained inactive provider binding and a pure seven-read proposal. [Full report](SALES_CRM_REVENUE_RECONCILIATION.md)
- **Checks** · TypeScript and build passed, 263 Vitest tests across 17 files, 28 Chromium checks across four isolated modes. The original Management 414 / CRM 300 fixture result is retained. Final password browser mode passed after the currency display update. No lint script exists.
- **Schema/configuration** · Reporting migration 003 adds evidence/snapshots/history. Identity migration 003 adds the binding table. Optional names `SALES_ZOHO_TENANT_ID`, `SALES_ZOHO_APPROVAL_REFERENCE` are documented and unset. Only disposable test databases were migrated.
- **External actions** · Fetched Git heads and read official documentation. No Zoho requests, actual PDF retrieval, employee credential change, import, binding activation, push, merge or deployment. Existing worktrees, encrypted grant and administrator store preserved.
- **Blockers** · Provider first-success/retention/timezone semantics and historical amounts/lines remain unverified. Real tenant membership, retention and the capped diagnostic runner need review. Financial sync stays off.
- **Next: sales/accounting** · Select three existing invoice IDs with known first-send/resend/edit evidence and separately approve the seven GET attempts.
- **Next: shared identity/Marketing lead** · Review documented cookie, schema, domain-grant and routing differences together before any branch integration. Do not replace the approved Sales login.
- **Next safe shared step** · After approval, implement and mock-test a capped private operator runner, then perform only approved reads. Preserve all remaining activation gates.

## Session 2026-11-12 / Codex: Controlled Zoho verification

- **Task and lead** · Codex executed the user's Prompt #12A diagnostic after separate lookup and six-read approvals. Starting runtime reference `844e779`; same reconciliation worktree.
- **External actions** · Exactly seven Inventory GET attempts succeeded: one scoped exact-number lookup and three selected detail/history pairs. Two permitted Accounts refreshes succeeded. No retry, pagination, Inventory write, PDF/payment read, import or reporting activation. The revised plan omitted organization listing with explicit user approval.
- **Evidence result** · Three pending send-date assessments and three original-amount assessments unavailable in tested evidence. Selected records did not establish the intended October/resend/financial-edit cases. Local history times, minute precision, archival coverage and original revisions require corroboration. [Sanitized checkpoint](ZOHO_CONTROLLED_VERIFICATION.md)
- **Privacy/preservation** · Exact IDs, financial observations, event references and diagnostic scripts remain in restricted private operator storage outside Git. No live customer data is committed. Original private configuration/grant digests matched. Read-only account checks found one active password administrator and no approved live binding. No production/database/other-worktree changes.
- **Checks** · Preparation TypeScript and 263 Vitest passed. Across diagnostic phases, 43 mock checks and all seven live GETs passed. Prompt #11 build/28 Chromium results were not rerun during this operational task. Runtime source remains unchanged.
- **Git** · Documentation-only local checkpoint on `feature/sales-crm-revenue-reconciliation`; no push, merge or deployment.
- **Next safe task** · Separately approve independent mail/audit/original-copy corroboration and genuine October/resend/edit examples. Review timezone/precision, first-success semantics, original amounts/lines/credit and live tenant membership before import. The current API budget is exhausted; M5 remains blocked.

## Session 2026-11-12 / Codex: Historical evidence and operational Sales foundation

- **Task / lead** · Codex completed the user's Prompt #12 in a separate worktree, feature/sales-crm-historical-evidence, based on 9658353 with 844e779 in ancestry. Stable local commit subject: "Prepare historical evidence and separate operational reporting". No remote branch or PR created.
- **Implementation** · Independent source-clock/DST interpretation; private synthetic artifact registration and separate field-review history; feature-flagged administrator dashboard modes; pure prospective-capture gate. Reuses existing reporting database, identity/session/CSRF, calendar, Management eligibility and protected PDF delivery. [Full guide](SALES_CRM_HISTORICAL_EVIDENCE.md)
- **Contracts** · shared/historical-evidence.ts and the new methods/evidence APIs are documented in CONTRACTS. New endpoints reject non-administrators, wrong tenants, source switching and forged identities. Reviews do not promote financial recognition. Original Reports/dashboard graph, frozen originals, credit and official commissions are preserved.
- **Schema/configuration** · Reporting migration 004 adds private synthetic documents/reviews. Identity schema is unchanged. SALES_HISTORICAL_EVIDENCE_ENABLED is false by default; no real environment was changed. Only disposable stores were migrated.
- **Evidence findings** · Earlier tested send dates remain pending and original amounts unavailable in those responses. Source-history timezone, October/resend evidence, retained archives and original financial revisions remain unverified. Management f8da43c stores current invoice values by upsert; source audit establishes no immutable first-sent invoice-history contract. Production databases were not queried.
- **Checks** · TypeScript and production build passed; 314 Vitest checks across 18 files passed. Chromium passed 4 disabled + 9 fixture + 7 session + 8 password + 10 opt-in historical checks = 38. The new browser locator was corrected after an initial mismatch. A session-mode setup interruption was resolved with the required fresh fixture database name; final modes passed. No lint script exists. Management 4 / USD 414 vs Verified 3 / USD 300 remains intact. Documentation links, diff whitespace and scoped secret/artifact checks are reviewed before commit.
- **External actions** · Public documentation research and read-only local Management source inspection only. Zero additional live Inventory/Accounts/mail requests, no import, source writes, real document retrieval, bindings, push, merge or deployment. Prior worktrees, Zoho grant and real administrator account were not modified. Test servers used isolated loopback ports and synthetic stores.
- **Blockers** · Independently corroborated first successful send/timezone, original amount/lines/credit, canonical real-tenant membership and production document retention/storage must be established before live recognition/import. Live reporting remains blocked.
- **Next: sales/accounting** · Review one independently known October original send with its original revision/attachment and corroborated acceptance/timezone, using a separately approved private evidence scope.
- **Next: shared identity reviewer** · Review canonical non-demo membership/binding policy while preserving existing access. Do not bind demo-o1 to organization 821729823.
- **Next safe shared step** · Review the documented single organization-timezone GET proposal and archive options. Approve exact new evidence reads only if useful. Neither historical import design nor prospective external capture is activated.
