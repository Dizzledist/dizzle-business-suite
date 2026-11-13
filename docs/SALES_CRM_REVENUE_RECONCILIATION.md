# Sales CRM revenue reconciliation report

Prepared November 12, 2026 by Codex, the active implementation lead for Prompt #11. This is a synthetic development implementation and a live-test proposal. No live Zoho request was executed in this phase.

## 1. Feature branch and commit

Branch: `feature/sales-crm-revenue-reconciliation`. The separate worktree was created through the Codex worktree tool without resetting an existing branch. This report is committed with the implementation under the subject `Prepare synthetic revenue reconciliation and tenant binding`. Use `git rev-parse HEAD` in this worktree for its immutable revision. The user-facing report records the resulting commit after creation.

No push, merge, rebase, cherry-pick or deployment was performed. No long-running local preview was started.

## 2. Confirmed source

The parent is exactly `a81ddaed3e838e0a03256578b8faae3650d1e6b8` on `feature/sales-crm-management-parity`. Management remains pinned to `f8da43c294545cd3f04bcc063fc9c84ad64223c3`.

The eight CRM commits from `ebfe961` through `a81ddae` contain the dashboard, filters, read-only OAuth, persistent reporting, server sessions, email/password login, employee permissions, invoice details/lines/PDF, October coverage and Management profit adaptations. The original worktrees and reference Management checkout were preserved.

## 3. GitHub divergence and compatibility

Fetched remote heads. At inspection, `origin/main` is `928a45c488389dd89e5142aa81f6527096ae73d6` and `origin/feature/sales-crm-management-parity` remains `a81ddae`. Their common ancestor is `d4afc223d7313274ecea75f3655d2188abbbbbd6`. Parity has 8 exclusive commits and main has 17. The completed reconciliation branch adds one local commit to parity.

Main contains Marketing Workspace, publishing and shared Google Workspace identity work. The Warehouse draft was not incorporated here. No main changes were applied to the CRM worktree.

| Boundary | Compatibility work required before a future integration |
| --- | --- |
| Application routing | Review `server/api.ts`, `server/index.ts`, `src/App.tsx`, `src/styles.css`, `server/fixtures.ts`, `server/workflow.ts` and `shared/contracts.ts`. Preserve Sales guards and warehouse behavior while mounting Marketing routes. |
| Development and CI | Reconcile `scripts/dev.ts`, `vite.config.ts`, `playwright.config.ts`, `.github/workflows/checks.yml`, `package.json` and the lockfile. Main adds Marketing consumer lifecycle hooks, Sharp and Google dependencies. Keep the CRM Argon2 dependency and its four test modes. `shared/local-ports.ts` is changed from the common ancestor on both sides, but its content is identical between the inspected heads. |
| Identity database | Main uses `server/auth/001-shared-identity.sql` and an explicit operator migration. CRM uses the separate versioned `sales_*` identity schema, now version 3. Both use SQLite user_version, so never open one store with the other's migration loader. Preserve canonical employee IDs, teams, mappings, historical actors, password hashes and grants through a separately reviewed migration. |
| Sessions and APIs | Main uses `__Host-dizzle_session` and `/api/auth/*`. CRM uses `__Host-dizzle_sales_session` and `/api/sales-crm/auth/*`. Token generation, digest/CSRF conventions and lifetimes are related, but cookie names, exact origins, login and domain actor contracts differ. Cookies or Google claims cannot automatically grant Sales access. |
| Authorization | Main's explicit employee grants and worker authority do not replace CRM admin/manager/rep, team and invoice checks. Review domain adapters and revocation together. |
| Proposed Sales adoption | Main's `server/auth/sales-adoption-plan.ts` is a dry run requiring explicit canonical identity bindings and sign-off. It imports no password sessions and performs no migration. It does not authorize replacing the approved password system. |
| Configuration and shared policy | Reconcile `.env.example`, `.gitignore`, `AGENTS.md`, `README.md` and shared status, contracts, decisions, permissions and handoff documents. Keep credentials private and explicitly resolve the login-policy difference. |

These are source-level compatibility findings, not the result of executing a merge. Main's older documentation includes historical inspection states. The Git references above establish the current comparison. Joint identity and department integration review remains required.

## 4. Existing CRM regression results

The unmodified source baseline was rechecked with TypeScript, 224 Vitest tests and the build. Its prior checkpoint documented 27 Chromium checks. The completed implementation passed TypeScript, the build, 263 Vitest tests across 17 files and 28 Chromium checks, including all existing browser modes.

The suite exercises the dashboard, shared calendar, protected invoice details and synthetic PDFs, password setup/login/change/revocation, administrator directory, manager/rep scopes, mocked Zoho OAuth/GET restrictions and original warehouse release workflow. These results support the tested paths. They do not verify a production deployment or live financial data.

## 5. First-email timestamp investigation

Official documentation exposes invoice details and `GET /invoices/{invoice_id}/comments` under invoices.READ. History includes event IDs, operation/type and date/time fields. Marking sent and emailing are distinct operations. The inspected examples and descriptions do not establish an unambiguous first-success event contract, timezone guarantees, delivery semantics or historical retention sufficient for accounting. A boolean email flag cannot identify the first successful send. Failed attempts, resends and changes must be compared with independently verified send records. [Official invoice API](https://www.zoho.com/inventory/api/v1/invoices/)

Implemented independent send and amount evidence checks store candidate/value, source, type, reference, source event ID, verification state/time and notes. Send evidence additionally requires attested success and first-send flags. Verified input must have an exact timestamp with a timezone, a review timestamp, provenance and notes. Unknown event labels remain pending. These validations check consistency of a trusted review; text notes or flags alone are not an independent proof of provider success.

The source observer preserves raw date/time components without inventing an offset. A known organization's timezone can support a documented manual review, but DST ambiguity must be resolved before verification.

## 6. Original subtotal verification

Current invoice fields do not prove their values at first send. The inspected API does not establish an accessible original revision in this workflow. The proposed test must establish a historical source independently. A current PDF cannot, by itself, establish an original sent version. [Official invoice fields](https://www.zoho.com/inventory/api/v1/invoices/)

The implementation separately gates original amount verification. Pending, unavailable or conflicting evidence excludes an invoice from recognized totals, even when send evidence is verified. A review must agree exactly with the claimed original amount and first-send instant. Conflicting later attestations hold reporting while retaining the original stored facts.

No live historical amount has been verified in this phase.

## 7. Original line-item findings

The existing structured parser and current line tables are retained. A proven original line revision must match the supplied source revision, precede or equal the first send, and reconcile to the original subtotal. Once captured, recognized lines and the normalized original document snapshot are frozen. That snapshot preserves available quantities, discounts, adjustments, shipping, tax fields and source salesperson context.

Current payloads remain separate and can change with payment or edits. A later current document is never relabeled as the original. Legacy records without a proven original revision keep missing snapshots and line availability indicators. Original discounts, adjustments, quantities or attribution cannot be reconstructed from a current invoice merely because it has the same number.

## 8. Reconciliation implementation

Administrator password sessions can open `/sales/reconciliation`. The backend serves `GET /api/sales-crm/reconciliation` only for an authenticated password administrator of the synthetic `demo-o1` tenant. Manager, rep, fixture-header and cross-tenant attempts are rejected. The local application already rejects production mode. Data remains in the existing reporting database.

The interface reuses Month to Date and the existing calendar filters. It compares creation date, invoice date, verified first email and candidate, current subtotal/total/balance/status, frozen original subtotal and credit, recognition periods, both revenue methods, independent verification and supported difference reasons. Pagination and per-currency totals are included. Currency changes flag conflict and never relabel the frozen original.

Reasons are assigned from explicit evidence. For example, a changed subtotal plus a later modification proves a financial change, while a modification timestamp alone could reflect a payment. Explicit shipping/tax and discount/adjustment fields support their categories. An unexplained total difference remains an amount-basis difference without an invented tax allocation.

Evidence history is append-only in this application path. No browser endpoint can submit recognition attestations, modify invoices or call arbitrary provider URLs.

## 9. Management versus CRM results

The existing fixtures and captured Management reference are unchanged.

| October synthetic invoice | Management revenue | CRM revenue | Supported explanation |
| --- | ---: | ---: | --- |
| INV-FIX-5001 | USD 0 | USD 100 | September invoice date, first verified email in October |
| INV-FIX-5002 | USD 126 | USD 100 | Current final total differs from verified original subtotal |
| INV-FIX-5003 | USD 108 | USD 100 | Different amount bases, current partial settlement |
| INV-FIX-5004 | USD 100 | USD 0 | Missing first-email and original-amount evidence |
| INV-FIX-5005 | USD 80 | USD 0 | Emailed draft admitted by the reference method, CRM remains unverified |
| INV-FIX-5006 and 5007 | USD 0 | USD 0 | Void or not emailed |

Totals remain Management **4 invoices / USD 414**, CRM **3 invoices / USD 300**, difference **USD 114**. The bridge is -100 + 26 + 8 + 100 + 80 = 114. No unsupported tax breakdown is asserted.

The Management method reproduces its date cutoff, current final total, emailed gate and void exclusion. Existing CRM settlement review holds remain intact. Ordinary unpaid/partial/paid status is tracked independently of original sales amount.

## 10. Tenant mapping

`demo-o1` is the existing synthetic tenant constant and reporting dataset. It is an internal CRM identifier, not a Zoho organization ID. The administrator's membership was not changed.

Prepared `GET/PUT /api/sales-crm/auth/admin/zoho-binding` inside the existing password authorization layer. A server policy must name an approved non-demo tenant and approval reference using `SALES_ZOHO_TENANT_ID` and `SALES_ZOHO_APPROVAL_REFERENCE`. Both remain unset. The provider organization is fixed to `821729823`.

The backend verifies an active password administrator, exact tenant, approval reference, Origin/CSRF and expected revision. Browser-provided tenant/organization overrides are rejected. A database unique constraint prevents two active bindings to this provider organization. Approve/revoke events retain actor, tenant, organization, revision, reference and time in the existing audit. Every response reports `liveAccess: false`. These metadata routes do not activate a connector or financial access.

Proposed migration, requiring separate approval:

1. Select a canonical real tenant and verified administrator membership. Preserve existing demo users, IDs, password credentials, sessions, teams, mappings and audit. Never mass-update `demo-o1`.
2. Choose an explicitly isolated live identity store or design an additive, audited membership migration within the approved identity architecture. The current bootstrap is globally first-admin-only, so it cannot provision a second tenant into an established store. A versioned operator workflow and rollback must be reviewed first.
3. Apply reviewed migrations to a private copy, validate counts/references and test restore. Do not change the current administrator account to bypass bootstrap.
4. Approve the server mapping and, in a later phase, wire every live query/document to both internal tenant and provider organization. Tenant mapping alone never authorizes a sync.
5. Re-run cross-tenant, role, session-revocation and PDF guards before exposing any real record.

The bounded operator verification below can remain outside CRM reporting. Its approval would not approve a tenant migration, dashboard activation or import.

## 11. October 1 import design

This is a design, not an active import. Reuse `ReportingSync`, its queue/state/lease tables and the existing GET reader.

- Discover candidate IDs across the authorized invoice population, with a separately approved page/request budget. Never filter discovery solely by creation date or invoice date. A September invoice may have its first qualifying email in October.
- Treat email flags and source update dates as discovery hints. Fetch historical evidence for candidates, retain unresolved older invoices and prove first success before inclusion. Compare verified instants to **2026-10-01 00:00 America/Los_Angeles**, which is **2026-10-01T07:00:00Z**.
- Keep the existing organization-plus-external-ID keys, immutable credit/snapshots and exact decimal amounts. Maintain current settlement separately. Do not deduplicate by display number or email event count.
- Use controlled page sizes, durable discovery checkpoints and transactional enqueue/upsert/ack. Existing lease and queue machinery provides the foundation for restart and concurrent-run exclusion. Add a persistent evidence-review queue before live activation.
- An approved future worker may use bounded GET retries with backoff/jitter and Retry-After handling. Refresh through Accounts using the encrypted grant. Persist safe failures and resume from checkpoints. Token, 401 and rate-limit failures must never imply a successful read or recognition.
- Use overlapping incremental scans with idempotent IDs to tolerate source edits and unstable pagination, plus periodic separately budgeted reconciliation. Do not advance a complete checkpoint past unfinished discovery/evidence.
- Missing history, timezone ambiguity, absent revisions, unmapped credit and currency conflicts stay pending/unavailable/conflicting with provenance. Later corroboration/backfill can resolve them without rewriting a captured original.
- Keep live records out of the synthetic dataset. The current CRM report deliberately excludes the external organization until tenant-aware live serving is reviewed. Do not remove that guard as a shortcut.
- PostgreSQL remains a separate production proposal. Review tenant keys, exact numeric precision, evidence/audit JSON, leases, isolation/locks, backup/restore and a validated copy/cutover plan. No production schema or data migration was executed.

Profit utilities are unchanged. Preserve exact line reference > item ID > SKU > name only without stronger identifiers, unknown-cost warnings and weighted margin over the costed subset. Proposed cost history needs tenant/provider/product identity, unit, currency, verified cost, effective interval, evidence/approver, nonoverlap checks and a per-recognized-line cost reference. Cost date and recost policy need accounting approval. No unknown cost becomes zero and no live profit display was activated.

## 12. Exact three-invoice proposal — approval required

**No test invoices have been selected through an API, and none of these calls has run.**

Select A, B and C manually in the existing Zoho UI. Copy only each numeric invoice ID from its URL, confirm organization `821729823`, and identify an independently known original send record. A should first have been emailed in October 2026, B should have a resend, and C should have a documented edit after first send. Do not send, edit, mark sent or create records to produce examples. If unavailable, report which case cannot be demonstrated.

All paths below are relative to the already configured, validated regional `ZOHO_API_BASE_URL`, including its `/inventory/v1` prefix.

| # | Method and exact path | Purpose |
| --- | --- | --- |
| 1 | GET /organizations | Confirm the authorized organization list includes 821729823 |
| 2 | GET /invoices/{A}?organization_id=821729823 | Current A fields and lines |
| 3 | GET /invoices/{A}/comments?organization_id=821729823 | A's available history |
| 4 | GET /invoices/{B}?organization_id=821729823 | Current B fields and lines |
| 5 | GET /invoices/{B}/comments?organization_id=821729823 | B's available send/resend history |
| 6 | GET /invoices/{C}?organization_id=821729823 | Current C fields and lines |
| 7 | GET /invoices/{C}/comments?organization_id=821729823 | C's available send/edit history |

The organization read uses settings.READ. [Official organizations API](https://www.zoho.com/inventory/api/v1/organizations/)

Keep exactly the existing grant scopes:

```text
ZohoInventory.invoices.READ,ZohoInventory.contacts.READ,ZohoInventory.items.READ,ZohoInventory.settings.READ
```

No contacts/items reads are proposed. No new scope is requested. The fixed plan helper validates exactly three unique numeric IDs and creates seven GET descriptors. It has no executor or browser route.

The later approved runner must enforce **at most seven Inventory attempts total**, including failures. It must disable ordinary automatic retries and 401 replay for this run, abort on organization mismatch or unexpected behavior, and make no discovery, history-page follow-up, payment, PDF or item requests. Validate/refresh the existing encrypted grant before the Inventory budget, with only the required Accounts token exchange if approved. If a response is incomplete or rate-limited, report it and request a new bounded plan. The current general reader's automatic retry behavior must not be used unchanged for this seven-attempt test.

Proposed private retention: selected IDs, matching organization ID, normalized current financial/line fields needed for comparison, history event identifiers/operations/source times, observation time and sanitized corroboration references/notes. Keep success, original amount, original lines and original credit assessments separate. Strip customer names, addresses, recipients, free-form personal content and irrelevant organization details before persistence. Protect any temporary raw response in private operator storage and discard it after extracting approved evidence. Retention duration and the private output path must be agreed before execution. No raw responses, tokens, secrets or customer data belong in Git, browser reports or chat.

Compare API events against existing independently verified Zoho send evidence and, for C, an original sent copy or trusted revision. A resend label does not prove the original send. A missing event does not prove an invoice was never emailed. A single bounded response cannot establish archival completeness. If required evidence is unavailable, retain the appropriate unverified state.

No Zoho data would be modified. Approval must name the three IDs and these seven reads. It does not authorize more calls, import, mapping activation or financial reporting.

## 13. Test results

| Check | Final result |
| --- | --- |
| TypeScript | Passed |
| Vitest | 263 passed, 17 files, 0 failed, 0 skipped |
| Build | Passed |
| Chromium | 28 passed: disabled 4, fixture 9, session 7, password 8 |
| Final password/browser rerun after currency display change | 8 passed, included in the 28-mode total |
| Existing parity capture/fixtures | Preserved; existing parity tests passed |
| Live Zoho / history / original PDFs | Not executed, awaiting separate approval |
| Real administrator login or account change | Not executed; credentials and existing database untouched |
| Marketing/main regression | Not executed on this branch; no main integration performed |
| Lint | No lint script configured |

An initial new test failed because its malformed timezone candidate had no valid October date and its invoice date was in September. The test now selects an explicit September–October range and verifies rejection without inventing a date. Final checks passed. Node's SQLite experimental warning remains.

New coverage includes independent evidence states and bad attestations, September creation/October first send, cutoff timezone boundary, duplicate/replayed/older payloads, resend/failure ambiguity, immutable original amounts/lines/credit, current-currency changes, settlement states, shared presets, per-currency parity, tenant binding, CSRF, revision conflicts and protected reconciliation access. Existing security and warehouse suites remain in the run.

## 14. Files changed

- `.env.example`
- `server/index.ts`
- `server/sales-crm/auth/routes.ts`
- `server/sales-crm/auth/store.ts`
- `server/sales-crm/auth/zoho-binding.ts`
- `server/sales-crm/auth/migrations/003-zoho-binding.sql`
- `server/sales-crm/reporting/database.ts`
- `server/sales-crm/reporting/evidence.ts`
- `server/sales-crm/reporting/invoice-details.ts`
- `server/sales-crm/reporting/model.ts`
- `server/sales-crm/reporting/reconciliation.ts`
- `server/sales-crm/reporting/routes.ts`
- `server/sales-crm/reporting/migrations/003-revenue-evidence.sql`
- `server/sales-crm/zoho/validation-plan.ts`
- `shared/reconciliation.ts`
- `src/sales-crm/Reconciliation.tsx`
- `src/sales-crm/Reporting.tsx`
- `src/sales-crm/SalesCrm.tsx`
- `src/sales-crm/styles.css`
- `tests/browser/password-auth.spec.ts`
- `tests/password-auth.test.ts`
- `tests/reporting-database.test.ts`
- `tests/revenue-reconciliation.test.ts`
- `docs/SALES_CRM_REVENUE_RECONCILIATION.md`
- `docs/PROJECT_STATUS.md`
- `docs/DECISIONS.md`
- `docs/CONTRACTS.md`
- `docs/HANDOFF.md`

No dependency upgrade, OAuth client/reader/token change, private configuration change or separate Management repository change.

## 15. Database migrations

Reporting 003 adds independent evidence states/documents, current/original normalized snapshots and append-only evidence review history. Existing attested recognition states are retained for compatibility. Migration does not invent historical snapshots or review timestamps. Legacy attestations remain explicitly labeled and require fresh review before any live use.

Identity 003 adds a constrained, audited provider binding table. It does not update employee records, password hashes or sessions. Migrations were exercised only on in-memory or isolated temporary test stores. No existing administrator, Zoho grant, production database or existing reporting database was migrated.

## 16. Remaining blockers

Historical event success semantics, timezone/retention and original sent revision evidence remain unverified. Real tenant/membership and activation policy, minimized retention settings, bounded runner budget enforcement, original salesperson mapping and future cost-history policy need review. Main integration requires the compatibility work above.

Scoped changed-file review found no private environment file, database, token store or real credential added. This is not a repository-wide secret-history certification.

## 17. Production readiness

Ready for local review and preparation of the separately approved three-invoice verification. **Live invoice synchronization and financial reporting are not ready.** The code intentionally has no live reconciliation dataset or active live tenant access.

## 18. Next implementation step

Select the three existing invoices and approve the exact seven-read plan with private retention details. Then implement the capped operator runner with mock budget tests, perform only those approved reads using the existing encrypted grant, and compare independently known send/original-revision evidence. Resolve any gaps before approving a real tenant migration or a broader discovery/import budget.
