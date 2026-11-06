# Roles and permissions

November 6, 2026. Review with [contracts C1-C5](CONTRACTS.md) and [decisions](DECISIONS.md). This is a design matrix, not configured access. Both builders must review; owner/admin approves sensitive grants. Build leads are separate from runtime roles.

Legend: **Yes** = confirmed authority within organization; **Assigned** = currently assigned accounts/leads only and their associated records; **Grant** = explicit action/resource grant required; **Proposed** = intended role capability awaiting workflow/access approval; **No** = denied by default. Every allowed operation still requires active identity and resource scope. Roles may coexist, but department switching never grants them. Broader rights for multi-role staff must come from an actual authorized membership/grant; a rep role alone always remains assignment-scoped.

## Role-by-action matrix

| Action | Owner | Dizzle admin (not owner) | Sales manager | Sales rep | Warehouse | Marketing | Production / operations / finance |
|---|---|---|---|---|---|---|---|
| Create/edit invoice directly in Zoho | Yes, separate Zoho rights | No | Yes, separate Zoho rights | No | No | No | No |
| Create/edit invoice in Dizzle | No | No | No | No | No | No | No |
| Read CRM accounts/leads and related invoices/balances | Yes | Yes | Yes | Assigned | Proposed operational subset | Grant | Grant |
| Reassign accounts/leads | Yes | Yes | Yes | No | No | No | No |
| Push eligible unpaid/partial invoice to warehouse with approved-terms reason | Yes | Yes | Yes | No | No | No | No |
| Manually mark mirrored Zoho invoice paid/change balance | No | No | No | No | No | No | No |
| Read released jobs/items/tracking | Yes | Yes | Yes | Assigned | Proposed released queue | Grant | Grant |
| Read unreleased invoice in warehouse queue | No | No | No | No | No | No | No |
| Pick/scan, allocate packages, record shipment/corrections | Proposed | Proposed | Proposed | No | Proposed | No | Grant after workflow review |
| Adjust inventory or perform stock-impacting transaction in Dizzle | No | No | No | No | No | No | No |
| Manage Dizzle roles, sensitive/full-access grants | Yes | Yes | No | No | No | No | No |
| Read company financial/executive analytics | Yes | Grant for sensitive details | Grant for sensitive details | Assigned sales only | No | Grant | Grant |
| Inspect company assistant history | Yes; disclosure required | Yes; disclosure required | Grant | Own scoped assistant | Own scoped assistant | Own scoped assistant | Own scoped assistant |
| Report cash/check collection | Proposed | Proposed | Proposed | Proposed, assigned | No | No | Grant |
| Verify custody, deposit or reconciliation | Proposed | Proposed | Proposed | No | No | No | Grant; workflow pending |
| Generate/edit marketing images | Grant | Grant | Grant | No | No | Proposed | No |
| Approve/version/publish Assets to authorized reps | Grant | Grant | Proposed sales scope | No | No | Proposed | No |
| Search/download approved Assets | Yes within asset policy | Yes within asset policy | Yes within asset policy | Assigned/authorized asset audience | Grant | Proposed | Grant |
| Approve/send external outreach or WhatsApp | Named approval + grant | Named approval + grant | Named approval + grant | Named approval + grant, assigned | No | Named approval + grant | Grant + named approval |

An unreleased invoice remains visible in authorized sales/finance views; it is excluded from the warehouse queue for every role. Proposed operational warehouse access exposes necessary customer/address/items/source references, not general financial or unrelated CRM browsing. Confirm exact projection and transition authority before implementation (Q06).

Explicit full access can broaden data visibility where deliberately granted; it does not confer Zoho invoice creator rights, bypass release safeguards, change source balances, or authorize unapproved external actions. No role can forge verified payment. Sensitive payroll/bank/mailbox content requires explicit policy/grants; an executive dashboard or sales manager role alone is insufficient.

## Service permissions (proposed technical principals)

| Principal | Allowed boundary | Forbidden boundary |
|---|---|---|
| Zoho sync worker | Read approved organizations, mirror authorized records, assess payment using verified mappings, invoke verified-payment release | Create/edit invoices, invent payment, stock writeback before reviewed contract |
| Release service | Revalidate actor/evidence, idempotently create/update one job and audit | Treat caller-supplied role or balance as authority |
| Notification worker | Approved shipment templates/recipients and in-app/Slack transitions under configured sender policy | Invoice/payment reminders, unapproved outreach, historical replay sends |
| AI tools | Retrieve caller-scoped facts, explain and prepare drafts | Grant access, determine payment from prose, bypass named approval |

Service identities do not inherit interactive admin access. Secrets/scopes and actual provider capabilities remain unconfigured.

## Enforcement and revocation

- Deny unknown actions and unresolved resource scope. Apply permissions at API, database query/service, file download, search, analytics, export and AI retrieval boundaries.
- Revalidate assignment after reassignment and at asynchronous execution. Cached results or old links cannot preserve prior access.
- Job commands check actor, invoice eligibility, reason and source freshness; a UI button is not enforcement. Audit successful terms releases and safe denial metadata.
- Reps cannot access other reps' records by guessing IDs or retrieving an associated invoice, package, file, report or AI summary. Assignment is independent from invoice salesperson and historical authorship.
- External approval binds actual recipients and content to a named approver; modified drafts require renewed approval. Approval is additional to data and send permissions, not a replacement.
- Routine shipment confirmation automation needs approved templates, sender policy and verified customer scope. Zoho continues to own invoice/payment communications.
- Offboarding disables access/revokes tokens according to a policy still to be agreed; do not delete historical authorship as a shortcut.

## Phase 0 review policies: jointly approved November 6, 2026

Cheddr and Dizzle Sales Manager jointly approved R01-R03 as reviewed at commit 609f2ca; see [DECISIONS](DECISIONS.md) for the dated sign-off record. These are approved policy requirements; runtime permissions are not configured. Other proposed technical details remain subject to review; confirmed release-role and Zoho ownership restrictions remain unchanged.

- **R01:** A sales rep role alone grants access only to assigned accounts. A separately granted role or full-access permission can broaden access only within its authorized scope. No role selection or historic assignment grants access; inactive identities, revoked permissions and organization boundaries still deny unauthorized requests.
- **R02:** Hold a manual terms release when current invoice validity or the account mapping cannot be verified. If a warehouse job already exists, preserve it and flag stale verification for review. Neither full access nor a terms-release role establishes payment or overrides uncertain invoice eligibility.
- **R03:** An authorized releaser must record the applicable approved terms and the reason for early release. That record is sufficient when approved terms are already documented. Missing or disputed terms hold the release for explicit approval. Approval authority and evidence format remain open; any later approval must be recorded and the release safeguards rechecked.

See [ACCEPTANCE](ACCEPTANCE.md) A26-A30 for review-follow-up cases. Removing an action grant does not remove unrelated grants, but no revoked permission may continue to authorize the affected record access or release through caches, old sessions or queued work.
