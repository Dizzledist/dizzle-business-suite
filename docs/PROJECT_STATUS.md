# Project status

Updated: November 6, 2026 (America/Los_Angeles).

## Verified starting state

- Repository: Dizzledist/dizzle-business-suite; origin is `https://github.com/Dizzledist/dizzle-business-suite.git`.
- Initial branch: main, tracking origin/main. Fetch verified the task base at `aeab1c854041e3ee1ae4ed1ffd084c86738b687c` (Set up Dizzle project brief and README).
- Starting tracked tree was clean; `dizzle-business-suite.code-workspace` was the only untracked file. Preserve it locally and exclude it from this commit.
- Only README and [scope v2.0, November 4](PROJECT_SCOPE.md) were tracked. No application, dependencies, tests, provisioning or live integration was present.

## Current task: Phase 0 shared foundation

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
