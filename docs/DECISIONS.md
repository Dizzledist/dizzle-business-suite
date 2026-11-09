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

## Phase 0 review follow-up: recommendation history

Recorded November 6, 2026 from the user's Phase 0 review follow-up request. **R01-R03 are recommendations pending joint sign-off by the user and sales manager, not adopted decisions.** They clarify proposed C1/C5 behavior and the permission design without superseding confirmed scope requirements. Owner/admin grant controls and Zoho source ownership remain in force.

| ID | Recommendation for joint sign-off | Status / affected documents |
|---|---|---|
| R01 | A sales rep role alone grants access only to assigned accounts. A separately granted role or full-access permission can broaden access only within its authorized scope | Pending user + sales manager; C1/C2, PERMISSIONS, A18-A19/A28 |
| R02 | Hold a manual terms release when current invoice validity or the account mapping cannot be verified. If a warehouse job already exists, preserve it and flag stale verification for review | Pending user + sales manager; C4/C5, PERMISSIONS, A14/A29 |
| R03 | An authorized releaser must record the applicable approved terms and the reason for early release. That record is sufficient when approved terms are already documented. If the terms are missing or disputed, hold the release for explicit approval | Pending user + sales manager; C5, PERMISSIONS, A07/A10/A30 |

Record the joint sign-off date, participants and any amendments here before marking a recommendation accepted. R03 does not establish who resolves disputed terms or the approval UI/schema; those remain to be agreed. It never bypasses actor authority, invoice eligibility, mapping verification or audit requirements.

Unverified Zoho behavior in Q01-Q04 remains open, including authoritative payment/status/credit semantics, freshness and ordering, source identity mappings and stock effects. These recommendations do not verify or resolve those provider questions. Merge operator and Phase 1 lead are **unassigned, for the user and sales manager to assign**. Both PRs stay draft, main stays unchanged and app scaffolding remains on hold while review/sign-off continues.

## Phase 0 joint sign-off: approved November 6, 2026

Source: explicit user report of joint approval by **Cheddr and Dizzle Sales Manager**, followed by the supplied role assignments. Reviewed revision: `609f2cae3059c98873274afd60c76885f261dbb7` on `docs/phase-0-foundation`, [PR #1](https://github.com/Dizzledist/dizzle-business-suite/pull/1). Before recording, GitHub PR head and fetched branch both matched that exact revision; the intervening diff was empty. This record supersedes the pending status and unassigned merge/Phase 1 roles in the historical review entry above; it does not amend the reviewed policy or scenario behavior.

| Approved item | Scope of joint approval |
|---|---|
| R01 | A sales rep role alone grants access only to assigned accounts. A separately granted role or full-access permission can broaden access only within its authorized scope |
| R02 | Hold a manual terms release when current invoice validity or the account mapping cannot be verified. If a warehouse job already exists, preserve it and flag stale verification for review |
| R03 | An authorized releaser must record the applicable approved terms and the reason for early release. That record is sufficient when approved terms are already documented. If the terms are missing or disputed, hold the release for explicit approval |
| A26-A30 | Approved as acceptance specifications at the reviewed revision: partial payment updates the existing job; distinct release request keys preserve the job/original audit; disabled/revoked/cross-organization requests are denied; stale verification preserves existing work with a review flag; missing/disputed terms hold for explicit approval |

| Assignment | Designated participant |
|---|---|
| Merge operator | Cheddr (Marketing / Admin) |
| Phase 1 lead | Cheddr (Marketing / Admin) |
| Approving participants | Cheddr and Dizzle Sales Manager |

Approval is limited to R01-R03 and A26-A30 as reviewed. It is not evidence of executed tests, implemented capabilities, approval of all other proposed technical choices, or verification of Zoho behavior. Q01-Q04 and other unresolved questions remain open; terms-dispute approval authority/evidence format and deployment ownership are not assigned by this sign-off. Both PRs remain draft, main unchanged; merge is a separate step for Cheddr, and app scaffolding remains a separate task on hold.

## Local Phase 1 implementation choices, November 6, 2026

Source: user's explicit request to build the local invoice-to-warehouse demo after PR #1 merged. This authorizes the scoped local scaffold and supersedes the prior scaffolding hold for this task; it does not authorize production infrastructure, live integration or external sends. Active lead: Cheddr (Marketing / Admin). R01-R03 business behavior is unchanged.

| ID | Local implementation choice | Limits / review |
|---|---|---|
| L01 | One npm project: React/TypeScript + Vite, Node built-in HTTP API via tsx, Zod input schemas; Node 24 baseline | Directory layout and local API mapping are now concrete for both builders to review; production hosting remains undecided |
| L02 | In-memory fixtures, synchronous single-process release/job/audit mutations keyed by canonical invoice, immutable original release audit | No durable transactions, worker recovery, database, migrations or production uniqueness guarantee |
| L03 | Server-defined local test identity selected by header, loopback-only listeners, no-store API and restrictive host/origin handling | Demonstrates role/action/organization/assignment checks; deliberately not real authentication. No external deployment |
| L04 | Synthetic source snapshots use USD cents, versions 1/2, five-minute freshness and explicit verification controls | Fixture assumptions only; Q01-Q04 remain open. Provider ordering/payment/credit semantics must be validated independently |
| L05 | HTTP integration tests + Playwright Chromium user flows; PR Actions run typecheck/tests/build/browser checks | No deployment permissions or live credentials; approved acceptance specs have only the scoped coverage documented in LOCAL_DEMO |

See [LOCAL_DEMO](LOCAL_DEMO.md) for reproducible behavior and [CONTRACTS](CONTRACTS.md) for consumer boundaries. Owner/admin and sales manager release permissions remain distinct from fixture simulation grants; price lists, COAs and marketing are outside this branch.

## Parallel marketing and sales workstreams, November 9, 2026

Source: Cheddr's explicit request for a separate marketing branch while the sales manager develops sales/dashboard/pipeline, with the work ultimately combined into one department-aware web app. This supersedes the prior task-bound marketing exclusion for branch setup and coordination; it does not alter D01-D04 or approved R01-R03.

| ID | Confirmed direction / setup choice | Limits and review |
|---|---|---|
| MKT01 | Cheddr leads `feat/marketing-workspace` from reviewed main; sales manager continues the sales workstream on its own branch | Separate worktrees preserve existing previews. Branch setup does not merge either feature or authorize deployment |
| MKT02 | One application serves authorized department dashboards after sign-in; existing multi-role and least-privilege rules apply | Reaffirms scope/D03. Dashboard routing, department membership/grant schema, default landing and multi-role UI need joint implementation review; no runtime change in this task |
| MKT03 | Reuse one reviewed identity, account-assignment, integration and shared Assets service across department modules | Sales CRM identity and PR #2 Assets contracts remain review candidates. No duplicate auth/connector/stock logic; account access and historical sales credit remain distinct |

See [MARKETING_WORKSPACE](MARKETING_WORKSPACE.md) for current references and handoff procedure. Separate PRs and shared integration testing are the coordination plan, not permission to merge pending PRs. Both builders review shared contracts before changing them.

## Marketing implementation authorization and local choices, November 9, 2026

Source: Cheddr supplied the original "Build the Marketing Workspace" prompt and explicitly instructed Codex to "finish where it left off." This authorizes completing the uncommitted prototype on `feat/marketing-workspace` in existing draft PR #5, including checks, documentation, commit and push. Both builders still review shared changes; no production policy sign-off is inferred.

| ID | Decision or local implementation choice | Superseded rule / limits |
|---|---|---|
| MKT04 | Implement local marketing home, campaigns/calendar, sample generation, review, internal Assets publication and Sales preview; document future build slices | Supersedes MKT01's setup-only boundary and historical Phase 1 marketing exclusion for this task. No live provider calls, external sends, production storage, merge or deployment |
| MKT05 | Conservative demo rules: Marketing editor authors; explicitly granted Owner reviews/publishes; no creator/latest-editor self-review; approved exact versions only; all mode snapshots current eligible recipients; current grants/account assignment are rechecked | PR #2 M01-M04 remain open production decisions. Multiple approved versions can be explicitly published until each publication is retired. No expiry, automatic replacement, verified document imports or immutable review-decision ledger claimed. Restricted document metadata/files require the read-all grant in marketing; reps additionally require current assignment for price lists |
| MKT06 | Reuse server-defined Phase 1 identities and assignment predicate, append marketing action grants/departments, keep generation behind `GenerationAdapter`, and reuse the Sales CRM local-port helper verbatim from `a81ddae` | Implements a local navigation/permission demonstration, not production login or department administration. Sales CRM sessions and Warehouse grants remain separate integration work. Tests use isolated 5373/3201; optional preview variables are DIZZLE_WEB_PORT and DIZZLE_API_PORT |

Approved R01-R03 and financial/source ownership rules remain unchanged. See [MARKETING_DEMO](MARKETING_DEMO.md) for exact fixtures and [HANDOFF](HANDOFF.md) for evidence and integration review needs.
