# Phase 1 Shopify retail analytics

November 13, 2026. Lead: Cheddr with Codex. Branch `feat/shopify-retail-analytics`, isolated worktree `dizzle-retail-analytics`, starts at fetched main **928a45c488389dd89e5142aa81f6527096ae73d6**, the approved PR #7 merge. Branch/PR discovery found no existing Shopify analytics work to continue. Other worktrees, source branches, existing secrets and saved marketing data are preserved.

This phase adds a **fixture-backed** Marketing Retail Analytics section and a shared management reporting component/API. It makes no Shopify store calls, installs no Shopify app, changes no Sales authentication or Sales migration, and leaves social publishing/read gates off. The source-selection and direct aggregation rules below come from the current user's explicit task, not inferred account readiness.

## Run and review locally

Use Node 24.x, then from the integration's sibling worktree:

```powershell
cd "C:\Users\Owner\Documents\ChatGPT\Dizzle Dist Build 2\dizzle-retail-analytics"
npm ci
npm run demo:retail
```

Open **http://127.0.0.1:5575**, click **Sign in with Google Workspace**, then **Retail Analytics** in the left navigation. The launcher uses the existing shared session/CSRF implementation with a test Google provider, a provisioned synthetic reviewer and temporary databases. It never reads checkout `.env`, existing employee/marketing databases or provider credentials. No real Google or Shopify login happens. The demo reviewer deliberately has Marketing plus all three management-preview roles and two USD store assignments; these are not anyone's production permissions. New launches start with fresh temporary data and preferences; reloads within the same launch preserve preferences. Ctrl+C stops the two demo processes. Existing previews on other ports are untouched.

1. Start with Cheddr US, October 15–November 13, 2026. Inspect net sales, order count, discounts, merchandise refunds, AOV, top products and the daily chart. Hover/scrub the trend or open daily values. Store selector lists only this employee's two authorized USD demo stores.
2. Change the reporting period to November 1 alone to inspect the 25-hour Pacific DST day. Dates are inclusive calendar days, converted to a half-open UTC interval. Invalid ranges, duplicates, more than 93 days and ranges outside fixture coverage are rejected without displaying old totals or a misleading zero.
3. After sign-in open **http://127.0.0.1:5575/tests/browser/retail-preview.html**. This is a dev-only **management adoption preview**, not three invented management dashboards. Each role's component defaults to Zoho wholesale alone. Enable Include Shopify sales to inspect separate wholesale/retail subtotals and their direct sum. Reload to verify that role/dashboard's preference; the other switches remain independent. Fixture preferences are keyed by canonical employee, organization and dashboard, not browser localStorage.

Every report is labeled DEMO. Currency, reporting dates, Pacific timezone and fixed fixture snapshot are visible. The snapshot is **2026-11-13T18:00:00Z (10:00 AM PST)** and coverage is September 30–November 13; the final date is partial as of that snapshot. No live freshness is claimed. Fixture metadata contains no confirmed Shopify IDs or checkout domains.

## Metric contract: `retail-merchandise-v1`

Money uses safe integer minor units, currently USD/CAD with two decimal places. Events must already have canonical UTC ISO timestamps, normalized shop currency and line-level discount allocations. The fixture adapter owns these invariants; a future provider adapter must validate them before reporting. Data is sales activity, not a payment/cash ledger.

| Metric | Phase 1 definition and exclusions |
|---|---|
| Gross sales | Sum original merchandise price × quantity for orders placed in the period, before discounts. Shipping/tax excluded. |
| Discounts | Sum initial merchandise discount allocations, including each line's allocated order discount. Shipping discounts excluded. Fixture allocations are explicit integer amounts; no order-level allocation is guessed in this phase. |
| Refunds | Positive magnitude of **merchandise refund adjustments processed in the period**, including refunds for earlier orders. Refunded shipping/tax excluded. This is not the total money returned through a payment gateway. |
| Other reversals | Explicit cancellation merchandise adjustments processed in the period, shown in the calculation disclosure. No reversal is invented from status alone. |
| Net sales | Gross merchandise − discounts − merchandise refunds − other reversals. Can be negative in a refund-only period. |
| Order count | Eligible original orders placed in the period, once per order; includes canceled and unpaid/pending orders, even if later fully reversed. Refunds do not create another order. Test/deleted orders and their adjustments are excluded. |
| Average order value | (Gross merchandise − initial discounts) / original order count, rounded to nearest minor unit. Later refunds/cancellation adjustments do not alter AOV. No orders → unavailable AOV, not a fabricated zero order. |
| Daily trend / products | Same event-date net sales. Product net quantity subtracts reversed quantities; old-order refunds may produce negative units/net sales. Rank product net sales descending, stable ID tie-break, top ten. Zero-fill covered days only. |

All KPI, daily and product calculations exclude shipping, taxes, refunded shipping/taxes and non-merchandise charges. The fixtures model no gift cards, duties, exchanges or order edits. Those event types are **not proven** for live reporting and require adapter mapping/reconciliation before connection. An original canceled order retains gross/discount/count entries; its explicit adjustment reverses net merchandise value on its processing date. Test/deleted exclusion and cancellation/pending treatment follow Shopify's sales-report model. See [Shopify sales terms](https://help.shopify.com/en/manual/reports-and-analytics/shopify-reports/report-types/default-reports/sales-report) and [ShopifyQL sales/AOV schema](https://shopify.dev/docs/api/shopifyql/latest/schemas/sales_revenue/sales). These references informed the fixture contract; no live equivalence is claimed.

Zoho wholesale fixtures are a **separate synthetic merchandise event aggregate** for the same Pacific period/currency. They do not establish Zoho accounting or revenue recognition. The unmerged Sales reporting adapter's verified first-email/invoice/credit rules must be reviewed and preserved when supplying the actual wholesale subtotal. A cash/payment/receivable/profit total must not be relabeled net merchandise sales.

## Shared reporting interface and access

[shared/retail-reporting.ts](../shared/retail-reporting.ts) is deliberately distinct from the unmerged Sales branch's `shared/reporting.ts`; no Sales contract is overwritten. [ReportingService](../server/reporting/service.ts) consumes a reporting source and persistent preferences. Its current adapter is fixture-only, with no HTTP transport or Shopify secret handling. The hosted `marketing:serve` entry has no live reporting source: an unconfigured reporting request fails 503. The local demo injects the fixture service explicitly; there is no environment flag that silently turns production data into fake totals.

| API | Rule |
|---|---|
| `GET /api/reporting/retail/stores` | Current shared session; role Marketing/Owner/Admin/Sales Manager plus `retail:read`; return only assigned stores in employee organization |
| `GET /api/reporting/retail?storeId=…&from=…&to=…` | Same rules, exact store assignment and organization required; unknown/unassigned stores return 404 |
| `GET /api/reporting/management/{owner|admin|sales_manager}?from=…&to=…` | Exact corresponding current role plus `wholesale:read`; preference defaults off. Retail additionally requires `retail:read` and store assignments when included |
| `GET/PATCH /api/reporting/management/{dashboard}/preference` | Same dashboard authority; mutation requires exact-origin CSRF; strict JSON `{includeShopify:boolean}` only. Employee/org are derived from session, never body/query |

The current shared employee source supplies roles, grants and store assignments at every request. Revocation from another identity-store connection affects existing sessions immediately. Direct API calls cannot select an employee, role or organization. Fixture identity headers are rejected; the old local fixture-identity API cannot access these reporting routes. Roles alone confer no retail data; explicit grant **and** scoped store membership are required. Owner/admin cannot implicitly read every store. Marketing always shows the Retail Analytics section and reports no-access/unconfigured/no-assigned-store states rather than inventing metrics.

Shared identity schema **002** adds role/store membership tables without changing employee IDs, existing grants or sessions. Existing employees get empty roles/store assignments. It is applied only by the explicit `auth:operator migrate`, never startup, and is a shared-interface review item for both builders. No Sales schema or production data is migrated. Operator provision/access JSON accepts optional `roles` and `retailStoreIds`; omission in access updates preserves existing assignments, while empty arrays revoke them. Existing disable/grant revocation behavior remains.

Preferences use a separate private SQLite v1 schema keyed `(organization_id, employee_id, dashboard)`. Startup opens only an existing schema; `REPORTING_PREFERENCES_DB=/PRIVATE/preferences.sqlite` with `npm run reporting:migrate` is the explicit initialization command after schema review. Local fixtures initialize only temporary files. Persistent hosting would place this file/sidecars under the reviewed one-host private root, outside checkout/web root, with API/operator ACLs and consistent backups. No production path was initialized by this task.

## Management adoption status

| Dashboard | Wired on main / this PR | Adoption needed |
|---|---|---|
| Marketing | Retail Analytics is wired to shared-session Marketing navigation | Approve reporting grants/roles/store assignments; a future live source is separate |
| Owner | No merged Owner analytics dashboard exists; the local Owner invoice fixture is not one | Mount `ManagementSalesSummary` in the reviewed Owner dashboard when it lands; supply existing wholesale aggregate adapter |
| Admin | No merged Admin analytics dashboard exists | Same component with `dashboard="admin"`; preserve admin vs sensitive-financial-grant policy |
| Sales Manager | Sales CRM dashboard/reporting exists on unmerged Sales work, not main | Mount with `dashboard="sales_manager"`; retain existing Sales scopes, first-email recognition, coverage/evidence rules and verified assignment behavior |

Inspected pending references include `feature/sales-crm-management-parity` at **a81ddae**, `feature/sales-crm-google-oidc` at **ac9d842**, and `feature/sales-crm-revenue-reconciliation` at **9658353**. Their dashboard/reporting/auth code is not imported or modified. The dev-only preview renders the shared component for all three dashboard keys so preferences/totals can be reviewed now. It is outside the production Vite entry/build and must not be deployed as an unfinished management product. Future adoption uses the same server-provided employee and persistent preferences, not role pickers or a second login.

With Include Shopify sales **off**, retail sources are not accessed or returned. With it **on**, authorized Shopify store subtotals are added directly to wholesale net merchandise sales, using the same period and currency. Wholesale and retail orders do not overlap by the user's explicit rule: no order matching or cross-system deduplication is introduced. If any included source is unavailable, coverage is missing or currencies differ, combined is null; available subtotals remain visible with an explanation. No automatic currency conversion. A revoked retail grant withholds all retail metadata/subtotals and the combined value, while authorized wholesale stays visible; switching inclusion off remains possible. Direct retail endpoints still return 403.

## Before any live Cheddr store connection

1. **Establish the actual checkout system.** With the owner, inspect the retail storefront's checkout destination and a known historical retail order in its actual merchant admin/receipt. Confirm the platform, merchant account and channel processing Cheddr orders. Domain branding, a Shopify account or this demo is not evidence that Shopify processes those orders. If checkout is elsewhere, stop the Shopify connection plan and review that provider; do not label another store's numbers Cheddr retail. No test purchase is authorized here.
2. If Shopify is confirmed, record the verified **Shop ID**, permanent `myshopify.com` domain, business organization mapping, currency, timezone and responsible operator privately from the actual merchant admin/read-only app identity. Fixture IDs are not candidates for live connection. Jointly review the store registry and employee store assignments; an app connection grants no employee authority by itself.
3. Review app/API access before implementation. Shopify's documented ShopifyQL Admin API reporting path currently requires `read_reports` and Level 2 protected-customer-data access; verify applicability and the pinned API version for the actual approved app. Do not request broad scopes, install an app or paste tokens into chat for this phase. [Reporting API requirements](https://shopify.dev/docs/apps/build/shopifyql/graphql-admin-api). No query/connector has been generated or executed here.
4. Pick a **closed historical Pacific reporting period** and the same shop currency. Record extraction timestamps, source filters and coverage. Confirm how the source dashboard/query expresses Pacific dates if the shop uses another timezone; do not silently change shop settings. Freeze exports/snapshots for reproducible comparison.
5. Reconcile aggregate gross, discounts, merchandise refunds/reversals, orders, AOV, daily net sales and top products against that source report, including cancellations, unpaid/test/deleted orders, refunds of older sales, taxes/shipping, gift cards, edits/exchanges and DST boundaries. Explain all variance; do not mix gateway refunds or tax-inclusive total sales with merchandise net sales. Review original vs later-adjustment dates and rounding. Unmapped cases block a live total instead of being guessed.
6. Review the actual Zoho wholesale adapter's recognition/evidence/coverage for that same period. Compare each channel to **its own** source dashboard, then sum compatible channel aggregates directly. This is source reconciliation, not cross-system order matching. Require owner/Sales Manager sign-off on first-period reconciliation and access before live reporting. This task authorizes no live read, write or deployment.

## Verification and limitations

`npm run check` runs typecheck, metric/access/migration/preference tests, build, original nine browser cases, shared sign-in and two retail browser cases. Metric tests hand-calculate discounts, partial/old-order refunds, canceled/pending/test/deleted orders, shipping/tax exclusion, empty/negative periods, AOV, top products and 23/25-hour Pacific days. HTTP tests deny missing/disabled/revoked/foreign/unassigned access and preference spoofing; all dashboard keys default off, persist per user/dashboard across database reopen, add direct channel totals and withhold incompatible/unavailable combinations. Browser tests inspect the actual Marketing page, date filters/chart/products, mobile navigation/layout and every preview toggle after reload. Screenshots are generated under ignored `test-results`.

Initial parallel browser runs collided in their shared artifact directory; final verification runs serially. Visual review caught an inherited SVG icon-height rule and mobile navigation/layout issues; those are corrected. An extra coverage test prevents outside-fixture dates from appearing as zero revenue. No live store, source currency conversion, production role provisioning, actual management-dashboard adoption, Sales migration, real Google login or production deployment is claimed.
