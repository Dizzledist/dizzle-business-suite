# Historical invoice evidence and operational reporting

Implementation branch: **feature/sales-crm-historical-evidence**. Starting point: documentation commit **9658353**, containing runtime commit **844e779** and the previous Sales CRM feature chain. Reference Management source remains **f8da43c**. This guide describes Prompt #12's local, synthetic implementation.

## Authorization boundary and prior findings

The previous seven-request diagnostic completed successfully at the transport level. It comprised one exact-number lookup and three invoice detail/history pairs; the organization-list request was replaced with the lookup by the user's approval. It was not a comprehensive historical audit.

The three histories contained two, three and four entries respectively, with one email-related claim each. Their local candidate times had minute precision, no explicit offset and no independently established first-success semantics or completeness guarantee. They were November examples. The requested October case, resend case and financial-edit case were not established. A later generic update in one example did not prove a financial revision. Send verification remains **pending**; original amounts are **unavailable in the tested responses**. This does not prove that original evidence is unavailable elsewhere. See [the prior checkpoint](ZOHO_CONTROLLED_VERIFICATION.md).

This task made **zero additional live Inventory or Accounts requests**, retrieved no real email/PDF, ran no historical import and enabled no live report or binding. Public documentation research and a read-only local Management source audit were used. Private diagnostic files were not copied into the new worktree. No changes were made to existing secret configuration, refresh grant, administrator or production stores.

## Evidence-source assessment

| Source | What it might establish | What remains to verify |
|---|---|---|
| Invoice comments/activity | A recorded action, candidate time, reference and later modifications | Successful acceptance, earliest event, timezone, completeness/retention and original values. The previous limited responses did not establish these. |
| Organization configuration | A configured organization timezone | Actual value for organization 821729823, historical timezone changes, and whether invoice history is rendered in that zone or a viewer's zone |
| Zoho System Mails | An additional mail-action record for supported automated messages | Whether manually sent invoices are covered, accepted-vs-attempt semantics, original-send correlation and retention |
| Activity Logs / Audit Trail | Candidate old/new values and revision actions | Account availability, export completeness, whether enough structured fields survive to reconstruct the first-sent revision |
| Original EML / mail archive | Message identity, headers and an attached original revision when retained | Authentic origin, trustworthy transport evidence, invoice/organization identity, earliest-send completeness and archive access |
| Original attached PDF | Original displayed subtotal and line content when independently linked to the original send | Chain of custody, completeness, original revision linkage, structured quantities and salesperson evidence |
| Current PDF or current API detail | Current displayed values and current line items | It cannot alone establish what the customer originally received. No real PDF was retrieved. |
| Sending-service/server logs | Accepted message/event identity and timestamp, if the real sending provider retains them | Provider semantics, authenticated event origin, correlation and proof that an earlier successful send is not omitted |
| Delivery / open records | A later delivery or opening event | They do not establish the original send time or original amount |
| Management database backups / exports | A historical revision if an independently dated copy was actually retained | Existence and provenance of those copies. No Management database was connected. |
| CRM original snapshots | Frozen synthetic first-send recognition and original lines already captured by the trusted recognition path | They are not historical proof for live invoices that were never captured. |
| Source-control revisions | The evolution of calculation and integration code | Git history is not evidence of historical invoice business values. |

Zoho documents System Mails and an Activity Logs/Audit Trail report with old/new change information. Their applicability and retention for this organization's records remain untested. No equivalent historical-revision API has been established here. [Official activity-report documentation](https://www.zoho.com/us/inventory/help/reports/activity-reports.html)

A sent-action claim is different from a documented sending-service acceptance. Delivery and opening occur later; a resend must not replace an earlier successful event, and a modification must not rewrite the original amount. Zoho's Email Insights describes opening timestamps and distinct sent/open icons. It is not proof of the first successful send. [Official email documentation](https://www.zoho.com/us/inventory/help/settings/emails.html)

An email Date header records message origination/preparation, not SMTP acceptance. A correlated successful SMTP completion after DATA establishes responsibility for onward delivery/relay, which is still different from final delivery or opening. Retained, authentic transport evidence can corroborate sending; an isolated header or screenshot does not prove completeness. [RFC 5322 §3.6.1](https://www.rfc-editor.org/rfc/rfc5322), [RFC 5321 §4.2.5](https://www.rfc-editor.org/rfc/rfc5321)

Original amount recovery is **conditionally feasible**, not confirmed. Prefer a genuine original message with its attachment and independent send log, or a complete archived structured revision. Preserve original bytes/digests, tie identity and revision to the first successful event, corroborate the subtotal separately, and retain contradictions. A current subtotal, generic edit event, PDF generation date, or an absence of later edits is insufficient. Manual attestations require recorded sources and review; they do not automatically promote recognized revenue.

## Source-clock interpretation

Zoho exposes a time_zone field and documents an organization-detail GET under settings.READ; examples use an abbreviation. The actual organization's setting was not requested in this task. The docs do not establish that the previously tested comments' local time is the organization zone rather than a viewer-rendered time. [Official organization API](https://www.zoho.com/inventory/api/v1/organizations/), [Official invoice API](https://www.zoho.com/inventory/api/v1/invoices/)

**Organization 821729823's source-history timezone remains unverified.** The CRM's America/Los_Angeles calendar is a reporting policy, not evidence of the source clock.

SourceClock stores raw text, proposed source IANA timezone, candidate instants, interpreted instant or null, verification state/reference, precision and explanation. It does not substitute invoice creation/date for email time.

- No verified timezone/reference: preserve raw text, keep interpretedAt null.
- Invalid/ambiguous abbreviations such as PST/CST: reject normalization.
- Spring-forward gap: conflicting; no possible instant.
- Fall-back fold: both UTC candidates remain pending until a corroborated offset selects one.
- Explicit offset conflicting with the independently verified zone: conflicting.
- Minute-only values remain minute precision, pending for exact-instant recognition. The implementation does not invent seconds.
- A verified clock is not proof of successful sending. First-success and earliest-event claims require their own evidence.

Tests include Los Angeles's 2026 spring gap/fall fold, October cutoff, a different source zone and explicit-offset conflicts. A future organization-setting read still needs corroboration of history rendering and historical settings.

## Synthetic administrator evidence registry

The flag SALES_HISTORICAL_EVIDENCE_ENABLED defaults to false. It is confined to the existing local/test Sales CRM and requires the existing password-authenticated administrator. No preview configuration was silently changed.

New reporting migration 004 adds two tables to the **existing reporting SQLite database**: reporting_documents and reporting_document_reviews. Existing invoice recognition, line and snapshot tables are not rewritten. This task exercised migrations only against synthetic stores. Deploying any migration to a real store requires its own review.

Registration selects an existing server-owned synthetic artifact for a matching invoice. The catalog simulates nine evidence types, including original/current PDFs, original email, archived revision, verified export, acceptance, delivery, opening and manual record. All are PDF fixtures, not an EML parser or a live archive adapter. Some sample invoices have no artifact. There is no arbitrary file upload, URL fetch, filesystem path or provider proxy.

Documents are tenant/invoice keyed, stored privately in the reporting database, and associated with provenance, registrar/date, SHA-256 content and manifest digests. Duplicate registration is idempotent. Review/download rechecks integrity. The existing authenticated PDF response path sends private, no-store content. Existing Vite deny rules and Git exclusions cover the private reporting/identity directories.

Registration always starts **pending**. Send and original-amount reviews are independent and append-only through the API. The backend records the authenticated reviewer/time; callers cannot supply those fields. Optimistic revision checks reject stale reviews. Identity, provenance and independent corroboration are mandatory for verification. Send approval also requires an acceptance-type artifact, corroborated earliest success and a verified clock; delivery/open/current-PDF artifacts cannot substitute. Amount approval requires an original revision and a matching corroborated subtotal. A current PDF cannot verify an original amount.

Evidence reviews do **not** update recognition, credit, original snapshots or commissions. A separately reviewed promotion workflow remains future work. Synthetic integrity hashes detect changed content; they do not establish real-world truth or provide encrypted/WORM production storage. Real document ingestion will need type/size validation, malware review, retention/access policy, managed encrypted private storage and backup controls before activation.

Local routes, all guarded by the feature flag and active password administrator:

| Route | Method | Purpose |
|---|---|---|
| /api/sales-crm/evidence?source=synthetic&invoiceId=... | GET | Tenant-scoped sample catalog and review records |
| /api/sales-crm/evidence | POST | Register a fixed synthetic artifact |
| /api/sales-crm/evidence/{id}/reviews | POST | Append a field-specific review |
| /api/sales-crm/evidence/{id}/document?source=synthetic | GET | Protected fixture PDF |
| /api/sales-crm/reporting-methods?source=synthetic&basis=verified-or-operational&... | GET | Separate reporting method and metadata |

POSTs require the existing same-origin session/CSRF protection. Unknown/duplicate source or organization selectors are rejected. These are **CRM database operations**, not Zoho write endpoints. Zoho client/scopes/transport are unchanged.

## Separate reporting methods and dashboard behavior

The optional administrator dashboard defaults to **Verified Sales** and preserves the original dashboard graph, date controls, comparisons, invoice drill-down and PDF viewer. The original Reports page stays on its existing verified service. Other employee views and the flag-off application keep their existing behavior.

| Definition | Verified Sales | Operational Sales: Dizzle Management Method |
|---|---|---|
| Recognition date | First independently verified successful email instant in the reporting calendar | Current invoice date |
| Amount | Verified original subtotal | Current final invoice total, including the source's tax/shipping/discount/adjustment effects |
| Eligibility | Existing evidence, original recognition, credit and settlement rules | Emailed=true, non-void, valid invoice date on/after October 1 and not after today, within selected range |
| Status grouping | Existing official Open/Closed settlement rules | paid is Closed; every other nonempty status is Open; All retains eligible unknown status |
| Original revisions | Frozen | Current source copy can change operational totals |
| Commission effect | Existing official policy is preserved | Excluded from official commissions |

Management's reference intentionally includes emailed non-void drafts and partially paid invoices under its status rules. The implementation reuses managementQualifies from reconciliation and the current stored snapshots. Amounts are exact integer units and grouped by currency; currencies and methods are never added together. No new profit or commission calculation is enabled.

The October parity fixture remains **Verified: 3 invoices / USD 300.00; Operational: 4 / USD 414.00**. Operational Open is 3 / USD 288.00 and Closed 1 / USD 126.00. The September invoice first emailed in October illustrates why the methods select different cohorts. These are synthetic reference values.

Both modes show basis, recognition/amount definition, shared selected dates/timezone, last successful sample sync, last observation, coverage and verification wording. Month-to-Date remains the default; existing quarter/year/custom choices are reused. Changing modes retains dates. The selector does not turn live access on.

Pre-baseline, unfinished sync or missing current snapshots produce a coverage warning and unavailable operational totals, not zero revenue. Verified totals are the independently verified subset; unresolved records and incomplete coverage are disclosed. An all-pending verified cohort has unavailable method totals. The operational table displays at most 20 sample rows while totals use all qualifying snapshots.

## Prospective capture: implementation and proposed adapter

prepareProspectiveCapture is a **pure preparation function**, with synthetic tests only. There is no new webhook receiver, listener, worker, mail integration or scheduled poll. It accepts a trusted adapter's explicitly verified first-success receipt, a separately verified source clock and an independently established original structured revision.

The gate rejects identity mismatch, status-only events, delivery, opening, resends, modifications, unverified first-event semantics, missing clocks, missing original lines/revisions, or amounts/currencies inconsistent with the snapshot. It emits an organization/event key, snapshot digest and the existing RecognitionEvidence contract for review. Tests apply the plan to an isolated database twice and then apply later edits, confirming deduplication and frozen original amount, line quantities and salesperson credit.

A future adapter must authenticate provider event provenance, validate schema and bound size, retain original payload and source clock/offset evidence privately, correlate organization/invoice/event/revision, and prove earliest successful acceptance. Merely fetching the current invoice after notification does not prove the original revision: a concurrent edit could already exist.

Proposed ingestion: durable private receipt inbox with unique provider+organization+event identity; canonical content hash; replay protection; tenant binding validation; lease/retry/checkpoint queue; independent evidence checks; transactional recognition plus acknowledgement using existing invoice uniqueness. Contradictory earlier events become review cases rather than silently moving frozen revenue. Resends never count again. Historical credit remains captured, not reassigned on later employee mappings.

Zoho's general workflow/webhook documentation supports evaluating notification mechanisms, but a specific first-success payload/retention/revision guarantee was not established. A status-SENT trigger is insufficient. Read-only polling can detect changes but cannot by itself prove first acceptance or reconstruct an earlier revision. Archive-assisted capture may work if the real provider retains an original receipt/revision. [Official automation documentation](https://www.zoho.com/us/inventory/help/settings/automation.html)

## Tenant-mapping readiness

The existing binding foundation remains inactive. No demo-o1 association with live organization 821729823 was created. Every new endpoint requires an active password session, administrator role, demo tenant and explicit synthetic source. Reps/managers cannot use these administrator endpoints. Their existing reporting endpoints continue to apply current tenant/rep/team scope, including revocation on each request.

The existing binding API supports policy-fixed non-demo tenant/organization association, administrator approval reference, revision checks, CSRF and audited approve/revoke. It still reports liveAccess=false; approving a policy record alone does not enable this synthetic implementation or import.

Before live access: establish an approved canonical real CRM tenant and independently reviewed employee memberships, preserve existing administrator access through a separately authorized migration, verify the fixed external organization under the operator, review salesperson mapping/credit, record the approval reference and explicit source-store policy, then independently approve a bounded adapter test. The first-administrator bootstrap is not a general tenant-provisioning workflow. Do not repurpose demo accounts or create default employees.

## Two future October import designs — neither executed

Shared prerequisites: reviewed real-tenant mapping and read adapter; private storage/retention; approved endpoint/record/request budget; rate-limit and retry policy; honest coverage metadata. Use organization+invoice IDs for deduplication, durable checkpoints and leases, bounded batches, retry queues, source revisions and per-basis coverage. Backfills explicitly extend coverage; they do not erase original proofs or recalculate frozen historical credit.

**Operational import:** stage approved current invoice summaries/details in a live store separate from synthetic fixtures. Select by invoice date >= October 1, 2026 and <= today; apply Management eligibility and current final total; preserve separate operational credit/provenance and observation time. Resume checkpoints idempotently and retain current observations/revision history as designed. Updates may change operational totals but never the official original snapshots. Flag incomplete pages/ranges and missing detail as unavailable/partial. A future explicit pre-October operational backfill must change declared coverage; it is not included automatically.

**Verified import:** discover the cohort by potential first-send evidence, not solely by invoice date/creation date. Stage proof and original revision separately; review raw clock, timezone, success/first-event completeness, original subtotal/lines and historical salesperson. Pending/unavailable/conflicting fields stay in reconciliation and do not count as verified sales. Only independently sufficient evidence enters the existing immutable recognition path. Replay is idempotent; later modifications/resends cannot change recognized date, amount, quantities or credit. An earlier conflicting receipt requires audited correction policy before any adjustment.

An invoice created or dated in September but first successfully emailed in October belongs to October **Verified Sales** when its proof is sufficient. Management's October operational definition excludes a September invoice date. Therefore an invoice-date cutoff cannot safely discover all verified October sales. Old invoices may require an archive scan or a wider separately budgeted read; no complete discovery endpoint/filter or retention guarantee has been established.

## Gates requiring future explicit approval

1. **Timezone hypothesis:** at most one Inventory GET https://www.zohoapis.com/inventory/v1/organizations/821729823?organization_id=821729823, no retry/pagination, retaining only organization ID/time_zone privately. Existing settings.READ is sufficient per docs. Review/extend the current explicit backend endpoint allowlist first; do not use a pass-through. One Accounts refresh may be needed. This is a proposal, not an approved/executed request.
2. **Independent corroboration:** manually examine the selected invoice's existing mail/audit records and original archive/PDF with a separately stated scope. Establish the source-zone/rendering contract, successful acceptance and original revision before repeating detail/history calls.
3. **External mail integration:** identify the actual sending/archive provider and retention, then review exact read-only API methods/scopes, selected messages and caps. No Gmail/Microsoft/Zoho Mail access or extra scopes have been requested; provider-specific methods are not yet known.
4. **Live capture:** separately approve any webhook registration, settings/permissions change, authenticated ingress or scheduled polling. Confirm event semantics against known independent evidence first.
5. **Real tenant migration and imports:** approve tenant/membership/storage architecture and each independent bounded import plan. Do not combine operational and verified coverage, totals or approvals.

Next recommended task: obtain independently corroborated evidence for one known original send (preferably October) with its original attachment/revision, and verify source timezone. Review that evidence through a separately authorized private ingestion plan. Live synchronization remains blocked; the synthetic foundation is ready for review.
