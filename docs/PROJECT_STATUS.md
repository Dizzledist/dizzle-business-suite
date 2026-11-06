# Project status

Updated: November 6, 2026 (America/Los_Angeles).

## Current task and verified base

Cheddr and Dizzle Sales Manager approved Phase 1 at `dac677db9a76d43118717a68d543e81cc3c777fe`. PR #3 targeted main, exact-head GitHub Actions passed, GitHub reported clean mergeability and allowed merge commits. Marked ready and merged as **d4afc223d7313274ecea75f3655d2188abbbbbd6**. Verified app, demo guide and CI workflow on origin/main matched the approved head.

The subsequent user request authorizes the Warehouse Fulfillment Kanban. Created **feat/warehouse-fulfillment-kanban** from fetched origin/main at that merge. Active lead: Cheddr (Marketing / Admin) with Codex. Main stays unchanged after the authorized Phase 1 merge; PR #2 remains draft and separate. Workspace file remains untracked/excluded.

Published as [draft PR #4](https://github.com/Dizzledist/dizzle-business-suite/pull/4) against main. Implementation commit `caa4e69`; this publication note follows on the same branch. Local checks passed; GitHub Actions results are tracked on that PR separately from local evidence.

## Implemented local warehouse slice

- Existing Phase 1 release path still creates exactly one Orders job from verified full payment or authorized terms/reason; payment replay and later payment preserve existing job/status/release audit.
- Dark Orders, Partially Shipped, Shipped and Dropoff/Pickup columns, scoped counts/search and shipping type/priority/inclusive Pacific created-date filters.
- Cards expose customer, invoice, assigned rep, shipping type, priority, notes, timestamps, items and documents. Sales reads respect current account/organization scope.
- Authenticated sample packing slip PDF plus print preview/action; explicitly separate from invoice PDF and labeled generic/non-job-specific. ReportLab output visually checked with Poppler.
- Warehouse-role + move-grant checks in API; drag/button Shipped popup requires tracking, Cancel does not mutate. Stale source/card revisions hold new moves.
- Shipment/status saved before in-memory outbox and local Slack adapter. Alert includes rep/customer/invoice/tracking; semantic retries/different keys preserve one shipment/capture. Failure retains saved shipment and exposes explicit retry.
- Pickup routing to awaiting-pickup is supported; Partially Shipped is visible/read-only. Partial quantities, pickup completion, corrections and per-job documents remain gaps.

## Validation and limits

Local checks cover **49 HTTP tests**, **5 Chromium tests**, typecheck and build. Browser evidence includes actual PDF opening, print media/content/function invocation (not physical printer output), cancellation, tracking, alert capture/failure/retry, denied rep move and filters. Final command/link/whitespace outcomes and PR publication are recorded in the handoff/final response.

Regular demo: 5173/3001. Playwright uses isolated 5273/3101 so an existing demo need not be stopped. Both API instances bind loopback; LOCAL_API_PORT/LOCAL_WEB_PORT are optional local test configuration. State/outbox/captures reset on restart; this is not durable storage or production authentication.

See [warehouse guide](WAREHOUSE_DEMO.md) and [Phase 1 guide](LOCAL_DEMO.md) for exact routes, demo steps, transitions and acceptance gaps. Safe denial audit remains unimplemented; tested denials do not imply full A11 completion. No live Slack, label purchasing, Zoho stock changes, deployment or customer sends. Q01-Q04 provider behavior and production architecture remain open.

## Next tasks

| Builder | Next safe step |
|---|---|
| Cheddr / merge operator | Review the local Kanban/permission/outbox extension with sales manager; select a separate partial-shipment/pickup-completion or durable identity/storage task after deciding scope |
| Dizzle Sales Manager | Verify read-only assigned-account cards/tracking and rep alert content; validate fixture metadata and document distinctions |
| Both builders | Review local warehouse transition table and gaps. Keep PR #2's Assets proposal separate; do not infer live integration/stock/label authority from this demo |

Replit remains operational. This local branch does not replace any production writer.
