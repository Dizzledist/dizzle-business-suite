# Decisions and integration questions

Baseline: [PROJECT_SCOPE v2.0](PROJECT_SCOPE.md), November 4, 2026. Recorded November 6, 2026. User instructions for Phase 0 confirm the build ownership and documentation-only boundary below. IDs are stable references for review; new decisions must identify owner, date, evidence and any superseded ID.

## Confirmed business decisions

| ID | Decision | Source / accountable review |
|---|---|---|
| D01 | Zoho owns invoicing, payments, accounting (Books) and inventory (Inventory); existing Authorize.Net stays through Zoho. No QuickBooks or local competing stock ledger | Scope 3-4, 7; owner |
| D02 | Only owner and sales manager create/edit invoices in Zoho; Dizzle mirrors them read-only. Dizzle admin does not inherit Zoho creator rights | Scope 3-5; owner/sales manager |
| D03 | Reps see assigned accounts/leads and associated records only. Owner/admin and sales manager may reassign. Staff may hold multiple roles; sensitive/full access requires explicit grant | Scope 3, 5, 13; owner/admin |
| D04 | Verified full payment releases one eligible warehouse job. Approved-terms unpaid/partial release requires owner/admin or sales manager, actor, timestamp and reason. Later payment updates the same job without changing release history | Scope 6; user Phase 0 instruction; shared |
| D05 | Zero balance, payment-page return, stale sync and local cash reports do not prove full payment. Draft/void/cancelled records cannot release; credits/write-offs/reversals need explicit policy | Scope 6-7; shared |
| D06 | Zoho sends invoice/payment messages. Other outreach needs named approval; approved routine shipment confirmations may send automatically. Track failures and avoid duplicate senders | Scope 3, 9, 11; owner and workflow leads |
| D07 | Sales manager leads sales rep, sales manager and owner dashboards. User leads marketing, image studio and Assets publishing. Shared foundation has one active implementation lead per task | Scope 15, 22; user Phase 0 instruction |
| D08 | Preserve useful legacy history with source identities; do not trust legacy stock as opening balances. Trial with effects disabled; Replit remains sole operational writer until cutover signoff | Scope 19; owner |
| D09 | Current task changes documentation/contracts only, on docs/phase-0-foundation, with draft PR against main. Keep workspace file untracked; no scaffolding, dependencies, infrastructure or live integrations | User Phase 0 instruction |
| D10 | Company assistant oversight must be disclosed; employee memory can be inspected/corrected. Provider credentials remain server-side and access scoped | Scope 10-12; owner/admin |

## Proposed implementation choices: both builders review

No item here is deployed or an assertion about Zoho capabilities.

| ID | Proposal | Review / decision needed |
|---|---|---|
| P01 | Modular React/TypeScript UI, Node/TypeScript API, PostgreSQL, durable worker, private S3-compatible storage, Google Workspace identity; Vercel/Render hosting | Both builders select layout and versions; owner confirms accounts/cost. No dependencies chosen in Phase 0 |
| P02 | Contracts C1-C5 use explicit organization scope, stable internal IDs, composite Zoho keys, fixed-precision amounts and freshness metadata | Both builders review [CONTRACTS](CONTRACTS.md); integration lead validates provider mapping |
| P03 | One release command, uniqueness per canonical invoice, transactional audit/job creation and durable outbox/inbox | Both builders review; choose concrete persistence/queue mechanisms in implementation |
| P04 | Least-privilege permission matrix and operational warehouse projection | Both builders and owner approve proposed rows in [PERMISSIONS](PERMISSIONS.md) |
| P05 | Warehouse/production/client-services coordination by user; separate production work orders and fulfillment cards | User and sales manager confirm assigned task leads. No Packing stage is approved |

## Open integration and operating questions

These are unverified. Resolve with dated evidence in a later authorized discovery task; do not infer provider support from the proposed contract field names.

| ID | Question | Proposed resolver | Gates |
|---|---|---|---|
| Q01 | Standalone Zoho Invoice or Books invoices? Which organizations, data centers and Invoice/Books/Inventory relationships? Which IDs alias the same invoice? | Foundation lead with owner/sales manager | Canonical mapping, OAuth and invoice import |
| Q02 | Which authoritative statuses, payment applications, credits, refunds and balances establish full payment? How are write-offs, credit-only settlement, overpayment, disputes and reversals treated? | Owner/sales manager with integration lead | Release eligibility; ambiguous cases stay on hold/review |
| Q03 | Which webhook/event IDs, source versions/timestamps, pagination, rate limits and reconciliation mechanisms are supported? What freshness threshold and verification failure policy apply? | Foundation lead; both builders review | Event ordering and freshness implementation; never guess paid |
| Q04 | Which Zoho transaction changes stock and when? Does Dizzle write shipments/tracking back? How do Shopify/ShipStation/invoicing avoid double deduction? | Foundation lead with warehouse/owner | All stock-impacting or shipment writeback |
| Q05 | How do source customer, rep and salesperson IDs map to company/store/buyer, assigned owner and historical attribution? Are multiple rep assignments allowed? | Sales manager with user | Account scope and reporting; primary rep is only a proposal |
| Q06 | Which warehouse transitions/actions are allowed per role, eligibility rules for non-shippable invoices, dispatch cutoff, units and package conventions? | User/warehouse with sales manager | Warehouse mutations; do not invent Packing |
| Q07 | Who owns BOMs, labor capture and QC release? Which lots, WIP and client ownership fields does the actual Zoho plan support? | User/production with owner | Production/stock integration |
| Q08 | Which sender owns shipment notifications? What templates/recipients are approved? Which Slack destination, customer tracking verification and Zoho payment URLs work? | User with sales manager | Live notifications and portal links |
| Q09 | Is WhatsApp group delivery supported for the actual account? History-only or catalog portal reorder requests? | User with owner | Messaging/portal expansion |
| Q10 | Who is active foundation lead, review/merge operator and deployment owner? What grants apply to sensitive data and multi-role conflicts? | Both builders with owner/admin | Shared implementation and merge/deploy process |
| Q11 | What retention/offboarding policy, backup recovery objectives, budget and cutover window apply? | Owner/admin with builders | Production readiness |

Record decisions when they become necessary. Confirmed business rules above remain in force while technical details are unresolved.
