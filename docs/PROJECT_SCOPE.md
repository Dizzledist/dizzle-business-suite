# Dizzle AI Business Suite
## Complete project scope, dashboards and shared Codex build plan

**Version:** 2.0  
**Date:** November 4, 2026  
**Audience:** Dizzle owner, sales manager, marketing manager and both Codex builders  
**Status:** Consolidated planning baseline. No replacement application or live integration has been completed.

This document replaces the earlier master specification and change addendum as the consolidated project brief. It incorporates the latest decisions on Zoho, warehouse release and marketing. Where earlier documents or the original proposal PDF conflict with this brief, follow this brief. Historical audits remain evidence about the old application, not requirements to reproduce all its behavior.

## 1. The project in plain language

Build one Dizzle workspace that gives each department the information, tools and AI assistance needed to run its part of the business. Connect customer relationships, financial information, warehouse work, production, marketing and client services through shared records.

Zoho remains the specialist system for invoices, payments, accounting and inventory. Dizzle brings that information together with operational workflows, communications and personal AI assistants. Invoice creation and inventory administration remain deliberate exceptions to the one-workspace goal because staff perform those functions in Zoho.

The new application replaces the current Replit application. Preserve useful contacts, notes, account ownership, invoice history, warehouse jobs, files and shipment history. Reuse selected reviewed code where it saves time. Build a simpler interface using the Dizzle logo, charcoal backgrounds, red accents and white text.

### Main outcomes

- Recover repeat purchases through consistent follow-up and AI-prepared outreach.
- Give the owner a credible view of performance, cash, commitments and operating risks.
- Display dependable Zoho inventory and identify shortages before they interrupt work.
- Give the four-person production team a schedule, instructions and visible priorities.
- Make fulfillment status and tracking easy for sales and customers to find.
- Capture dropship, white-label and co-pack work and billable services.
- Give each employee a proactive assistant tailored to their responsibilities.

## 2. Business context

Initial named businesses/brands: Dizzle Dist, Cheddr, Puffr, Georgia Hemp Co and Frosty. Brand ownership, legal entities and service-client relationships require explicit configuration. A brand is not automatically a separate legal entity.

Planning scale supplied by the business: approximately eight employees with overlapping responsibilities, four production workers, 150 wholesale SKUs, 60–80 active wholesale customers out of roughly 300, 200–220 wholesale orders and approximately 100 retail orders monthly. One warehouse has seven racks accessible from both sides. Two dropship clients send orders through ShipStation.

The suite covers wholesale shops, distributors, Cheddr retail, dropship clients, white-label/co-pack projects and own-brand production. Customer companies may have multiple stores, buyers, shipping addresses and a central billing account.

## 3. Non-negotiable decisions

| Topic | Confirmed requirement |
|---|---|
| Invoicing | Only owner and sales manager create invoices, directly in the Zoho dashboard |
| Accounting | Zoho Books. No QuickBooks |
| Payment processing | Existing Authorize.Net connection through Zoho |
| Invoice payment messages | Zoho sends invoice/payment links. Dizzle does not duplicate them |
| Inventory | Zoho Inventory owns stock and inventory management |
| Invoice visibility | Dizzle mirrors Zoho invoices, lines, balances and statuses for authorized users |
| Default fulfillment release | Full payment verified from Zoho releases an eligible invoice to warehouse |
| Unpaid/partial exception | Owner/admin or sales manager may explicitly Push to Warehouse with an audited reason |
| Rep access | A rep sees only assigned accounts/leads and associated customer records |
| Assignment | Owner/admin and sales manager can reassign customers and leads |
| Multi-role staff | An employee may hold multiple department roles |
| Sensitive access | Owner/admin manages access, including explicit full-access grants |
| AI oversight | Owner/admin can inspect company assistant history. Disclose this to employees |
| External sends | Outreach, collection emails, texts, WhatsApp messages and newsletters require named approval |
| Shipment exception | Routine customer shipment confirmations may send automatically using approved templates |
| Collections | Cash/check custody, verification and deposit tracking belong in the replacement |
| Consignment | Preserve useful history. Defer new operational module |
| Notifications | In-app shipment updates from launch, with immediate Slack alerts during transition |
| Marketing | OpenAI image studio and an approved sales Assets library |
| Future product | Internal first. Preserve boundaries that support future white labeling |

Admin access in Dizzle does not automatically grant invoice-creation rights in Zoho. Configure Zoho permissions separately. The latest invoice policy is owner and sales manager only.

## 4. System responsibilities

| System | Owns | What appears in Dizzle |
|---|---|---|
| Zoho invoicing dashboard | Invoice creation, numbering, edits and invoice communications | Read-only invoice detail, source PDF/link, line items, balances and customer history |
| Zoho Books | Accounting, financial records and reported balances | Authorized financial dashboards, receivables, costs and AI explanations |
| Zoho Inventory | Items, units, stock, locations and inventory transactions | Availability, shortages, product views and planning inputs |
| Zoho + Authorize.Net | Customer payment experience and payment records | Pay Invoice links and synchronized payment status |
| Dizzle | CRM ownership, department workspaces, fulfillment tasks, production planning, AI, assets and approvals | Primary internal operational workspace |
| ShipStation / carrier services | Supported client order feeds and shipping/tracking information | Linked orders, packages, carrier events and shipping visibility |

Confirm whether the invoice origin is standalone Zoho Invoice or invoices within Zoho Books. Do not treat one invoice mirrored across Zoho products as multiple sales.

## 5. Dashboard map

Each dashboard answers: What needs attention? What should I do next? What changed? All dashboards use shared records, with server-enforced access. Department switching changes the view, not the person's authority.

### 5.1 Owner / executive dashboard

**Primary build lead: sales manager, with owner business review.**

- Company overview with period comparisons and drill-down to source records.
- Billed sales, collected payments, receivables and overdue balances shown separately.
- Brand/channel/customer performance and active wholesale accounts.
- Profit/loss, costs and margins where Books data supports them.
- Run rate, forecasts and purchasing commitments with assumptions visible.
- Marketing spend and performance.
- Warehouse backlog, shipments, shortages and production commitments.
- Customer retention, reorder opportunities and sales-team activity.
- Approvals, terms-release exceptions and integration health.
- Access settings, account reassignment and full-access grants.
- Executive AI chat, morning briefing and prioritized business risks.

Payroll/bank visibility is a permission category, not a commitment to build a payroll engine or bank-payment system.

### 5.2 Sales manager dashboard

**Primary build lead: sales manager.**

- Team pipeline, assigned/unassigned leads and account distribution.
- Reassignment tools and history.
- Follow-up coverage, dormant customers and likely reorder opportunities.
- Team sales reporting with agreed attribution.
- Zoho invoice views and Open in Zoho action for the authorized creator.
- Paid/unpaid/partial/overdue balances and controlled Push to Warehouse.
- Pricing/terms context, goals and commission configuration.
- Outreach approval queue and approved marketing assets.
- Customer-service or fulfillment exceptions affecting accounts.

Commission calculations and payout reporting require agreed attribution, rates, effective dates and adjustment rules before implementation.

### 5.3 Sales representative dashboard

**Primary build lead: sales manager.**

- Assigned accounts and leads only.
- Company, store and buyer detail with notes, tasks and activity history.
- Pipeline: outreach, catalog sent, samples if requested, follow-up, order, repeat customer.
- Personalized priorities, overdue tasks and reorder recommendations.
- Relevant email and AI-drafted outreach requiring approval.
- Read-only customer invoices, balances, order progress and tracking.
- Cash/check collection reporting under the approved custody process.
- Assets: approved images, catalogs, sell sheets, product photos, price lists and batch-specific COAs.
- Visits/calendar/route planning as an adoption feature after core sales continuity.

Representatives do not create invoices. A proposed Request Invoice action can send structured product/customer requirements to the owner or sales manager without creating a Zoho invoice automatically. Confirm this convenience workflow before building it.

### 5.4 Warehouse dashboard

**Proposed build lead: Cheddr / marketing manager, coordinating with the sales manager.**

- Fulfillment Kanban containing paid or explicitly released work only.
- Job priority, customer, invoice reference, linked source document and assigned worker.
- Products, required quantities, package allocations and outstanding quantities.
- Pick/scan checks, packing responsibility, shortages and exception notes.
- Partial shipments, UPS/carrier tracking, pickups and corrections.
- Completed/archive search and full action history.
- Relevant Zoho Inventory stock/location views.
- Shipping cutoff information based on the stated 8 a.m.–2 p.m. Pacific operating window, with exact policy to confirm.
- Failed or uncertain notifications and integration exceptions.

Current Replit states are Orders, Partially Shipped, Shipped and Dropoff/Pickup. Add a Packing stage only after approving the new workflow. Do not infer it exists from old dashboard labels. Kanban permissions must be explicit for warehouse, manager and admin actions.

### 5.5 Production dashboard

**Proposed build lead: Cheddr / marketing manager, with owner and production input.**

- Today, next week and longer-range schedule for four workers/four tables.
- Work orders, assigned workers, stations, priorities and dependencies.
- Product/BOM requirements, approved packaging artwork and instructions.
- Material availability from Zoho and shortage requests.
- Actual output, labor, waste, rework and job progress.
- QC checks and authorized finished-goods release.
- Links to originating warehouse demand or client project.

Production work orders are distinct from fulfillment cards. Finished-goods stock, material consumption and inventory adjustments must follow supported Zoho Inventory transactions. Until that contract is proven, keep the integration read-only and visibly flag the gap. Do not silently create a second stock ledger.

### 5.6 Marketing dashboard

**Primary build lead: Cheddr / marketing manager.**

- Dizzle and Cheddr marketing views with separate channel goals.
- Brand assets, campaign calendar, content briefs and approvals.
- Omnisend and GA4 performance linked to source orders where possible.
- AI assistance for campaign ideas, audiences, copy and performance summaries.
- OpenAI image generation/editing inside the dashboard.
- Approved asset publishing to selected/all authorized reps.
- Download and supported WhatsApp group-sharing actions.
- Usage/cost visibility for image generation and version history.

The user's personal access combines admin overview with marketing. Sales manager leads wholesale/distributor marketing, with collaboration across brands where authorized.

### 5.7 Finance / collections dashboard

**Shared workflow: sales manager and owner define business rules; integration owner builds the connector.**

- Zoho invoice balances, aging, payments, credits and refunds.
- Cash/check reporting, custody verification and deposits.
- Costs, vendor obligations and purchasing commitments from Zoho Books.
- Collection priorities and draft follow-ups coordinated with Zoho reminders.
- Clear separation of reported, verified, deposited and reconciled cash.
- Sync discrepancies and unresolved invoice/account matches.

Recording money in Dizzle must not independently mark a Zoho invoice paid. Choose between direct staff entry in Zoho and an explicitly reviewed payment-writeback workflow. Until then, local custody records remain pending reconciliation.

### 5.8 Operations / customer service dashboard

**Proposed build lead: Cheddr / marketing manager, with shared sales handoffs.**

- Assigned requests, order problems and cross-department blockers.
- Customer communication history and relevant invoice/shipment views.
- Returns/exchanges, photos, approvals, resolution and credits linked to Zoho.
- Recurring tasks, SOPs and employee handoffs.
- AI summaries, recommended next steps and escalation to the responsible person.

### 5.9 Dropship / white-label / co-pack workspace

- Service-client accounts and contracts.
- Client orders, branding, inserts, return addresses and shipping-account rules.
- Client-owned material/product visibility supported by Zoho mapping.
- Quotes/projects, artwork approvals, production status and delivery commitments.
- Billable order counts, storage periods and special services.
- AI identifies potentially unbilled services and prepares reviewed billing summaries.

Owner/sales manager still creates resulting invoices in Zoho. A Dizzle billing summary is supporting evidence, not a newly issued invoice.

## 6. Exact invoice-to-warehouse rules

1. Owner or sales manager creates the invoice in Zoho.
2. Zoho sends its configured invoice and payment email through the existing setup.
3. Dizzle synchronizes the invoice using organization/application/invoice IDs, not the displayed number alone.
4. Unpaid and partially paid invoices appear in authorized internal views but not the warehouse queue.
5. Verified full payment releases one eligible warehouse job automatically.
6. Owner/admin or sales manager may Push to Warehouse before full payment for approved terms. Require actor, reason and timestamp. Keep the balance unchanged.
7. Later payment updates that job instead of creating another one.
8. Warehouse records shipment quantities and package tracking. Partial shipments retain outstanding work.
9. Dizzle updates the assigned rep, queues Slack alerts and sends the approved customer shipment confirmation.
10. Tracking progress and Zoho balances continue to synchronize independently.

### Release safeguards

- Payment detection is deterministic API integration logic. AI explains and acts on verified results.
- Browser return from a payment page is not evidence of payment.
- Use Zoho's authoritative status, balance and valid payment information. Zero balance alone may reflect credits/write-offs rather than money received, so define release handling for those cases explicitly.
- Draft/void/cancelled invoices must not release simply because a numerical field is zero.
- Partial payments stay on hold unless an authorized person releases the order.
- Duplicate/out-of-order events cannot create duplicate jobs or erase newer data.
- Invoice amendments after picking/shipping create a visible review exception.
- Refunds, disputes and reversals flag existing work for review. Never silently pretend a shipped package can be recalled.
- A failed/stale payment sync shows Awaiting verification rather than a guessed paid state.

## 7. Inventory and stock-impact boundaries

Zoho Inventory owns receipts, counts, stock adjustments, reservations and stock-impacting transactions supported by the selected workflow. Dizzle displays those facts and planning recommendations.

Warehouse Kanban moves must not perform an independent stock subtraction. Before enabling shipment writeback, document which Zoho transaction changes stock, when it occurs, and how invoicing/Shopify/ShipStation interact with it. One business action must not reduce stock through two routes.

Required operational visibility: SKU/unit aliases, packaging components, raw product, WIP, finished goods, locations/bins, lots/batches, expiry, COAs, quarantine, available/committed stock and ownership where supported. Validate these needs against the actual Zoho plan. Any unsupported requirement becomes an explicit decision, not a hidden local workaround.

Physical stock must be established and maintained in Zoho through receiving/count processes. Do not trust old Replit stock quantities as opening balances.

## 8. Customer and client portals

### Planned customer portal capabilities

- Invite-based access with company/store/buyer permissions.
- Authorized invoices, past orders and current source balances.
- Pay Invoice action opening the Zoho-hosted invoice/payment URL.
- Shipment detail, carrier tracking, latest events and delivery estimate where supplied.
- Reorder requests based on purchase history.
- Relevant approved product documents and assistance requests.

Invoice creation remains in Zoho. Portal reorders are requests routed to owner/sales manager for invoicing unless a future explicit decision changes that policy. Full catalog request access versus history-only reorder requests is still open.

Do not assume embedded checkout or seamless Zoho sign-on. Confirm source payment URLs/account behavior. Protect customer-scoped links, revalidate eligibility and show payment completion only after Zoho verification.

### Later options

- AI-prepared reorder requests with transparent quantity assumptions.
- Customer-approved recurring replenishment with limits, reminders and pause controls.
- POS-connected inventory assistance after customer authorization.
- Dropship client stock, fulfillment, service statements and invoices.
- Co-pack project/specification/artwork approval portals.

Recurring replenishment must not bypass the established invoice-creator policy. Customer purchase history estimates demand. Actual sell-through requires customer stock/POS data.

## 9. Customer shipment updates

Use approved brand/client templates to send routine shipment confirmations automatically. Include invoice/order reference, shipped items, carrier tracking and a View Order & Tracking link. Separate packed/awaiting-pickup from carrier-confirmed movement.

Customer page shows package-specific progress, latest event/time, estimated delivery where available, exceptions and outstanding items. Full invoice access requires buyer authentication or verification. Never expose internal notes, margins, other customers or confidential client data.

App, Shopify, ShipStation and dropship client notification settings need one sender policy to avoid duplicate emails. Store delivery attempts/outcomes and show failures. Customer email contains a snapshot. The webpage provides current tracking.

## 10. Marketing image studio and sales Assets

### Image studio

Inputs: brand, campaign, prompt, dimensions/aspect ratio and approved reference images. Support generation, edits, versions and reviewed exports. Keep provider keys server-side and record usage. Preserve exact product imagery/labels through an appropriate composition method when generative alteration is unacceptable.

Required actions:

| Action | Result |
|---|---|
| Download | Save chosen image in supported export size/format |
| Send to Sales Reps | Publish approved asset to selected/all authorized reps and notify in app |
| Send to WhatsApp Group | Preview destination/content, obtain named confirmation and use verified supported delivery |

Direct WhatsApp group API delivery remains account/capability-dependent. If unsupported, provide a clearly labeled manual share/download handoff. Do not describe a share-dialog launch as confirmed delivery.

### Assets library

Support generated and uploaded images, COAs, catalogs, sell sheets, product photos, videos and authorized price lists. Organize by brand, product/SKU, asset type, campaign, batch and date. Store approval/version, owner, access and archive/expiry information.

Reps can search, preview, download and prepare approved sharing. Restrict customer-specific price lists and confidential files. AI may find a matching approved COA, but must not generate one or substitute an unrelated batch. Retired artwork should not appear as current material.

## 11. Personal AI assistants and proactive agents

Every employee receives a tailored assistant using onboarding, role scope, assigned accounts, work, mailbox access, preferences and approved knowledge. Admin confirms permissions. Employees can inspect/correct saved memory. Owner/admin oversight must be visible in onboarding.

| Agent function | Expected work |
|---|---|
| Executive | Explain performance, risks, priorities and forecasts with sources |
| Sales | Identify missed follow-ups/reorders and prepare outreach |
| Finance | Summarize receivables and exceptions and prepare collection tasks/drafts |
| Operations | Review job blockers, promises and cross-department handoffs |
| Inventory/planning | Explain Zoho stock and recommend replenishment or production priorities |
| Marketing | Prepare content, find approved assets and summarize campaign results |
| Client services | Summarize project status, service work and potential billing gaps |

Answers show reporting period, source records, freshness, assumptions and missing data. Calculations use controlled metric functions. News briefs stay distinct from company facts. Emails/documents cannot issue instructions that grant tool permissions.

AI can proactively investigate and prepare work. External outreach, collection messages, texts, WhatsApp sends and newsletters require approval of the actual recipients/content. Modified drafts require renewed approval. Zoho-owned invoice communications and approved routine shipment confirmations follow their separate configured workflows. Other autonomous write actions require explicit per-action design.

## 12. Communications and knowledge

Bring authorized Gmail reading, drafting and sending into the app, with correct individual/shared-mailbox scope. Connect selected Slack workflows and later supported messaging views. Maintain tasks/calendar, SOPs, approved product facts, artwork, contracts and operating decisions.

Google Drive and Dropbox document access is scoped, not an unrestricted dump into shared AI memory. Owner/admin access policy for mailbox content and retained copies must be explicitly configured. Personal connections require appropriate account grants. Offboarding revokes tokens/access and handles retained business records under policy.

## 13. Data, analytics and reporting

Separate brand, legal entity, company, store, person, employee, lead/opportunity, invoice, payment, fulfillment job, package, production job and service project. Mirror Zoho records with source IDs and provenance. Preserve source rep, assigned owner, invoice salesperson and historical author separately.

Metric definitions must distinguish billed sales, tax/shipping, credits, received payments, open/overdue balances, deposited cash and settled cash. Do not count a Zoho invoice and warehouse job as two sales. No P&L based only on invoice totals. Cost completeness and attribution limitations remain visible.

Agree active-customer window, reorder expectations, commission attribution, forecast methods and Open/Closed invoice grouping before displaying them as authoritative. Reps' analytics include only their permitted records. Full company and sensitive analytics require grants.

## 14. Integrations and proposed architecture

| Component | Proposed implementation |
|---|---|
| Source control | One company-owned GitHub repository |
| Interface | React/TypeScript, Vercel hosting |
| API | Modular Node/TypeScript service on Render |
| Database | PostgreSQL on Render, near API |
| Background processing | Separate durable worker for sync, notifications and AI jobs |
| Files | Private S3-compatible storage and authorized attachment registry |
| Identity | Google Workspace login with app-managed permissions |
| Environments | Isolated development, staging and production |

This is a proposal, not provisioned infrastructure. Verify supported versions, costs and account setup during implementation. Keep one modular application rather than premature microservices.

Integration priorities: Zoho invoice/Books/Inventory, Slack, ShipStation/UPS, Google Workspace, Cheddr Shopify, marketing reporting, image generation, authorized Drive/Dropbox, and supported WhatsApp workflows. Resend remains optional for application mail. Do not add another payment processor integration merely because legacy code exists.

Zoho sync needs organization/region-aware OAuth, least privilege, pagination, provider limits, deduplicated event handling, durable retries and reconciliation. Show last sync and pending/failed states. Near-real-time is a design goal, not an unconditional guarantee.

## 15. Shared build ownership

The user and sales manager will build at different times of day. Time separation helps, but repository state, interfaces and handoffs still need discipline.

| Area | Build lead | Coordination requirement |
|---|---|---|
| Sales rep and sales manager dashboards | Sales manager | Use shared identity/account/invoice contracts |
| Owner/executive dashboard | Sales manager | Owner reviews business definitions; user reviews shared design |
| CRM, lead assignment, sales AI, commissions | Sales manager | Shared permission and financial-source review |
| Marketing, image studio and Assets publishing | Cheddr / marketing manager | Sales manager agrees Assets consumption contract |
| Warehouse, production and client services | Proposed: Cheddr / marketing manager | Sales manager validates invoice/fulfillment handoff |
| Auth, database, Zoho sync and integrations | Shared foundation; appoint one active lead per task | Never implement duplicate connectors/auth layers |
| Customer portal, finance reconciliation and design system | Shared contracts; assign individual issues | Agree cross-department behavior before editing |

Only the sales manager's sales/owner build focus and the user's marketing/admin role are established. Other assignments above are proposed defaults to confirm together. They are development ownership, not employee business permissions.

### Suggested code boundaries

Use modules such as identity, accounts, zoho-sync, finance-views, fulfillment, production, client-services, marketing, assets, ai, notifications and customer-portal. Directory names are proposed until the repository layout is selected. Shared contracts/types and common UI components belong in shared locations with one maintained implementation.

Sales modules consume a Zoho invoice service rather than calling Zoho independently. Dashboards consume the same facts and permission checks. Marketing publishes one asset record consumed by sales. Warehouse release uses one domain command regardless of whether payment or an authorized exception triggers it.

## 16. Working in Codex at different times

### At the start of every session

1. Read this brief, the repository AGENTS.md, project status and latest handoff.
2. Check current branch, working tree and remote state before edits. Never overwrite another person's uncommitted work.
3. Fetch current changes and start a task branch from the agreed integration branch. Use separate clones/worktrees for overlapping sessions.
4. Select/claim one scoped issue, state affected modules and confirm dependencies.
5. Read relevant contracts and decision notes. Ask only about unresolved choices that materially block that issue.

### During implementation

- Keep work scoped to the issue. Do not redesign another person's module as incidental cleanup.
- Use shared services/types instead of parallel invoice, inventory, account or AI implementations.
- Coordinate schema, permissions, source ownership, route contracts and shared design changes before building dependents.
- Never run legacy startup/seed/migration scripts against production.
- Never use live credentials/data merely to make tests pass. Use isolated fixtures and sandbox accounts.
- Store secrets in approved environment configuration, never source or chat handoff.
- Treat real data imports, sends, payment actions, provider writes and production deployment as explicit operational steps, not incidental local tests.

### At the end of every session

1. Run relevant typecheck, lint/build and tests. Record failures honestly.
2. Commit coherent changes, push the task branch and open/update the review request.
3. Document changed modules, contracts, migrations and environment-variable names without secret values.
4. Update task status and append a handoff with what works, what is incomplete and the next safe step.
5. Leave shared/integration branches stable. Merge through the agreed review/check process.

Do not resolve conflicts by discarding the other builder's version wholesale. Reconcile intent, rerun affected checks and update the handoff. Database migrations are versioned and forward reviewed, never automatic startup schema pushes.

### Recommended repository documents

| File | Purpose |
|---|---|
| AGENTS.md | Instructions Codex follows in every session |
| docs/PROJECT_SCOPE.md | Repository copy of this agreed baseline |
| docs/PROJECT_STATUS.md | Current milestones, working features and known failures |
| docs/HANDOFF.md | Append-only session handoffs and next steps |
| docs/DECISIONS.md | Dated decisions with owners and superseded choices |
| docs/CONTRACTS.md | Shared records, API/event interfaces and source ownership |
| docs/PERMISSIONS.md | Role/action/resource matrix and sensitive grants |
| docs/INTEGRATIONS.md | Zoho/provider mappings, environments and verification status |
| docs/ACCEPTANCE.md | Cross-department end-to-end scenarios |

These files are recommended setup deliverables. They are not claimed to exist in a new repository yet.

### Session handoff template

```markdown
## Session YYYY-MM-DD / builder
Task / issue:
Branch / commit / review link:
What changed:
Modules and shared contracts affected:
Checks run and results:
Schema/environment changes (names only):
External actions performed, if explicitly authorized:
Known failures / unfinished work:
Decisions or blockers:
Next safe step:
```

## 17. Build phases and definition of done

| Phase | Deliverable | Completion evidence |
|---|---|---|
| 0. Shared setup | Repository, design baseline, permissions, provider ownership and handoff process | Both builders can pick up an issue from the recorded state |
| 1. Foundation | Login, multi-role shell, shared data, protected files, audit and durable jobs | Unauthorized access fails at API/files/search/AI, staging isolated |
| 2. Zoho vertical workflow | Invoice mirror, verified payment detection, manual release, one warehouse job and balances | Paid/unpaid/partial/duplicate-event scenarios pass |
| 3. Department core | Sales/owner views, collections, warehouse tracking, inventory visibility and production planning pilot | Staff complete representative daily workflows |
| 4. AI and marketing | Briefings, approved outreach, image studio, Assets publishing and selected communications | Source-based answers, approval enforcement and generation/publishing tests pass |
| 5. Portals/client services | Invoice access/payment links, tracking, reorder requests and selected client workflows | Customer/client isolation and source reconciliation pass |
| 6. Cutover | Current migration, file/history reconciliation and operational transition | Open work preserved, restore rehearsed, departmental signoff |
| Expansion | POS feeds, replenishment assistance, deeper forecasts and white-label offering | Scope separately selected against actual business value |

Phases describe dependencies, not fixed dates. Sales/owner UI can progress against agreed fixture contracts while shared connectors develop. AI starts early with validated facts. Do not retire Replit before essential sales, warehouse and cash/check functions work. No launch date or budget has been committed.

## 18. Required cross-department tests

- Rep A cannot retrieve Rep B's account, invoice, tracking, files, report or AI summary.
- Owner/sales manager creates an invoice in Zoho, and Dizzle mirrors it once.
- Unpaid/partial invoice stays outside warehouse by default.
- Verified full payment creates one job even after event replay.
- Authorized Push to Warehouse creates one job with reason and unchanged balance.
- Later payment on a manually released invoice creates no second job.
- Draft/void/credit-only or stale cases do not bypass release policy.
- Invoice edit after packing raises a review issue without erasing completed work.
- Shipping updates do not double-deduct Zoho stock or overstate shipped quantities.
- Partial packages preserve the remaining items and all tracking.
- Shipment confirmation reaches the correct recipient under the chosen sender policy; failures remain visible.
- Customer payment button opens only that customer's valid Zoho payment page.
- Marketing publishes an approved asset and authorized reps can find it.
- COA lookup respects product/batch and returns no match when appropriate.
- Unapproved outreach/WhatsApp content cannot send.
- Sync failures, ambiguous provider outcomes and stale data are observable.
- Migration/replay triggers no historical emails, stock movements or payment actions.

## 19. Migration and old-source treatment

Use the deployment-reported source archive as a reference. Selectively review Kanban/group logic, scanner patterns, UI primitives, PDF helpers and useful tests. Do not copy large route/storage monoliths or unsafe legacy auth, storage, cache, seed and simulated-label behavior. Old invoice-builder code is no longer a required new-app feature.

The older April-named SQL backup is incomplete for current migration. Obtain current approved data/file exports later. Preserve source IDs, employees/authors, account links, notes, invoices, warehouse jobs, groups, tracking and archives. Reconcile old invoice representations to authoritative Zoho records before analytics.

Trial in isolation with outbound effects disabled. Replit remains the sole operational writer during trial. Reconcile changed/deleted records and attachments, then use an agreed final write freeze. New Dizzle becomes sole operational writer after signoff. Zoho remains financial/inventory authority throughout. Preserve new deltas if rollback becomes necessary after new writes or external sends.

## 20. Later scope and explicit exclusions

Later candidates: advanced POS connections, autonomous replenishment under customer consent, full commission payout ledger, sophisticated forecasting, consignment operations and commercial white-label product packaging.

Excluded from current plan: QuickBooks, in-app invoice creation, independent card checkout, duplicate payment emails, a competing stock ledger, automatic unapproved outreach, invented financial accuracy, full payroll/tax engines and guaranteed WhatsApp group access. A deep link to Zoho is acceptable for financial/inventory administration under the agreed architecture.

## 21. Remaining setup decisions

1. Exact invoice origin, organization IDs/data centers and existing Invoice–Books–Inventory relationships.
2. Zoho stock-impact transaction timing and whether Dizzle writes shipment/tracking back.
3. Treatment of credits/write-offs, refunds and payment reversals for release.
4. Rep/customer/salesperson ID matching and commission attribution.
5. Warehouse stages, role transitions, dispatch policy and packaging/unit conventions.
6. Production BOM ownership, labor capture, QC authority and supported Zoho stock mappings.
7. WhatsApp account/group capability and initial portal scope.
8. Repository owner, active foundation lead, review/merge operator and deployment responsibility.
9. Retention, offboarding, backup recovery objectives, operating budget and cutover window.

Resolve these in the decision log as implementation reaches them. Do not reopen confirmed business choices or block unrelated useful work.

## 22. First shared development assignment

Agree repository structure and identity/Zoho/account contracts first. Then prove one vertical workflow: Zoho invoice, payment/exception release, warehouse card, tracking and source-backed dashboard. The sales manager owns the sales/owner experience over that foundation. The user leads marketing and coordinates the other proposed modules. Record each session so the next builder can continue without relying on private chat history.
