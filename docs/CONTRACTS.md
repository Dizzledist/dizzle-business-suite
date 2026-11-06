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
