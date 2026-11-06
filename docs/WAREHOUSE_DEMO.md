# Local Warehouse Fulfillment Kanban

November 6, 2026. Local synthetic build following Phase 1 PR #3. No screenshot was present with the request, so the board follows the described dark layout, four named columns and filters. This is not a claim to reproduce an unavailable image exactly. Existing Phase 1 payment/release/access rules remain unchanged.

## Run and reproduce

Use Node 24; run `npm ci` and `npm run dev`, then open **http://127.0.0.1:5173**. API is on loopback port 3001. See [LOCAL_DEMO](LOCAL_DEMO.md) for test identities and financial fixtures. Data, tracking, audit and local outbox/captures all reset on API restart/watch reload or Reset demo. Nothing is persisted to disk or sent to Slack.

1. As **Sales manager**, Reset demo. Receive verified full payment for DZ-1001, or use its documented approved terms and an early-release reason. Exactly one card appears in Orders; unpaid/partial invoices remain excluded. Replaying payment does not reset an existing card's warehouse status.
2. Switch to **Warehouse**. Cards show customer, invoice, assigned rep, shipping type, priority, notes, items, created/updated timestamps (Pacific) and source reference. Search includes customer/invoice/rep/notes/tracking. Shipping type, priority and inclusive Pacific created-date filters update visible column counts. Filters operate only on API-authorized cards.
3. Expand **Documents & actions**. **View Packing Slip PDF** opens an authenticated local sample PDF in a new tab. **Print** opens a printable preview; **Print sample slip** invokes the browser print dialog. It is a generic reference sample, clearly labeled **not job-specific**, **not an invoice or shipping label**, with no financial amounts. PDF and print preview share sample metadata from `shared/sample-packing-slip.json`; job-specific document generation remains a gap. Physical printer output is outside automated checks.
4. Drag the Orders card to Shipped, or use **Move to Shipped**. The popup requires tracking from the label purchased through the existing warehouse process. **Cancel** sends no move request and leaves card, tracking and alert unchanged.
5. Submit `1ZLOCAL12345`. The API saves status Shipped, tracking, shipment ID, actor and time before creating/delivering the local alert. One Shipped card shows tracking and a **Local Slack capture · sent** preview with assigned rep, customer, invoice and tracking. The original financial release audit is preserved.
6. Reset and repeat release. Before switching to Warehouse, click **Fail next Slack alert** as manager. Complete the shipment: the card stays Shipped with tracking, and the alert shows failure. **Retry Slack alert** captures the same logical delivery once; it does not create another shipment. Repeated shipment submissions with different request keys/same tracking do not create another alert or implicitly retry a failed one.
7. Switch to **Rep A**: assigned cards/documents/tracking are read-only; move and retry controls are absent, and direct API mutations return 403. **Rep B** cannot retrieve Juniper jobs/slips. Disabled/revoked identities and cross-organization callers remain denied.
8. For pickup routing, release Cedar's DZ-1004, switch to Warehouse and choose **Move to Dropoff/Pickup**. It means **awaiting pickup**, not completed collection. No shipping alert or tracking is invented.

## Supported local transitions

| From -> to | Behavior |
|---|---|
| Eligible source -> Orders | Existing Phase 1 verified full payment or authorized terms release; never creates a second canonical job |
| Orders -> Shipped (Shipping type) | Warehouse role + active move grant, current source verification and card revision; required tracking and saved shipment, then one outbox entry |
| Orders -> Dropoff/Pickup (Pickup type) | Warehouse routing to awaiting pickup; no delivery/completion claim or shipment alert |
| Any -> Partially Shipped | Column visible, but API rejects the move. Line/package quantities, remaining work and partial-notification policy require a separate approved workflow |
| Shipped -> another state / tracking correction | Rejected; correction/returns and reversal authority are deferred. Same-tracking repeated Shipped submission returns the existing shipment without changing audit or alert |
| Dropoff/Pickup -> completed | Deferred; collection/dropoff confirmation and evidence policy not defined |

Stale/unverified/mapping-uncertain sources preserve existing cards and show review flags. New warehouse moves are held until source review is resolved. A retry of an already saved shipment's alert is permitted because it does not change physical/financial work. No new Packing stage is introduced.

Tracking validation is a local format check: 5-80 ASCII letters/digits/hyphens, starting with a letter/digit, trimmed and normalized to uppercase. It does not prove label purchase, carrier acceptance, transit or delivery. Shipping type/priority/notes and assigned rep are synthetic fixture metadata, not configured business mappings.

## API and alert contract for shared review

| Route | Local permission / effect |
|---|---|
| `GET /api/jobs/:id/packing-slip.pdf` | Released job read scope; warehouse operational access or assigned account/sales access. No public file URL or invoice PDF substitution |
| `POST /api/jobs/:id/move` | Warehouse role and `move` grant, same organization; JSON target, expectedRevision, requestKey and tracking for Shipped. Sales manager/owner/admin alone do not grant warehouse move authority |
| `POST /api/jobs/:id/alert/retry` | Same warehouse authorization; retries existing saved-shipment outbox entry. Sent entries are no-ops |
| `POST /api/demo/slack-failure` | Demo-o1 manager/owner/admin fixture control; fails the next local alert once, not a Slack configuration endpoint |

The single-process service writes shipment/status first, then an outbox record with stable ID `shipment-alert:<shipmentId>`, then calls [LocalSlackAdapter](../server/slack.ts). Failed delivery retains the saved shipment and retryable error/attempt count. The adapter deduplicates captures by alert ID. The card shows a would-be Slack message and local outcome, not a real Slack delivery receipt. No OAuth/channel setup exists.

This is an **in-memory outbox**, not durable storage or a worker guarantee. Reset/restart loses pending failures and captures. Multi-process atomicity, crash recovery, ambiguous remote delivery, real Slack rep/channel mappings and production retention remain unimplemented. Existing source invoice/payment records are unchanged by warehouse moves; no Zoho stock subtraction or writeback occurs.

## Verification and remaining scope

Run `npx playwright install chromium`, then `npm run check`. Browser tests use ports 5273/3101 to avoid disturbing a regular localhost demo; optional `LOCAL_API_PORT` and `LOCAL_WEB_PORT` are local test configuration names, not provider credentials. Default user commands still use 5173/3001.

HTTP tests verify shipment-before-adapter ordering, tracking validation, warehouse/organization permissions, stale revision/source holds, repeat submissions, original release audit, failed-alert persistence/retry/deduplication, pickup routing and protected PDF access. Existing payment/release regression tests remain in place. Chromium tests open the actual PDF, inspect printable content/print media, verify Print invokes the print function (without claiming physical printing), drag/cancel, button-submit tracking, one capture, denied rep move, failure/retry, search/type/priority/date filters and pickup routing.

The PDF sample was generated with ReportLab and visually checked with Poppler. It is committed at [output/pdf/sample-packing-slip.pdf](../output/pdf/sample-packing-slip.pdf), so running the app/CI does not require Python or a PDF authoring dependency. Optional regeneration source is [scripts/create_sample_slip.py](../scripts/create_sample_slip.py).

Deferred: partial quantities/packages and their tracking/alerts, pickup/dropoff completion, per-job packing slips and authoritative invoice PDF/deep links, shipment corrections, durable storage/queue/audit, real authentication, live Slack, label purchasing, Zoho stock effects and migration. Both builders review this local C5/warehouse/notification extension before broader operational use. Live notifications and inventory remain outside this authorization.
