# Project status

Updated: November 7, 2026 (America/Los_Angeles).

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
