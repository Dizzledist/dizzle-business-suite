# First invoice-to-warehouse acceptance scenarios

November 6, 2026. These are specifications for future isolated tests, **not executed application tests**. Review with [CONTRACTS C1-C5](CONTRACTS.md), [PERMISSIONS](PERMISSIONS.md) and [open questions](DECISIONS.md). No app, live connector or test harness exists in Phase 0. Both builders review shared behavior; owner/integration lead must settle unverified Zoho semantics before live acceptance.

## Fixture vocabulary

Use synthetic records only: organization O1, account A assigned to Rep A, account B assigned to Rep B, owner, Dizzle admin (not owner), sales manager, warehouse worker and marketing-only employee. Invoice I1 is a valid fulfillment-eligible invoice for A, total USD 100.00, one line for 10 units. Source identities include application, provider organization and immutable invoice ID; all amounts/statuses below are normalized fixture facts, not Zoho API field names.

Fresh evidence means within an explicitly configured/tested verification policy. Its duration and provider ordering mechanism remain Q03 decisions. Assert job count/identity, balance, audit trail, authorization result, provenance/freshness, package quantities and outbound effects, not only dashboard text. Replay/concurrency cases must inspect durable state after retries/recovery.

## Core release scenarios

| ID | Given / when | Required result |
|---|---|---|
| A01: Mirror once | Owner or sales manager creates I1 in Zoho; sync sees it repeatedly | One canonical read-only invoice with source IDs, lines, balance and freshness. No local invoice issuance or duplicate invoice/payment email; no job while unpaid |
| A02: Unpaid hold | I1 has fresh authoritative balance 100.00 and no valid payment | Authorized sales view shows unpaid; warehouse queue has no I1 job; automatic release is held |
| A03: Partial payment | Valid applied payment 40.00 leaves balance 60.00 | Authorized view shows partial and evidence; no automatic warehouse job; no rounding or local record marks it paid |
| A04: Full payment | Current authoritative evidence shows valid applied payments totaling 100.00, zero balance and eligible invoice state | Exactly one job J1 is released; audit names verifier/evidence/time; account and 10 units match I1; no local stock change |
| A05: Duplicate events | Replay the A04 invoice/payment events, including the same payment application with multiple delivery IDs | Still one invoice, one payment application/amount and one J1; no duplicated release side effects |
| A06: Out-of-order events | Full-payment assessment is followed by an older partial/unpaid event | Older payload cannot erase verified newer facts or add a job. Reliable source ordering rejects it; uncertain ordering reconciles current source and shows pending state until verified |
| A07: Authorized terms release | For unpaid I1, owner/admin or sales manager submits approved-terms release with reason, current eligible revision and request key | One J1; release audit stores exact actor, nonempty reason, server time and invoice reference. Balance stays 100.00 and payment remains unpaid |
| A08: Partial terms release | Sales manager releases the A03 invoice with approved terms and reason | One J1 with original required quantities and balance 60.00; audit distinguishes terms from payment |
| A09: Later payment | After A07/A08, verified full payment arrives | Existing J1 ID remains; payment evidence/balance updates. Original terms reason/actor/time persists; no second job, including if J1 is archived |
| A10: Missing reason | Authorized actor submits terms release with empty/whitespace reason or missing required terms evidence | Validation rejects; no job, release audit or balance change; existing records preserved |
| A11: Unauthorized release | Rep A, warehouse or marketing-only employee invokes terms command directly, including forged client roles/trigger | Forbidden; no job or payment/balance change; safe denial audit. UI hiding alone does not satisfy this test |
| A12: Concurrent release | Two workers process full payment while a sales manager submits terms release; retry after a simulated crash | Exactly one J1 and coherent release provenance; committed audit/job/work references recover together. Later attempts return same job; no half-created job or duplicate side effects |
| A13: Stale/failed sync | Previously observed balance zero is stale, or verification request fails | Show Awaiting verification with last verified time/error; no automatic release. Retry/reconciliation restores verified state before eligibility is reconsidered |
| A14: Stale manual request | Authorized actor requests terms release but current invoice validity/mapping cannot be refreshed | Proposed C5 policy: hold pending verification; do not infer paid or release from stale invoice validity. After refresh confirms eligible unpaid state, a valid terms request may release |
| A15: Payment return / cash report | Browser returns from payment page, or rep records a cash/check collection locally, without Zoho verification | No paid state or automatic release. Custody record remains pending reconciliation; authorized terms path is separate |

## Eligibility, isolation and continuity

| ID | Given / when | Required result |
|---|---|---|
| A16: Invalid or credit-only | Draft, void or cancelled invoice has numerical zero balance; alternatively credits/write-off settle balance without proven full payment | Invalid state never releases automatically or via terms. Credit-only/ambiguous cases stay on hold/review until Q02 defines policy; zero is insufficient |
| A17: Unmatched source | I1 customer mapping is missing/conflicting; or another provider organization has the same displayed invoice number | Unmatched invoice raises exception and cannot release. Distinct source invoices remain distinct; verified aliases for one invoice converge to one canonical invoice/job |
| A18: Rep isolation | Rep A requests B's account, invoice, package/tracking, file, report, search result or AI summary via guessed ID/direct endpoint | Every path denies/omits B's data without leakage. Rep A can read A's authorized records but cannot reassign or release them |
| A19: Reassignment | Owner/admin or sales manager reassigns A from Rep A to Rep B | Assignment audit retained; Rep A loses associated access, including cached/search/AI/download paths and queued tasks; Rep B gains scoped access. Source salesperson/historical authorship remain intact |
| A20: Amendment | Invoice quantities change after picking/shipping, or a release request carries an older invoice revision | Visible conflict/review exception; preserve completed quantities, tracking and original evidence. Do not silently overwrite picked work or create another job |
| A21: Reversal/refund | Payment is reversed/disputed/refunded after J1 exists, including after shipment | Review exception and updated source financial evidence; preserve J1/history/packages. No silent recall/deletion or second release |
| A22: Partial shipment | Ship 4 of I1's 10 units in package P1, later 6 in P2 | J1 retains 6 outstanding after P1 and zero after P2; package-specific tracking remains. Over-allocation/over-shipment is rejected or explicitly reviewed; no independent inventory subtraction |
| A23: Shipment notifications | A real shipment event occurs under an approved template/sender/recipient policy; simulate delivery failure and retry | Correct account/assigned rep receives scoped in-app update; configured transition Slack alert is queued; customer confirmation uses approved template. Failure/outcome remains visible; retries do not duplicate confirmed sends. Awaiting pickup differs from carrier movement |
| A24: Replay safety | Replay imported historical invoices/payments/shipments with outbound effects disabled | Idempotent mirrors/job mapping reconcile without historical emails, payment writes or stock movements; delivery replay cannot bypass effect suppression |
| A25: Zoho boundaries | Dizzle admin without owner/sales manager role attempts invoice creation; warehouse moves a card | No Dizzle invoice creation or implied Zoho creator rights. Kanban transition performs no local stock subtraction; shipment writeback disabled pending Q04 |

A23 requires a later approved notification sender contract (Q08); no messages are sent by these documentation fixtures. Runtime tests must also verify source URL/customer eligibility before exposing a Zoho Pay Invoice link. Tracking and payment synchronization remain independent.

## Evidence for vertical-slice completion

Record isolated test results for A01-A25, concurrency/recovery evidence, role checks across retrieval paths, provider mapping verification and unresolved limitations. No live acceptance or cutover until relevant Q01-Q06/Q08 decisions are settled and staging is isolated. UI fixtures may be built earlier against reviewed contracts without claiming real Zoho verification.

## Separate marketing/Assets proposal

The [image studio and Sales Assets proposal](IMAGE_STUDIO_SALES_ASSETS_PROPOSAL.md) adds synthetic approved-image, restricted-price-list and batch-specific-COA examples and AS01-AS17 scenarios for later review. They cover drafts, exact-version approval, selected/all publication, live rep authorization, version replacement/retirement, no-match COA lookup, notifications and external-send boundaries. These are unexecuted specifications for proposed C6; A01-A25 and C1-C5 are unchanged.
