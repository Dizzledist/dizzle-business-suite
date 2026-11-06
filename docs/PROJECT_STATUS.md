# Project status

Updated: November 6, 2026 (America/Los_Angeles).

## Verified starting state

- Repository: Dizzledist/dizzle-business-suite; origin is `https://github.com/Dizzledist/dizzle-business-suite.git`.
- Initial branch: main, tracking origin/main. Fetch verified the task base at `aeab1c854041e3ee1ae4ed1ffd084c86738b687c` (Set up Dizzle project brief and README).
- Starting tracked tree was clean; `dizzle-business-suite.code-workspace` was the only untracked file. Preserve it locally and exclude it from this commit.
- Only README and [scope v2.0, November 4](PROJECT_SCOPE.md) were tracked. No application, dependencies, tests, provisioning or live integration was present.

## Foundation baseline: Phase 0 shared foundation

Active lead: current Codex session for the user. Branch: `docs/phase-0-foundation`, created from fetched origin/main. Main is not a development target for this session.

Deliverables: [conventions](../AGENTS.md), [handoff](HANDOFF.md), [decisions](DECISIONS.md), [contracts](CONTRACTS.md), [permissions](PERMISSIONS.md), [acceptance scenarios](ACCEPTANCE.md), and README navigation. These are documentation proposals where labeled, not implemented functionality. Publication and verification outcomes are appended to the handoff.

Phase 0 documentation is committed and published in [draft PR #1](https://github.com/Dizzledist/dizzle-business-suite/pull/1), targeting main. Shared contract review and unresolved provider/ownership decisions remain open; Phase 0 is not represented as provisioned infrastructure or completed business signoff. Both builders must review contracts C1-C5, permission proposals and acceptance scenarios before dependent implementation.

## Next tasks by builder

| Builder | Next scoped task | Dependencies and completion evidence |
|---|---|---|
| Sales manager | Review C1-C5 and permissions; define fixture-backed sales rep/manager/owner data requirements and account-assignment examples | Confirm account/store/buyer scope, sensitive reporting grants and invoice matching. Produce agreed fixture cases for rep isolation, source freshness and paid/partial balances before UI work. No independent Zoho connector |
| User / marketing lead | Review C1-C5 and permissions; define marketing/image studio/Assets approval and rep-consumption contract | Specify asset versions, brand/SKU/batch, approver, recipient scope, expiry/archive, and generation usage. Agree handoff to sales; no image generation, external publishing or live sends in that documentation task |
| Shared foundation (one lead to appoint) | Select repository layout and local foundation implementation task after shared review | Resolve identity/grant design and source mappings needed for fixtures; scaffold in a separate task. Then prove the invoice-to-warehouse vertical slice using isolated tests before live provider integration |

Dashboard build ownership is confirmed; warehouse/production ownership and merge/deploy operators are still proposed/open. See [DECISIONS](DECISIONS.md). Neither builder should independently scaffold shared services while the other is selecting them.

## Milestones and gaps

| Phase | Current evidence |
|---|---|
| 0: Shared setup | Documentation prepared; review, active foundation lead and provider facts pending |
| 1: Foundation | Not started: login, authorization, database, files, audit and durable jobs |
| 2: Zoho workflow | Not started: mirror, verification, release and tracking; [acceptance](ACCEPTANCE.md) specifies intended evidence |
| 3-6: Departments through cutover | Not started; Replit remains operational until migration and departmental signoff |

No launch date, budget, runtime stack versions, provider accounts, deployment or automated check results are claimed. Open Zoho questions block only dependent behavior, not unrelated documentation or fixture design.

## Current task: image studio and Sales Assets proposal

November 6: active lead is user / marketing lead with Codex. Branch `docs/image-studio-sales-assets` starts from fetched `origin/docs/phase-0-foundation` at `925f11d`, because PR #1 has not merged into main (`aeab1c8`). Initial tracked tree was clean; the workspace file remains local/untracked. This is an explicitly dependent documentation branch; no proposal commits go to the foundation branch. Separate draft PR targets main per repository convention and will include prerequisite foundation commits until PR #1 merges; review the proposal delta against the foundation branch in the meantime.

The [proposal](IMAGE_STUDIO_SALES_ASSETS_PROPOSAL.md) covers draft/review/publish/version/retirement, selected/all audiences, immutable approvals, three synthetic asset examples and AS01-AS17. Shared additions: proposed C6 and explicit editorial/publication action grants, logged in DECISIONS as M01-M07. C1-C5, A01-A25, AGENTS and PROJECT_SCOPE are preserved. No application, dependency, infrastructure, provider call, generated image or external send is part of this task.

Published as [draft PR #2](https://github.com/Dizzledist/dizzle-business-suite/pull/2), dependent on PR #1. Review the [proposal-only delta](https://github.com/Dizzledist/dizzle-business-suite/compare/docs/phase-0-foundation...docs/image-studio-sales-assets) while the foundation remains unmerged. Documentation checks passed: 52 relative links, three parseable sample JSON records with consistent references, 17 unique scenario rows and whitespace review. These do not constitute runtime acceptance or shared signoff.

Next tasks after proposal review:

- **User / marketing lead:** Decide/editorially review M01 and M03-M07, nominate image/price-list/COA reviewers with owner/admin, and settle image inputs/exports and retirement behavior. No generation is authorized by this proposal.
- **Sales manager:** Review C6 and M01-M04/M07, validate selected/all recipient behavior, confidential price-list assignment changes, exact-batch COA lookup and rep UI fixtures. Sales/owner requirements remain their build responsibility.
- **Shared foundation:** Both builders review C6/C1/C2/file-access boundaries and appoint one active lead. Merge/review PR #1 through the agreed process before accepting the dependent proposal; later scaffolding and provider integrations remain separate tasks.
