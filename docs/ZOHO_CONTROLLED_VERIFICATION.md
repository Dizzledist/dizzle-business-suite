# Controlled read-only Zoho verification

Prompt #12A operational checkpoint, November 12, 2026. Active lead: Codex. Source implementation: `844e779` on `feature/sales-crm-revenue-reconciliation`.

The user selected three existing invoices and separately approved an exact-number lookup followed by six invoice-detail/history reads. The approved revised plan replaced the organization-list call, preserving a hard total of seven Inventory GET attempts. A persistent private ledger reserved each attempt before dispatch. All seven reads succeeded, with no retries, pagination, Inventory writes, PDF/payment requests or import. Two Accounts refreshes succeeded across the approved phases.

No live invoice IDs, numbers, financial values, event text or customer identities belong in this repository. Private evidence and the exact request ledger remain outside Git. The user-facing verification report records the anonymized case findings.

## Evidence outcome

All three send-date assessments remain pending. All three original-amount assessments are unavailable in the tested evidence. Current structured details and history could be read, but the selected examples did not establish the intended October/resend/financial-edit cases or independently proven originals.

The returned history supplied separate local date/time strings at minute precision, with no explicit timezone or machine success/completeness metadata. Email-related activity identifies candidates; it does not by itself establish the earliest successful send. Generic update activity does not prove a financial revision. Missing original sent values cannot be replaced by current subtotals or a current PDF.

The official [invoice API](https://www.zoho.com/inventory/api/v1/invoices/) documents the existing comments/history read. Zoho's [activity reports guide](https://www.zoho.com/us/inventory/help/reports/activity-reports.html) describes System Mails and audit descriptions that may support a later corroboration task. No new endpoint, scope or operational approval is inferred.

## Preserved boundaries

The four configured Inventory READ scopes and GET-only data restrictions remain unchanged. Private environment and encrypted grant digests matched before and after execution. One active password administrator remains, and no live tenant binding was approved. No authentication database or production schema change occurred.

The application runtime files are unchanged from `844e779`. Management and other worktrees were preserved. No real invoice was imported into the CRM, no dashboard was activated, and no push, merge or deployment occurred.

## Checks and next step

Preparation passed TypeScript and 263 Vitest checks. Private diagnostics passed 43 mock checks across the two phases. Live results were seven successful GETs and two permitted Accounts refreshes. Prior Prompt #11 build/28 Chromium results remain recorded, not newly rerun.

M5 remains blocked for historical financial reporting. The next separately approved task is independent mail/audit/original-document corroboration, real October and resend/edit cases, timezone/precision review and original-value proof. Real tenant membership/binding and historical credit require review before any import. The seven-attempt diagnostic budget is exhausted.
