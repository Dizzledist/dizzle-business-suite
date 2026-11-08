# Sales CRM invoice details

## Scope and branch

Prompt #9 was implemented in a separate worktree on `feature/sales-crm-invoice-details`, based on the clean email/password commit `a0455ed`. The base includes the durable reporting commit `03e0fed`, the identity commit `680e432`, and read-only Zoho commit `8769fec`. The invoice, product, PDF, and browser acceptance checks use synthetic data. The existing administrator, credentials, and Zoho connection stay in their original local environments.

## October 2026 baseline

`INITIAL_SALES_RECOGNITION_DATE` defaults to October 1, 2026. The reporting calendar converts the date to midnight in `SALES_REPORTING_TIME_ZONE`, which defaults to America/Los_Angeles. Reports intersect the requested date range with this baseline and the current time. The dashboard still defaults to Month to Date. Selected and comparison periods show when coverage starts partway through a range or when the whole range predates coverage. The cutoff controls visibility of recognized records and can be moved earlier after a reviewed backfill.

Recognition uses the first verified successful email instant, original subtotal, currency, and captured sales credit. A September invoice first emailed on October 1 qualifies. A later resend or edit cannot replace original recognition. The current payment bucket and balance refresh independently of the stored recognition fields. Existing settlement exceptions still go to review under the established reporting rules.

## Database and structured invoice lines

Additive SQLite migration 002 adds document date, current payment summary, reconciliation fields, and normalized line snapshots. Existing rows keep their recognized values. Their line detail starts unavailable until supported source data is present. The existing sync transaction writes the invoice and its complete current snapshot together. It replaces current rows on a newer complete snapshot, including an empty list. Stale revisions are ignored. Missing or invalid line lists withhold current detail while retaining stored snapshots. Duplicate source line IDs invalidate a snapshot. A missing line ID uses its position only as an internal key. A snapshot with missing or invalid quantity, unit rate, or line amount is held for reconciliation. Provider product IDs, SKUs, category IDs and costs are never inferred.

Each line preserves the source line and product identifiers, SKU, name, description, quantity, unit, unit selling price, discount, line total, tax details, category fields, invoice currency through the parent invoice, source revision, and sync timestamp. Decimal strings preserve up to six decimal places. Unsafe JSON numeric precision is rejected for line fields. Aggregates use scaled integers and keep currencies and units separate.

Structured Zoho JSON supplies the line amounts. For the supported tax-exclusive cases, the check compares the invoice subtotal with the sum of provider `item_total` values, less an explicit invoice-level discount when that discount type is provided. For these supported fixtures, the reconciliation treats the supplied line amount as net of any item-level discount. Verify that basis against live structured data before production use. Shipping and total-level adjustment are recorded separately. Tax-inclusive pricing, unclear discount basis, and unexplained differences go to reconciliation. The recorded difference is the invoice subtotal less the supported line sum after any applicable invoice discount.

An original line snapshot qualifies for product attribution only when a trusted receipt explicitly identifies the matching source revision at or before the first send, the line snapshot reconciles, and the subtotal matches the original subtotal. A payment update or line replacement leaves that snapshot intact. A production adapter will need a stable original revision identifier or a verifiable archived structured invoice to establish this link.

## Invoice detail and product services

The report drill-down shows the invoice number, customer, credited rep, invoice date, verified first email, original subtotal, current payment and balance, and line count. Line Items shows the current snapshot and its reconciliation status. Invoice PDF opens the private synthetic document. Activity shows the verified send receipt and sync time. Payments shows the summary fields already available from invoice detail.

The employee-authenticated `GET /api/sales-crm/reporting/products` shares the report range, cutoff, payment selection, tenant and credited-user scope. It returns quantities and allocated revenue by product, SKU and category, recognized invoice subtotal by original customer and credited rep, and up to 100 recent line-level purchase entries with a truncation flag. Missing identifiers have an explicit unknown group. Counts identify invoices without original lines or original customer evidence. An invoice-level discount with no approved line allocation contributes quantities and eligible invoice subtotal. Its line revenue is flagged as unallocated and excluded from allocated revenue. Cost, profit, and margins are deferred.

## PDF route and live proxy design

`GET /api/sales-crm/reporting/invoices/{id}/pdf` checks the same invoice scope and filters as detail and requires an active password-authenticated employee. Synthetic PDF fixtures are restricted to `demo-o1`. The route returns 404 for a missing or out-of-scope PDF and rejects a browser-supplied organization. The response validates the media type, bounds the streamed bytes to 5 MiB, and checks the PDF header and EOF. It serves a fixed inline filename with private no-store, nosniff and same-origin headers. The viewer fetches through the existing session and revokes its temporary object URL. The local fixture has no external links or active content.

Zoho documents the regional Inventory GET `/inventory/v1/invoices/{invoice_id}?organization_id=821729823` with `Accept: application/pdf`, returning an attachment response with PDF media type. The planned live proxy resolves an approved server-side tenant binding and invoice record before using the existing server token and allowlisted GET transport. It uses a fixed regional base and validated numeric ID, rejects redirects, enforces a request deadline and response cap, and returns sanitized failures without provider headers or tokens. Review active PDF content isolation before live browser rendering. A PDF reflects the provider document returned at read time. The verified first-send revision requires separate evidence. [Zoho response formats](https://www.zoho.com/inventory/api/v1/response/) · [Zoho invoice API](https://www.zoho.com/inventory/api/v1/invoices/)

## Organization mapping and authentication

`demo-o1` is a CRM tenant on the employee record. `821729823` is an external organization allowlisted for the existing Zoho integration. Reporting resolves the CRM tenant from the server-side session and keeps the existing administrator, team, and credited-rep rules. The approved external ID is excluded as a reporting tenant even if a test stores provider rows with that ID. The demo selector has no access to the PDF or product endpoints. The invoice routes accept no client-controlled tenant or provider binding.

Before live access, an authorized administrator must approve the real internal CRM tenant and a reviewed, server-owned binding from that tenant to Zoho organization `821729823`. Store the approved binding and its audit reference, scope its credentials to that provider organization, and key provider records by the binding and source invoice ID. Keep demo tenants ineligible. Check active membership, binding, and existing invoice-level authorization before every live data or document read. The branch has no live binding or live PDF transport.

## First-email evidence

The existing reporting states are Verified, Pending, Unavailable and Conflicting. Verified evidence needs a successful first-email instant with timezone, stable evidence identity, original subtotal and historical credit. Pending marks unresolved evidence. Unavailable marks cases where evidence cannot be recovered. Conflicting marks disagreement requiring review. `is_emailed`, invoice date, creation date, and status alone are insufficient. The current history reader returns unclassified events and a null first-success timestamp.

Zoho documents an invoice comments/history GET with `ZohoInventory.invoices.READ`. It documents distinct actions for sending email and marking an invoice sent. The history documentation does not establish a reliable event mapping for successful sends, failed attempts, resends, oldest available event, or invoice edits and original structured revisions. A known receipt or independently timestamped sent-mail evidence is needed to compare candidate events. Leave older invoices pending or unavailable if the underlying evidence is missing. [Zoho invoice comments, history and email actions](https://www.zoho.com/inventory/api/v1/invoices/)

## Dizzle Management source audit

The GitHub connector returned HTTP 404 for `Dizzledist/dizzle-management`. The local GitHub CLI reported that its stored credential was invalid. Repository source was unavailable through those routes. The production website and database were not inspected. [Dizzle Management source repository](https://github.com/Dizzledist/dizzle-management)

| Requested area | Audit result |
| --- | --- |
| Profit calculator | Source paths, cost resolution, discount treatment, profitability, margins and missing-cost behavior remain unverified |
| Samples page | Source paths, sample classification, quantity and cost formulas, and invoice relationships remain unverified |
| Invoice parsing, line calculations and SKU identification | Source functions, inputs, fallback rules and dependencies remain unverified |
| Cost tables and database relationships | Schema, joins, effective dates and authoritative cost sources remain unverified |

No reusable Management function or formula could be verified. With source access, trace these behaviors from the page through the calculation, persistence and fixtures, then compare both apps on the same synthetic cases. Reuse verified pure functions and stable SKU mappings after the calculation review. Keep samples on the agreed plan for approximately 80% completion of the core CRM milestones.

## Next bounded test proposal

After separate approval, use three invoice IDs selected by an authorized operator, each with independently verified send evidence. Include one invoice created in September and first emailed in October, one with a verified resend and later edit, and one marked sent without an email or associated with a known failed send. Select one of these three for the PDF check.

- Make one structured GET `/inventory/v1/invoices/{id}` and one GET `/inventory/v1/invoices/{id}/comments` for each approved ID. Compare event category, ordering, timestamp/timezone, original subtotal, credit, and revision with the known evidence.
- Make one additional GET `/inventory/v1/invoices/{id}` with `Accept: application/pdf` for the selected invoice. Use the approved organization on all requests. Verify status, media type, capped size, and that the returned document belongs to the selected invoice in the operator's private review.
- Cap the test at seven Inventory GET attempts total and three invoice records. No automatic Inventory retries in that test. One server-side Accounts refresh can be performed if the existing grant requires it. The Inventory requests use the existing `ZohoInventory.invoices.READ` grant. Keep customer fields, invoice bodies, document bytes and tokens out of logs and retain only sanitized results.
- If the samples do not establish first-success semantics, historical coverage or original revision evidence, keep live sales reporting blocked. Separately review authorized tenant binding, coverage tracking, settlement exceptions, product discount allocation and PDF security before enabling synchronization or browser access.

M5 remains blocked for live reporting. No live Zoho requests, financial imports, production changes or publication ran during this synthetic phase.

## Verification and local review

The base passed TypeScript, build and 202 Vitest tests. The final branch passed TypeScript, build, 218 Vitest tests across 15 files, and 27 Chromium checks across four modes. The Chromium split was 4 with CRM disabled, 9 with the fixture CRM, 7 with session-only auth and 7 with password auth. The initial browser invocation omitted explicit test mode and mixed incompatible suites. The four isolated reruns passed. Tests used loopback servers, synthetic records and disposable identities. An additive migration test opened a version-one database copy and checked that its original recognized invoice survived. Poppler rendered the one-page synthetic PDF and its layout was visually checked. There is no lint script. Provider history, payments and PDF calls and production acceptance were outside this test run.

For manual review, start this worktree on separate loopback ports with its own local identity database and use the [existing password setup workflow](SALES_CRM_EMAIL_PASSWORD.md). The signed-in user can open Sales CRM, Reports, then a synthetic invoice. The Chromium password fixture uses a disposable in-memory identity and is separate from normal app startup.
