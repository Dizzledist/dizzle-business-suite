# Project status

Updated: November 6, 2026 (America/Los_Angeles).

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

`npm run check` passed locally on Node 24: typecheck, **31 HTTP integration tests**, build and **2 Chromium browser tests**. Desktop and mobile screenshots were visually inspected. The initial CSS import, raw Host-header test transport and Windows Playwright nested-server startup issues were resolved; final checks pass. No separate lint configuration exists.

Implemented acceptance evidence: A02-A11; in-process concurrency portion of A12; A13-A14; draft/credit/mapping safeguards from A15-A17; invoice/job scope portion of A18/A28; active-job behavior of A26-A27; A29; missing/disputed terms hold from A30. See the precise limits in [LOCAL_DEMO](LOCAL_DEMO.md). These are fixture tests, not live provider acceptance or completed production Phase 1.

## Gaps and next steps

No Google Workspace authentication, durable persistence/queue/audit, multi-process transactions, protected files/search/AI, reassignment UI, source aliases/import, invoice amendments/reversals, shipment quantities/tracking, notifications, migration, live Zoho or staging/production environment. Jobs use only Orders; no new warehouse stage was approved. Archive-specific A27 behavior and durable crash recovery are deferred. Terms-dispute resolution has no authority/UI contract yet; these invoices stay held.

Q01-Q04 remain open: actual Zoho origin/organization/data-center mapping, payment/credit semantics, event ordering/freshness and stock effects. Demo five-minute freshness and ordered source snapshots are labeled fixture assumptions.

| Builder | Next safe task |
|---|---|
| Cheddr / Phase 1 lead and merge operator | Review this local slice with sales manager; select a separate real identity/persistence foundation task with isolated tests and one shared implementation lead. Keep live connectors/infrastructure separately authorized |
| Dizzle Sales Manager | Validate sales account/invoice/terms examples, rep isolation and audit behavior in the demo; define account/store ownership cases before dashboard work |
| Both builders | Review the local C1-C5 mapping and remaining permission/terms-dispute decisions. Reconcile the separate Assets proposal in PR #2 independently |

Department dashboards, marketing studio/Assets, live integration, infrastructure, deployment and operational cutover remain future tasks. Replit remains operational; this demo does not replace any production writer.
