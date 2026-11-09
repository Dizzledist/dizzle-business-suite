# Repository conventions

## Baseline and current boundary

Read [README](README.md), [project scope](docs/PROJECT_SCOPE.md), [status](docs/PROJECT_STATUS.md) and the latest [handoff](docs/HANDOFF.md) at the start of every session. The scope is the agreed business baseline; record subsequent explicit decisions in [DECISIONS](docs/DECISIONS.md) with source, date and superseded rule. Do not silently resolve contradictions.

Phase 0 documentation was merged in PR #1. The user's November 6 Phase 1 task authorizes a minimal local React/TypeScript app and API with synthetic invoice/payment/warehouse fixtures, API-enforced test identities, isolated tests and PR CI. This supersedes the earlier scaffolding hold for this scoped task only. No live Zoho, production infrastructure, real identity provider, outbound sends, department dashboards or marketing Assets belong in this task. See [local demo](docs/LOCAL_DEMO.md) for run commands, fixture assumptions and acceptance coverage.

Current task supersession, November 9: Phase 1 PR #3 is merged. Cheddr authorizes a separate marketing branch/worktree and coordination for parallel sales/marketing development toward one permission-aware app. This session is branch setup and documentation only; the earlier task-bound marketing exclusion does not prohibit this workstream. See [marketing workspace](docs/MARKETING_WORKSPACE.md) for ownership, shared-review boundaries and the next implementation slice. Reuse reviewed shared identity/services; do not infer that the unmerged Sales CRM or Warehouse branches are already on main. No live integration, merge or deployment is part of this setup.

Later November 9 implementation supersession: Cheddr supplied the Marketing Workspace build prompt and requested completion of the existing prototype on `feat/marketing-workspace`, draft PR #5. This authorizes fixture-backed marketing home, calendar/campaigns, sample image studio, review, internal Assets publication and rep consumption, shared local identity/navigation adjustments, focused tests and documentation. It supersedes the setup-only boundary for this task. Follow [marketing demo](docs/MARKETING_DEMO.md); keep real generation, external publishing/sends, production storage, Sales CRM/Warehouse integration, merge and deployment separate.

## Builder responsibilities

| Area | Lead and coordination |
|---|---|
| Sales rep, sales manager and owner dashboards | Sales manager; owner reviews business definitions |
| Marketing, image studio and Assets publishing | User / Cheddr marketing manager; sales manager reviews rep consumption |
| Identity, account assignment, Zoho invoice/payment and warehouse release contracts | Shared review by both builders; appoint one active implementation lead per task |
| Warehouse, production, operations and client services | User coordination is proposed by scope; confirm individual assignments before implementation |
| Review and merge | Cheddr (Marketing / Admin) is the designated merge operator; merge is a separate step for Cheddr |
| Phase 1 foundation | Cheddr (Marketing / Admin) is the designated Phase 1 lead; scaffolding requires a separate task |
| Deployment | Operator remains to be appointed; never infer deployment authority from build ownership |

Build ownership does not confer employee permissions. Review [CONTRACTS](docs/CONTRACTS.md) and [PERMISSIONS](docs/PERMISSIONS.md) together before dependents. Amend shared interfaces explicitly and identify affected consumers in the PR. Do not create parallel auth layers, Zoho connectors, account ownership logic or stock ledgers.

## Repository and implementation conventions

- Use one modular application. The local implementation uses React/TypeScript, Vite and a Node/TypeScript API with in-memory fixtures. PostgreSQL, durable worker, private storage and provider hosting remain proposals, not installed infrastructure. Test identity selection is local-only and must never be deployed as authentication.
- Proposed boundaries are identity, accounts, zoho-sync, finance-views, fulfillment, production, client-services, marketing, assets, ai, notifications and customer-portal. Shared contracts and UI have one maintained implementation. Directory layout is not yet approved.
- Zoho owns invoice creation/edits, payments, accounting and inventory. Only owner and sales manager create invoices in Zoho; Dizzle admin status alone does not authorize that.
- Enforce access on the server for APIs, files, search, reports and AI. Reps see assigned records only. Department switching grants no authority.
- Payment verification and one-job release are deterministic domain logic; AI and payment-page returns cannot establish payment. Use source provenance, freshness, idempotency and audit history.
- Keep secrets and real customer data out of source and handoffs. Use isolated fixtures/sandbox accounts. Never run old seeds, migrations or startup scripts against production.
- Production migrations must be versioned and reviewed; no startup schema pushes. Provider writes, migration imports, external sends and deployment are separately authorized operational steps.
- Outreach requires named approval of actual recipients/content; approved routine shipment confirmations and Zoho-owned invoice messages follow their distinct policies.

## Git and session rules

1. Inspect branch, working tree and remotes before editing. Fetch current origin and branch from the agreed integration branch (currently main). Preserve all unrelated changes. Use separate worktrees/clones for overlapping sessions.
2. Claim one scoped task in status/handoff (or its issue), name the active lead, modules, dependencies and review needs. Use task branches and focused commits; do not develop directly on main.
3. Keep the local `dizzle-business-suite.code-workspace` file untracked and out of commits. Stage named task files rather than all changes.
4. During work, distinguish confirmed rules, proposed implementation choices and unverified provider behavior. Resolve only decisions needed for the task; do not reopen confirmed policy.
5. Review the diff and internal links for documentation changes. Run available typecheck/lint/build and relevant tests when code exists. Record exact outcomes and unavailable checks honestly.
6. Update status and append a dated handoff with changed contracts, checks, incomplete work and next tasks for each builder. Include environment variable names only, never values.
7. Commit coherent work, push the task branch and open/update a PR against main. Keep this Phase 0 PR a draft for shared review; leave main unchanged. Future merges follow the agreed review/check process.

### Handoff entry

Use the template in [HANDOFF](docs/HANDOFF.md). Record branch, commit or stable Git reference, review link when available, external actions actually performed, blockers and next safe steps. Preserve earlier entries; append corrections and later outcomes rather than rewriting history.
