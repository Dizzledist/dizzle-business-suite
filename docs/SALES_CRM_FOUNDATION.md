# Local Sales CRM foundation

This development shell adds a gated Sales Dashboard and eight placeholder sections to the existing local workflow demo. The invoice workflow remains the app's default entry. CRM displays only the selected fixture identity's display name and unconfigured provider states. Dashboard cards have explicit empty or pending states, including Coming Soon for commission.

## Run the shell

Use Node 24 and the existing locked dependencies. With ports 5173 and 3001 free, start the app from this checkout. In PowerShell:

~~~powershell
$env:SALES_CRM_ENABLED = 'true'
npm run dev
~~~

Open http://127.0.0.1:5173/ and choose a sales fixture identity in the invoice workflow. Follow **Sales CRM** to /sales. The nine links cover Dashboard, Leads, Customers, Pipeline, Tasks, AI Assistant, Reports, Field Sales, and Settings. The invoice workflow link returns to /. If another local demo uses the ports, use a separate test instance or stop that instance before starting this one.

Unset SALES_CRM_ENABLED and restart both development processes to return to default behavior. The flag accepts the exact opt-in value shown above. The Vite client mount is limited to its dev server. The API independently checks its flag and runtime mode. Production mode blocks the fixture API at its existing entry point. CRM stays unavailable in build output and is a local demo feature.

## Access and data boundary

- The entry link appears only after the existing workspace resolves an eligible identity. The local selector's identity ID is carried across CRM links in this browser tab. A fresh direct visit without a selection shows Workspace unavailable. Return to the invoice workflow to select an identity.
- GET /api/sales-crm/workspace runs through the existing host/origin guards and Workflow.authenticate, followed by a CRM-only allowlist. Active readable demo-o1 sales reps, managers, owner and admin can open the shell. Missing, disabled, revoked, warehouse-only and other-organization identities are denied. With the feature off, CRM API paths return 404. Unknown subroutes and mutations have no handler.
- Session storage only preserves a local fixture selection. Server checks remain authoritative. This selector intentionally accepts predefined synthetic identities and must remain loopback-only. Actual CRM record access, shared-customer policy and production identity require separate approval and implementation.
- The response contains a display name and unconfigured Zoho Inventory and ShipStation statuses. The shell has no private performance, customer records, financial calculations or storage. No database setup is needed. The future connectors will provide verified read-only data through the dedicated CRM boundary. Zoho remains authoritative for first successful email month, subtotal, paid state, and original salesperson attribution. Replays and reassignment will preserve the original sale.
- Legacy identity and assignment policy, invoice/workspace/job responses, terms release, event replay, and warehouse behavior are covered by the existing tests. CRM access gives authority to view the shell only.

## Verification

Run the existing npm run check with the flag unset. For the enabled browser pass, set the flag for the test process and rerun npm run test:e2e. Playwright normally uses ports 5173 and 3001, so use isolated processes if a demo is already running. Tests cover the disabled route, both authorization paths, navigation, missing integrations, loading/retry, and keyboard and 320 px Chromium layout. See the [project status](PROJECT_STATUS.md) and [handoff](HANDOFF.md) for branch evidence and pending review.
