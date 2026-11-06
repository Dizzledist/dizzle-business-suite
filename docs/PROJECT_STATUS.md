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

## Current follow-up: Phase 0 joint review

November 6, 2026: active lead is the current Codex session for the user, updating only `docs/phase-0-foundation` and existing [draft PR #1](https://github.com/Dizzledist/dizzle-business-suite/pull/1). Before editing, verified starting PR #1 head and fetched branch at `925f11d`; PR #2 remains draft at `451b6b5`, main at `aeab1c8`. The tracked tree was clean; the workspace file stays untracked and out of commits.

Added pending recommendations R01 (assignment-only rep role with scoped separate grants), R02 (hold unverifiable manual release; preserve existing job with stale-review flag), and R03 (record documented approved terms plus early-release reason; hold missing/disputed terms for explicit approval). See [DECISIONS](DECISIONS.md) for the full wording and pending user/sales-manager joint sign-off. C1/C5 and permissions refer to those pending recommendations. Acceptance now includes A26-A30 for partial payment after manual release, different release keys, disabled/revoked/cross-organization denial, existing-job stale verification and missing/disputed terms.

- **Next for both builders:** Review and jointly sign off or amend R01-R03; no acceptance is inferred from this documentation update.
- **Assignments for user and sales manager:** Merge operator and Phase 1 lead remain unassigned. No role is appointed by this session.
- **Still open:** Q01-Q04 Zoho behavior and other recorded integration questions; no provider capability or payment policy has been verified here.
- **Hold:** Keep both PRs in draft, main unchanged and app scaffolding on hold until review is complete. No app code, dependencies, infrastructure or live integrations are added. PR #2's Assets proposal stays on its own branch; reconciling it with this foundation follow-up is a later task.
