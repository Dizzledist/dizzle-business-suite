# Sales CRM reporting preview

The Sales Dashboard at `/sales` and invoice reporting at `/sales/reports` use a durable synthetic dataset when `SALES_CRM_ENABLED=true`. The loopback app uses its existing test identity selector and shows a synthetic-data notice. Reps see invoices credited to their fixture identity. Sales managers, owners and admins can view organization-wide fixture totals. The rest of the app uses its existing routes and fixtures.

## Local setup

Use the repository's Node 24 runtime. Set `SALES_CRM_ENABLED=true` before starting the frontend and backend. `SALES_REPORTING_TIME_ZONE` is an optional server setting. It defaults to `America/Los_Angeles` for the preview. The server uses an IANA timezone and controls the reporting calendar. The business must confirm the production timezone. [Local run commands](LOCAL_DEMO.md)

The database lives at `.sales-reporting-demo/invoices.sqlite` in the checkout. Git and Vite exclude that directory. A new database receives its sample invoice dates relative to the first run, then retains those dates and records across restarts. Use an earlier preset or a custom range to revisit the fixture period. Keep separate demo and production stores.

## Tables and sync

| Table | Purpose |
| --- | --- |
| `reporting_invoices` | One row per organization and invoice ID. Stores current source fields and payment, plus the recognized subtotal, captured salesperson, first verified email instant and evidence metadata. Partial indexes support scoped recognition-date queries. |
| `reporting_salespeople` | Maps a Zoho salesperson identifier within its organization to an existing CRM user. The invoice records the credited user at verification, so later mapping and customer changes leave historical credit intact. |
| `reporting_sync_state` | Tracks the next initial page, completion, lease, outcome, last success, processed records, retry count and latest error category per organization. |
| `reporting_sync_queue` | Holds durable invoice IDs, attempt counts, retry deadlines and sanitized error categories. Its compound key prevents duplicate queued work. |

The versioned SQLite migration runs transactionally on the local reporting store. Node 24 supplies SQLite and requires no separate service or dependency. The current Node runtime emits an experimental API warning when the store opens. Monetary amounts use signed integer millionths with exact integer arithmetic and decimal strings at the API boundary. Currency subtotals are separate.

Initial runs list at most one 20-record page and fetch at most 20 details by default. Each page checkpoint commits with its queued IDs. Trusted server callers can enqueue known changed IDs for incremental runs. Jobs and acknowledgements survive restarts. A lease fences abandoned workers, and a newer queued revision survives an older worker's response. Invoice updates and queue acknowledgements commit together. The existing reader handles GET retries, rate limits and token refresh. The durable queue backs off failed details and supports explicit replay after its attempt limit. Provider-side change discovery and a production scheduler require a separate approved implementation.

The browser service wires only the synthetic reader. The existing OAuth connection stays separate. `GET /api/sales-crm/reporting/operations` combines the local OAuth connection state with synthetic sync counts and checkpoints when the existing Zoho management configuration is loaded. It requires the local administrator identity and private operator key on the direct localhost API. It returns aggregate status and sanitized categories.

## Recognition and calendar

Only qualifying invoices with verified first-success email evidence contribute to totals. Evidence carries an exact instant, source and stable evidence ID, original subtotal, currency and salesperson reference. A later send can replay the same first-send evidence without affecting totals. Competing claims about the first send go to review. Missing evidence stays pending or unavailable. Drafts, never-emailed invoices, voids, refunds, write-offs, credits and ambiguous settlement are held from qualifying results pending business rules. Open includes unpaid and partially paid invoices. Closed requires explicit paid status with reconciled settlement and a zero balance. The original recognized subtotal and current open balance are independent.

The range control defaults to Month to Date and remembers the selection in the browser session. It supports Today, Yesterday, Week to Date, Last Week, Month to Date, This Month, Last Month, Quarter to Date, This Quarter, Last Quarter, Year to Date, This Year, Last Year and Custom Date Range. Weeks start Monday. Custom dates include both endpoints and allow up to 366 days. The API converts calendar dates to half-open intervals in the configured timezone. The dashboard, previous-period comparison, daily trends, list and detail use the same calendar. To-date comparisons use the same elapsed calendar-day count, capped at the end of the previous period. Custom compares to the immediately preceding equal number of calendar days. Goals and today's follow-ups retain their own periods.

## Live reporting gates and authentication proposal

Zoho documents the `is_emailed` flag and the GET invoice comments/history operation under `ZohoInventory.invoices.READ`. History documents operation fields, date and time. The public contract leaves first-success event semantics, reliable historical coverage, timezone and original invoice revision unresolved. The API also treats marking an invoice sent as a separate operation from emailing it. Keep records pending until approved evidence proves the first successful send, original subtotal and original credit. [Zoho Inventory invoice API](https://www.zoho.com/inventory/api/v1/invoices/)

Propose a separately reviewed Google Workspace OIDC integration. Verify signature, issuer, audience, expiry and nonce server-side, map the stable subject to an active CRM user and use a secure, revocable server session. Derive organization and role from trusted membership. Apply invoice-level visibility to details, search, aggregates and exports. Verify rep A versus rep B and organization boundaries with genuine sessions. Use separately authorized admin operations and audit their access. Keep the local fixture selector isolated in the development workflow. [Current project permissions](PERMISSIONS.md)

Use managed PostgreSQL for the production proposal, with reviewed migrations, exact `NUMERIC` amounts, indexed `timestamptz` recognition, tenant keys, worker recovery and retention controls. Before live reporting, approve that migration and authentication, validate known historical sends under separate read approval, and sign off timezone, attribution and settlement exceptions. Then reconcile a bounded import against independently verified totals before expanding scope. [PostgreSQL date and time types](https://www.postgresql.org/docs/current/datatype-datetime.html) · [Existing Zoho evidence plan](SALES_CRM_ZOHO_REPORTING.md)
