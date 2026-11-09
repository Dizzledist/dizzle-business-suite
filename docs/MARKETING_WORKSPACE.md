# Marketing workspace and parallel development

November 9, 2026. Active lead: Cheddr (Marketing / Admin). This branch establishes the marketing workstream; it does not yet implement a marketing dashboard or change login behavior.

## Confirmed direction

Source: Cheddr's November 9 request and [project scope](PROJECT_SCOPE.md). Build one web app with department workspaces. Cheddr leads marketing, image studio and Assets publishing; the sales manager leads the sales dashboards and pipeline. Both builders review shared identity, account assignment, integration and notification contracts.

The signed-in employee's authorized roles, department memberships and explicit grants determine available dashboards and records. Department is a home-view preference, not an authorization bypass. An employee with multiple authorized roles can switch between permitted workspaces. A sales rep role alone remains limited to assigned accounts. Marketing membership alone grants no general customer, finance or warehouse authority. See [permissions](PERMISSIONS.md) and [shared contracts](CONTRACTS.md).

## Branches and local folders

| Workstream | Reference at setup | Owner / local use |
|---|---|---|
| Integration baseline | `main` at `d4afc223d7313274ecea75f3655d2188abbbbbd6` | Reviewed changes enter through PRs; Cheddr is merge operator |
| Marketing | `feat/marketing-workspace`, created from that main | Cheddr; sibling folder `dizzle-marketing-workspace` |
| Sales CRM / pipeline | `feature/sales-crm-management-parity` at `a81ddaed3e838e0a03256578b8faae3650d1e6b8` | Sales manager; existing isolated CRM preview is pinned to this revision |
| Warehouse Kanban | `feat/warehouse-fulfillment-kanban` at `8ac2e976636d146a4342562716cbe97824ba955a` | Existing checkout and preview preserved; [draft PR #4](https://github.com/Dizzledist/dizzle-business-suite/pull/4) |
| Image studio / Sales Assets proposal | `docs/image-studio-sales-assets` at `451b6b596951614ae529fbfafeedf733c04dfc49` | [Draft PR #2](https://github.com/Dizzledist/dizzle-business-suite/pull/2); remains a separate proposal |

The marketing branch contains the merged Phase 1 app, not the unmerged Sales CRM or Kanban additions. Its default run commands are those in [README](../README.md). Do not start another default server while ports 5173/3001 are occupied. Port settings differ between the unmerged branches; coordinate free ports before starting a marketing preview. No marketing server is started by this setup task.

On another computer, fetch origin and check out this branch in a clean clone/worktree. Each builder uses their own GitHub access and local configuration. Committed instructions and handoff records travel through Git; credentials, local databases, browser sessions and chat history are not a handoff dependency.

## Working independently and integrating

1. At session start, fetch origin; verify branch, head and working tree; read AGENTS, status and the latest handoff. Name one active lead for the scoped task.
2. Continue an unfinished marketing task on this branch, or use a focused child task branch when separate review is useful. New independent work starts from current reviewed main. Do not force-push or rewrite a branch another builder is using.
3. Keep feature code within its module where possible. Do not build a second login, account-assignment service, Zoho connector, stock ledger or permission implementation. The Sales CRM identity implementation is a review candidate, not an already approved shared dependency.
4. Coordinate edits to the app entry/router, API registration, identity contracts, package files, Vite/Playwright configuration and shared docs before both builders change them. One active lead owns each shared change; identify affected consumers in its PR.
5. End each shift with checks, a focused commit/push, and a dated handoff naming the exact commit, PR, next task, failures and required local setup. Keep PRs draft until ready for shared review.
6. When features are ready, review their shared interfaces and combine the branches in a separate integration worktree/branch for cross-department tests. Bring accepted changes into main through reviewed PRs. Pushing two branches does not itself combine their code or deploy the app. Merge order follows dependencies; Cheddr handles authorized merges separately.

## Proposed implementation boundaries: review by both builders

- Marketing home, image studio and the Assets authoring/publishing area are natural marketing modules. Sales consumes authorized published assets through the same shared asset service, not a copied library.
- An authenticated application shell can choose an authorized default dashboard, show a switcher only for permitted departments, and deny ungranted routes/actions/files in the API. Exact role names, membership schema, default selection and no-access behavior need joint review before implementation. A department string or hidden navigation alone cannot establish authority.
- Reconcile the Sales CRM session model's individual/team reporting scope with approved C1/C2 account access and multi-role staff. Its current local role model does not implement the complete suite's department grants. Preserve original sales attribution separately from current account visibility.
- Use PR #2's image/price-list/batch-COA examples to select the first fixture-backed marketing workflow. Its C6-C8 proposals, approval authority, versioning, audience selection and retirement choices remain proposals until reviewed; this branch does not silently approve or merge them.
- Review local login and identity integration before sharing sensitive records across departments. Live OpenAI image generation, Omnisend, analytics, storage, external publishing/sends and provider setup are separate scoped implementation/operational work.

## Next tasks

Cheddr: select the first small marketing slice, preferably a fixture-backed marketing home and Assets draft/review preview using the existing proposal. Sales manager: continue sales/pipeline work and document changes to identity or shared entry points. Both builders: review the shared shell, department grants and the Sales CRM/Warehouse integration before implementing a common dashboard landing flow. No dashboard routing or access behavior is claimed by this documentation setup.
