# Dizzle AI Business Suite

Dizzle is a web app for the AI Business Suite described in the [project brief](docs/PROJECT_SCOPE.md).

This repository contains the shared foundation and a Phase 1 local React/TypeScript app and API demonstrating the invoice-to-warehouse workflow with synthetic data. No live Zoho integration or production infrastructure is configured.

## Run the local workflow

Use Node.js 24.x, then run from the repository root:

```sh
npm ci
npm run dev
```

Open **http://127.0.0.1:5173**. Start as Sales manager, select DZ-1001, and either receive a verified fixture payment or release against documented terms with a reason. Replay events, repeat release requests and switch to rep/warehouse identities to inspect the resulting scope and job. **Reset demo** restores the sample records. State is in memory and resets on restart.

See [local demo and acceptance coverage](docs/LOCAL_DEMO.md) for exact steps, API routes, test identities, verification assumptions and deferred production requirements. The identity selector is a local test facility, not production authentication.

```sh
npx playwright install chromium
npm run check
```

Checks run TypeScript, HTTP integration tests, the client build and Chromium browser tests. Stop an active demo before browser tests so they can start fresh local servers. GitHub Actions runs the same checks on pull requests.

## Shared development foundation

- [Marketing workspace and parallel sales/marketing development](docs/MARKETING_WORKSPACE.md)
- [Builder conventions and session rules](AGENTS.md)
- [Project scope and confirmed baseline](docs/PROJECT_SCOPE.md)
- [Project status and next tasks](docs/PROJECT_STATUS.md)
- [Session handoffs](docs/HANDOFF.md)
- [Confirmed decisions and open questions](docs/DECISIONS.md)
- [Shared identity, account, invoice, payment and warehouse contracts](docs/CONTRACTS.md)
- [Roles and permissions](docs/PERMISSIONS.md)
- [Invoice-to-warehouse acceptance scenarios](docs/ACCEPTANCE.md)

R01-R03 and A26-A30 are jointly approved as recorded in DECISIONS. Both builders review changes to shared contracts and remaining technical proposals; local fixture behavior does not verify Zoho capabilities.
