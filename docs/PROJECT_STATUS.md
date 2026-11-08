# Project status

Updated: November 8, 2026 (America/Los_Angeles).

## Sales CRM Management parity · November 8

The revised Prompt #10 was implemented on **feature/sales-crm-management-parity**, based on invoice details commit `42006fb`. The [source audit and parity report](SALES_CRM_MANAGEMENT_PARITY.md) pins Dizzle Management to `f8da43c`.

- Reused the invoice line name fallback in the CRM and extracted Management cost matching and weighted profit formulas for synthetic comparison. The fixture tests preserve the differences in invoice dates, eligibility and final totals versus original subtotals.
- TypeScript, the build, 224 Vitest tests and 27 Chromium checks passed. The audit used local source and simulated provider and database responses.
- **M5 remains blocked for live reporting.** First-send evidence, original invoice revisions, tenant binding and cost catalog approval remain open. Samples integration is deferred.

## Sales CRM invoice details · November 8

Prompt #9 adds invoice detail and product reporting on **feature/sales-crm-invoice-details**, based on password commit `a0455ed`. The [invoice details guide](SALES_CRM_INVOICE_DETAILS.md) documents the October baseline, structured snapshots, protected synthetic PDF, Management source access limit and next bounded test.

- The report surfaces incomplete historical coverage and keeps Month to Date as its default. Current line snapshots and original sales attribution are stored separately.
- Employee password sessions and existing invoice scope gate the PDF and product routes. CRM tenant `demo-o1` has no binding to external Zoho organization `821729823`.
- **M5 remains blocked for live reporting.** First-success history, original invoice revisions and the approved live tenant binding still require verification. Profit and samples remain deferred. No production milestone credit was added.

## Sales CRM email and password sign-in · November 8

The corrective prompt authorizes company email and password sign-in on **feature/sales-crm-email-password**, based on authentication commit 680e432. Google OIDC is deferred on its separate branch at ac9d842. See the [local password guide](SALES_CRM_EMAIL_PASSWORD.md).

- The existing CRM identity database and session boundary now support Argon2id credentials, administrator-approved enrollment, single-use setup and reset codes, password changes, and session revocation. The employee directory shows pending reset requests and credential status.
- TypeScript, the build, 202 Vitest tests, and Chromium counts of 4 disabled, 9 fixture CRM, 7 session-only, and 5 password checks passed. The npm production dependency audit reported zero vulnerabilities. The production bundle excludes fixture identity and synthetic accounts.
- **M1 remains in progress.** The local pilot requires first-administrator setup and real employee acceptance. Reset and setup codes support manual handoff; automated email delivery is pending. Browser reporting remains synthetic and the original Zoho operator service stays read-only.

## Sales CRM authentication foundation · November 7

Prompt #8 authorizes the session, identity, and permissions foundation on **feature/sales-crm-authentication**, based on reporting commit 03e0fed with read-only Zoho commit 8769fec in its history. See the [authentication guide](SALES_CRM_AUTHENTICATION.md).

- Session-only CRM mode uses verified-principal bindings, durable user/session records, rep and team scope, a read-only administrator directory, and audited internal role and mapping operations. The existing demo and Zoho operator flows remain separate.
- The approved baseline passed TypeScript, build, 171 Vitest tests and 13 Chromium checks. This branch passed TypeScript, build, 188 Vitest tests and Chromium counts of 4 disabled, 9 fixture CRM and 7 session-only checks on isolated ports. The production bundle excludes fixture identity code.
- **M1 is in progress.** Company sign-in awaits provider approval, adapter and staging validation. M5 still requires accepted identity, first-email evidence and production reconciliation. Browser reporting uses synthetic data.

## Sales CRM reporting preview · November 7

Prompt #7 and its calendar addendum authorize durable synthetic invoice reporting on **feature/sales-crm-reporting**, based on approved OAuth commit 8769fec. The preceding bounded live verification confirmed the organization and refresh grant. This reporting phase uses synthetic data and mocked Zoho reads. See the [reporting guide](SALES_CRM_REPORTING.md).

- Tested SQLite persistence, exact per-currency amounts, first-email evidence states, historical credit, bounded initial sync, incremental replay, retry recovery, and scoped reporting APIs.
- Dashboard and invoice reports share 14 date choices, default Month to Date, and retain their range across drill-down. The operator endpoint reports the existing OAuth status alongside synthetic sync counts when locally configured.
- TypeScript, build, and 171 Vitest tests passed. Chromium passed 4 tests with Sales CRM disabled and 9 enabled on isolated loopback ports, including the original warehouse workflows in both modes. Lint is unconfigured.
- **M5 remains blocked.** First-success history and original invoice revisions need approved verification. Live browser data requires trusted authentication and production authorization. The local preview earns no production milestone credit.

## Zoho Inventory read-only OAuth · November 7

Prompt #5 adds a mock-verified local OAuth backend on **feature/zoho-readonly-integration**, based on clean reporting commit `9c336ea`. See the [local setup and security guide](ZOHO_READONLY_OAUTH.md).

- Fixed four read scopes, the organization boundary, server-side state and PKCE, encrypted refresh-grant storage, and a GET-only Inventory allowlist. Admin management uses the existing fixture role plus a separate local operator key. Live credentials and authorization are pending explicit approval.
- Default app routes, CRM UI and invoice-to-warehouse behavior are preserved. The default server does not contact Zoho. A bounded sample is available as a separately initiated local admin command.
- Baseline passed 76 Vitest tests, typecheck, build, and Chromium counts of four disabled and eight enabled. The branch passed 106 Vitest tests, typecheck, build, and the same Chromium counts. Lint is unconfigured. No live OAuth or data reads ran.
- Next steps are to rotate the exposed client secret, confirm the Console region and callback, and approve the limited connection and sample. M5 remains blocked on historical first-email evidence.

## Zoho Inventory sales reporting · November 7

Master Prompt #4 authorizes read-only preparation on **feature/sales-crm-zoho-reporting**, based on clean CRM foundation commit `ebfe961`. **M5 is blocked on verified first-email evidence.** The [Zoho reporting guide](SALES_CRM_ZOHO_REPORTING.md) records the evidence gap, scope, tested checklist, and sandbox plan.

- Added a server-side invoice reader with mocked transport, normalized source snapshots, and bounded reconciliation. No live credentials, sync job, storage migration, or reporting data endpoint is wired. Current source salesperson remains distinct from historical credit.
- CRM cards link to the invoice reporting status and keep values unavailable. Existing fulfillment, role meanings, API contracts and feature-flag enforcement are preserved.
- Pre-change typecheck, build, 46 Vitest tests and Chromium passes of four disabled and seven enabled tests succeeded. Branch checks passed with 76 Vitest tests, four disabled and eight enabled Chromium tests, plus typecheck and build. Both browser modes included the original workflow tests. Lint is unconfigured.
- Next gate is restricted sandbox verification of supported send paths and historical coverage. Owners must approve reporting timezone, original revision attribution and settlement before connecting authorized persistent data.

## Sales CRM foundation · November 7

Master Prompt #3 authorizes the local navigation and dashboard shell. The dedicated branch is **feature/sales-crm-foundation**, based on the clean main checkout at `d4afc223`. Status is **in progress, ready for shared review**. See the [local CRM guide](SALES_CRM_FOUNDATION.md) and [handoff](HANDOFF.md#session-2026-11-07--codex-sales-crm-foundation).

- Added a disabled-by-default development flag, a scoped read-only shell endpoint, and nine responsive Sales CRM routes. The workspace shows placeholders and unconfigured source states. Access reuses the existing fixture identity and read checks, with a CRM-only sales-role and organization allowlist.
- The existing invoice-to-warehouse routes, contracts, workflow and permission definitions were preserved. The pinned baseline has in-memory fixtures and no database or live provider adapters. This task adds no migration or provider configuration.
- Baseline passed typecheck, build, 31 HTTP tests and three Chromium tests. Branch passed typecheck, build, 46 HTTP tests, four Chromium tests with the flag unset and seven with the flag enabled. Each Chromium pass included the three original workflow tests. No separate lint task exists.
- Next review is the shell access matrix and disabled behavior. Durable customer accounts and shared record permissions are the next scoped implementation task after the business access policy is approved.

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
