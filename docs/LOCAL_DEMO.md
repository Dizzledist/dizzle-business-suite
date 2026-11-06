# Local invoice-to-warehouse demo

Phase 1 scoped prototype, November 6, 2026. This is a local workflow demonstration of approved R01-R03, not the complete production foundation from the [scope](PROJECT_SCOPE.md). All companies, money, terms, IDs and payment evidence are synthetic. No Zoho credentials, external accounts, messages or stock movements are used.

## Run on either builder's computer

Use Node.js 24.x and npm (same major as CI). From the repository root:

```sh
npm ci
npm run dev
```

Open **http://127.0.0.1:5173**. API runs on **http://127.0.0.1:3001**. Both bind loopback only; keep these ports free. Stop with Ctrl+C. Separate terminals can instead run `npm run dev:api` and `npm run dev:web`. The API rejects `NODE_ENV=production`; do not publish the fixture app or expose it through a tunnel.

State is in memory, shared by tabs connected to the same API process, and resets on API restart, server watch reload, or **Reset demo**. There is no database/migration, secret configuration or production startup command. Demo reset is permitted only to the demo-o1 manager/owner/admin. No `.env` file is needed.

## Reproduce the workflow

1. Start as **Sales manager** and click **Reset demo**. DZ-1001 is unpaid, DZ-1002 has a 40.00 payment/60.00 balance. The warehouse board is empty.
2. Select DZ-1001, choose documented `terms-a-net15`, and enter an early-release reason. **Push to warehouse** creates one linked job while its balance remains 100.00. The detail shows original release actor, basis, terms, reason and timestamp.
3. Click **Receive $40 payment**: balance becomes 60.00 on the same invoice/job. Click **Receive verified full payment**: balance becomes zero on that same job. **Replay full event** is a duplicate. **Repeat release request** generates a different request key and preserves the original job/audit.
4. Click **Mark stale** (or **Mark unverified** / **Unverify mapping**): the existing job remains with a review flag, and another manual release is held. **Restore verification** clears those fixture uncertainties. Restore does not approve missing/disputed terms or make an invalid invoice eligible.
5. Reset, select DZ-1001 and receive full payment without a manual release. One job releases automatically; replay leaves it unchanged. Receiving only $40 keeps a new invoice off the board.
6. DZ-1003 starts stale; DZ-1006 has an unverified account mapping. New releases stay held. DZ-1005 has disputed terms; DZ-1009 has missing terms. A reason or caller-supplied `approved` flag cannot bypass the hold. This prototype has no terms-dispute approval workflow.
7. Switch to **Rep A**: only Juniper Market invoices are returned by the API. **Rep B** sees Cedar Supply (DZ-1004). Neither can release or use payment controls. **Warehouse** receives only released jobs/items/review flags, without the invoice list, financial balances or release reasons. This is a minimal operational projection, not a department dashboard.
8. Choose **Disabled manager** or **Revoked manager**: API access fails and the UI clears the previous identity's records. **Other organization** sees only its own synthetic record and cannot access/reset/release demo-o1 work.

The dropdown intentionally selects server-defined test identities using `X-Demo-Identity`; anyone running this local demo can select them. It is not a login or authentication product. The API rechecks active status, read/release grants, role, organization and assignment for each request; a caller-supplied role/verified amount is not accepted.

## Fixture adapter and unresolved provider facts

[server/fixtures.ts](../server/fixtures.ts) names the assumptions explicitly. They are implementation choices for isolated demonstrations, not verified Zoho behavior or new business policies:

- Currency is USD, stored as integer cents internally and serialized as exact two-decimal strings. This does not implement other currency precision or payment allocation rules.
- Invoice eligibility is normalized `open`; draft and credit-only records hold even at zero balance. Only a valid full-payment snapshot on an eligible/mapped/fresh invoice auto-releases.
- Source snapshots have ordered versions 1 (40.00 cumulative paid) and 2 (100.00 cumulative paid). The full snapshot replaces the paid amount; it is not added to the partial snapshot. Repeated event IDs and older versions cannot duplicate payment or erase newer data. **Replay** requires a previously received full event and never refreshes stale evidence.
- Freshness is five minutes measured against last verification time, with explicit stale/unverified controls. A held payment event with unavailable verification is not consumed; after restore it can be retried. Mapping uncertainty can preserve a verified payment mirror while preventing warehouse release.
- `Restore verification` is a named local adapter control that supplies synthetic current verification/mapping; browsers cannot submit arbitrary amounts/statuses or forge a provider event through these schemas. It is not a live payment verifier.
- One job is stored per canonical fixture invoice in one Node process. Synchronous check/create/audit operations prevent interleaving within that process. This does not prove durable transactions, multi-process uniqueness, crash recovery, provider aliases or a persistent append-only audit.
- Q01-Q04 in [DECISIONS](DECISIONS.md) remain open: actual Zoho origin and source IDs, status/payment/credit semantics, freshness/event ordering and stock-impact behavior. No API scopes, webhooks or writeback have been verified.

## Local API contract

All data requests require a known `X-Demo-Identity`; API replies use `Cache-Control: no-store`. Unknown/disabled identity is 401; revoked read or forbidden action is 403; inaccessible records return 404; unmet release/verification/terms/revision conditions return 409. Inputs are validated strictly; extra caller-supplied role/payment fields are rejected.

| Route | Permission / behavior |
|---|---|
| `GET /api/health` | Local process health only, no business records |
| `GET /api/workspace` | Current identity, authorized invoices and released job projection, fixture assumptions |
| `GET /api/invoices/:id` | Manager/owner/admin within organization, or currently assigned rep; warehouse role alone cannot read invoices |
| `GET /api/jobs/:id` | Same invoice scope or warehouse operational role, within organization |
| `POST /api/invoices/:id/release` | Owner/admin or sales manager plus active release grant; JSON `termsId`, `reason`, `requestKey`, `expectedRevision` |
| `POST /api/demo/invoices/:id/events` | Demo grant and manager/owner/admin role in source organization; JSON `event`: partial/full/replay/stale/unverified/unmapped/restore |
| `POST /api/demo/reset` | Demo-o1 manager/owner/admin only; resets synthetic records, jobs and received event references |

The release audit is created once with server-resolved actor/time, basis, reason, retained terms evidence and original request key. Later source balances are joined from the invoice mirror; jobs do not own a second financial ledger. Every authorized release retry looks up the canonical job independently of its request key. Read/release grants and role scopes are server-defined and rechecked after revocation. Reset and fixtures are local-only controls, not provider write endpoints.

## Checks and coverage

```sh
npm run typecheck
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

`npm run check` runs the four checks after browser installation. On Linux, use `npx playwright install --with-deps chromium` if browser OS dependencies are absent. Playwright starts isolated local servers; stop `npm run dev` before browser tests because they intentionally refuse to reuse an existing demo. API tests create fresh ephemeral-port servers per case. Browser tests reset the fixture API and run serially. Screenshots/traces are ignored under `test-results/`.

[GitHub Actions](../.github/workflows/checks.yml) runs typecheck, HTTP tests, build and Chromium browser tests on PRs using Node 24 and `npm ci`. No deployment, provider credentials or write permissions are configured. No separate lint tool is installed; TypeScript and tests are the current code checks.

| Foundation scenarios | Implemented evidence / limits |
|---|---|
| A02-A10 | HTTP tests cover holds, full payment/replay/order handling, authorized terms/release audit, later payment and validation |
| A11 (partial coverage) | HTTP tests assert denial responses for unauthorized release/payment controls and confirm no job is created. The safe denial audit remains unimplemented and is not asserted by these tests |
| A12 | Concurrent in-process requests converge to one job. Durable crash/recovery and worker replay remain deferred |
| A13-A14 | Stale/unverified fixture evidence and real clock expiry block release; mapping uncertainty blocks release |
| A15-A17 | Strict fixture input forbids caller payment assertions; draft/credit-only holds and unmatched mapping tested. No browser payment flow, cash custody module, real mirror/alias reconciliation |
| A18 / A28 | Assigned invoice/job retrieval, role/organization projection, disabled/revoked identity/action and forged-input denials tested. Files/search/reports/AI retrieval do not exist yet |
| A26-A27 | Partial/full source updates preserve same job/audit; different request keys preserve original release. Archive behavior deferred (no archive lifecycle) |
| A29-A30 | Existing jobs survive stale/unverified/mapping uncertainty; missing/disputed terms hold. Explicit dispute-resolution authority/UI remains open |
| A01 / A19-A25 | Source import/mirror deduplication, reassignment workflow, amendments/reversals, shipments/notifications, migration and actual Zoho rights are not implemented; no claim of completing those scenarios |

Chromium regression tests also start from reset fixtures, verify a fresh unpaid invoice has no job, apply full payment without a manual terms release, and confirm exactly one linked job in the warehouse view. Replaying the event preserves the same job ID and complete original release audit; the test checks the manager API projection for the audit because warehouse access deliberately omits it. Other browser tests exercise terms -> partial/full payment -> replay/retry -> stale flag -> warehouse view, plus rep isolation, disabled/revoked identity switching and a narrow viewport. The wider Phase 1 production foundation (real identity, database/files, durable jobs, search/AI and staging isolation) remains future work.
