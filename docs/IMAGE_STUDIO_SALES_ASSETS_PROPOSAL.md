# Image studio and Sales Assets workflow proposal

Proposed v0.1, November 6, 2026. Documentation only; no application, generation, publishing, file upload or external send has occurred. User / marketing lead owns this proposal; sales manager reviews rep consumption. Both builders review proposed C6 and its C1/C2 dependencies in [CONTRACTS](CONTRACTS.md) and the [permission extension](PERMISSIONS.md). No implementation approval is implied.

This proposal depends on foundation [draft PR #1](https://github.com/Dizzledist/dizzle-business-suite/pull/1) at `925f11d`. Its branch is `docs/image-studio-sales-assets`; PR #1 stays focused on the shared foundation. Foundation C1-C5 and invoice/warehouse acceptance requirements are preserved.

## Confirmed requirements

These come from [PROJECT_SCOPE](PROJECT_SCOPE.md), sections 3, 10-12 and 15, and the user's November 6 request. They are not new technical choices.

| Requirement | Implication |
|---|---|
| User leads marketing, image studio and Assets publishing; sales manager leads sales dashboards | One asset record is published by marketing and consumed by sales; coordinate shared access contracts |
| Studio accepts brand, campaign, prompt, dimensions/aspect ratio and approved references; supports generation, edits, versions and reviewed exports | Capture provenance, usage and versions. Keep provider credentials server-side; preserve exact product/label imagery when required |
| Library supports generated/uploaded images, COAs, catalogs, sell sheets, product photos, videos and authorized price lists | Organize by brand, product/SKU, type, campaign, batch and date; retain owner, approval, access and archive/expiry metadata |
| Send to Sales Reps publishes approved assets to selected/all authorized reps and notifies in app | Approval precedes publication; publisher selection cannot bypass recipient permissions |
| Reps search, preview, download and prepare approved sharing | Scope results, metadata, thumbnails, files and AI retrieval; customer-specific price lists/confidential files remain restricted |
| COA lookup uses the matching approved product/batch | Never generate a COA or substitute another batch; no match is a valid result |
| Retired artwork must not appear as current | Version retirement must remove current discovery and sharing paths |
| External outreach/WhatsApp requires named approval of recipients/content | Asset approval and internal publication do not approve external sends; modified drafts need renewed approval |
| WhatsApp capability is unverified; manual handoff must be labeled | No claim of delivered message from download or share-dialog launch |

Zoho financial and inventory ownership, invoice creator restrictions and the first release workflow remain unchanged. Price-list files do not issue invoices or override Zoho prices. COA batch links reference authoritative product/lot mappings; they do not create a Dizzle stock ledger.

## Proposed lifecycle and user actions

Everything below is a choice for review unless explicitly identified as confirmed above. Proposed state names and fields are domain vocabulary, not provider API schemas.

Use a stable Asset identity with immutable Version records, approval decisions and Publication records. A new draft never overwrites published bytes. Approval concerns an exact version and its permitted use; publication controls distribution of that approved version. The current publication can remain on v1 while v2 is drafted/reviewed.

| Step | Proposed behavior | Validation / audit |
|---|---|---|
| Create draft | Marketing editor uploads a file or requests an image with approved references; choose brand, type, owner, product/campaign and intended use | Private draft, creator/time, original source, file identity and restrictions. Failed/pending generation is not an available image |
| Generate/edit | Record each request/result and usage; review labels/product accuracy before exporting | Store provider/model identifier, input references and usage/cost where supplied. Unknown cost stays unknown. No COA or invented lab result generation |
| Submit review | Freeze candidate bytes, thumbnail/export files, metadata and policy revision | Require title/type, brand, source, access classification and intended audience. Price lists need account scope/effective dates; COAs need exact product/batch/document provenance |
| Approve / reject | Named authorized reviewer approves the exact candidate or returns it with a reason | Bind actor/time to version/file digest, metadata/policy revision, export manifest and audience ceiling. Proposed no self-approval; reviewer roles are M01 |
| Download studio output | Editors may download a draft for internal review with a visible Draft status | Download is not approval/publication; approved exports for reps must belong to the reviewed manifest. External use still needs the proper approval |
| Publish | Publisher previews exact version, selected/all mode and eligible recipient count; confirms internal publication | Revalidate current approval, scope, expiry and actor; audit selected recipients and exclusions without exposing forbidden customer detail |
| Discover/use | Authorized reps find current published versions, preview and download approved exports | Authorize every request, including direct links, thumbnails, search and AI. Show version/effective dates and account/batch limitations |
| Revise | Copy v1 into a new draft v2; edits create a new candidate, not an in-place replacement | Changes to file, export, product/batch, pricing, audience ceiling or use policy require renewed review; old approval does not follow edits |
| Replace / retire | Publish approved v2 and supersede v1 in one recoverable operation, or retire v1 without replacement | Reason/actor/time and replacement link retained. Current views and new shares exclude retired/expired versions; no automatic fallback to v1 |

Proposed version review states: draft, in_review, changes_requested, approved, approval_revoked. Proposed publication states: active, superseded, retired, expired. These are separate: approved does not mean published; publication is ineffective if approval is revoked or its file/policy no longer matches. Expiry is enforced by read/send checks as well as scheduled processing. A review change returns the candidate to draft; previously approved immutable versions remain intact unless explicitly revoked.

Deleting/replacing source bytes or changing audience restrictions must never silently preserve approval. Administrative historical access is a separate audit grant; reps do not get historical file access simply because they once downloaded it. Retention/deletion policy remains M06.

## Publication audience and rep access (proposed)

At publication, preview and store an explicit recipient snapshot: either selected employee IDs or all currently eligible reps. Future hires are not automatically added; adding recipients is an audited publication revision. This snapshot choice is M02; an alternative dynamic audience needs its own reviewed semantics.

For a rep to access a version, all conditions must hold at request time:

1. Active employee in the same organization with the rep asset-read grant.
2. Included in the active publication's recipient snapshot.
3. Version approval is valid; publication/version is current, within effective dates, not revoked/retired/expired, and the requested file is an approved rendition.
4. Rep satisfies brand/confidentiality policy and any customer-account restriction through current assignment under C2. Unassigned/conflicting account scope denies access.
5. Requested product/batch context matches for COA lookup; restrictions are not widened by search, AI or a guessed file ID.

General marketing images do not require assignment to a specific customer. A customer-specific price list always does for rep access, even if mode is all_authorized_reps. All mode means an intersection with restrictions, not a grant of organization-wide customer visibility. Owner/admin review access is an explicit management/audit path, separate from rep distribution.

Internal notification recipients are rechecked at delivery; notifications contain an authenticated library link, not file bytes or private prices. Retries use publication/recipient/event deduplication; do not duplicate confirmed notifications. Reassignment, disabling a rep, retirement and approval revocation invalidate current access, pending notifications and queued share attempts. Broadening a publication beyond the approved audience ceiling requires new approval; narrowing/revocation is immediately restrictive and audited.

Files and derived thumbnails stay private behind authorization. Proposed downloads use an authorization gateway so future requests can be denied immediately; storage and cache implementation are not selected. No public object URLs or long-lived bearer links. Server-side queued work rechecks authorization before execution. Downloaded copies and material already sent outside Dizzle cannot be recalled; retirement blocks future platform access and flags replacement guidance, rather than claiming remote deletion.

External share drafts must name destination/account, actual recipients, version/rendition and message. Named send approval is separate from asset review and binds those details; changing them requires renewed send approval. Revalidate asset/current assignment at send execution. A restricted price list for A cannot be sent to B even with a generic asset approval. Unsupported WhatsApp uses an explicit manual handoff; no automated API delivery is assumed.

## Proposed shared records (C6)

| Record | Proposed content |
|---|---|
| Asset | assetId, organizationId, type, title, brandId, ownerEmployeeId; stable identity across versions |
| AssetVersion | versionId, assetId, version number, previousVersionId, source (upload/generation), private file/rendition refs + digests, product/SKU/batch refs, campaign, metadata/policy revision, effective/expiry times, review state |
| AssetPolicy | policyRevision, classification, allowed brand/use scope, restricted account IDs (empty only for general material), audience ceiling, sharing constraints; owner/admin controls permission grants |
| ReviewDecision | reviewId, versionId, reviewed digests/manifest + metadata/policy revision, reviewer, approved/rejected/revoked decision, reason, reviewedAt; append-only |
| Publication | publicationId, versionId, reviewId, policyRevision, selected/all mode, eligible recipient snapshot, publisher/time, requestKey, revision, status, supersedesPublicationId |
| GenerationRequest | requestId, creator, brand/campaign/prompt/references/dimensions, provider/model, status, output version refs, usage/cost/currency when known, timestamps/error; never credentials |
| AssetAudit / notification outcome | actor, action, target, revision, reason, timestamp, correlation/request key; per-recipient notification status/attempt/delivery reference, not proof of external delivery |

Commands proposed for later interface design: CreateDraft, SubmitForReview, ReviewVersion, PublishVersion, RevisePublicationAudience, RetirePublication and GetAuthorizedAsset/FindApprovedCOA. Mutable commands take an idempotency key and expected revision; authorization is server-resolved. Stale/conflicting publish/retire/review operations fail for reload instead of restoring retired content. Exact routes, storage schema and queue library are deferred.

Publishing atomically commits the active publication, audit and durable notification references (or an equivalent recoverable guarantee). Repeated requests return the same publication and do not duplicate notifications. Concurrent replacements cannot create two current publications for one asset in this proposed single-current-version model (M03). Failure of notification delivery leaves publication visible to eligible reps with retry/failure status; it does not imply customer delivery.

### Synthetic sample records

All IDs, people, products, dates, digests, storage refs and document references below are illustrative. They do not describe actual inventory, prices, laboratory evidence or live employees. Each sample is a compact view of the separate C6 records; timestamps are UTC. `sha256:fixture-*` values are placeholders for future real file digests, not valid checksums. Referenced original files do not exist.

Fixture identities: org-demo; marketing editor E-MKT; authorized reviewer E-REVIEW and publisher E-PUB (grants to decide); active reps R-A and R-B. R-A owns ACCT-A; R-B owns ACCT-B. General brand access is granted to both. No other rep grants are implied.

#### Approved campaign image

```json
{
  "assetId": "AS-IMAGE", "organizationId": "org-demo", "type": "image",
  "title": "Illustrative winter campaign", "brandId": "BR-DEMO", "ownerEmployeeId": "E-MKT",
  "version": { "versionId": "IMG-v1", "number": 1, "source": "generation", "requestId": "GEN-1", "reviewState": "approved", "campaignId": "CAMP-DEMO", "productIds": ["SKU-DEMO-01"], "batchIds": [], "renditions": [{ "fileRef": "private:img1-png", "digest": "sha256:fixture-image", "format": "png", "width": 1080, "height": 1080 }] },
  "generation": { "requestId": "GEN-1", "prompt": "Illustrative campaign background", "approvedReferenceIds": ["REF-APPROVED-1"], "status": "succeeded", "provider": "OpenAI (model to select)", "usage": null, "cost": null },
  "policy": { "revision": 1, "classification": "general_sales", "restrictedAccountIds": [], "audienceCeiling": "brand_authorized_reps", "externalSendRequiresNamedApproval": true },
  "review": { "reviewId": "RV-IMG-1", "reviewer": "E-REVIEW", "decision": "approved", "reviewedVersionId": "IMG-v1", "reviewedPolicyRevision": 1, "reviewedManifestDigest": "sha256:fixture-image", "reviewedAt": "2026-11-06T18:00:00Z" },
  "publication": { "publicationId": "PUB-IMG-1", "versionId": "IMG-v1", "reviewId": "RV-IMG-1", "policyRevision": 1, "mode": "selected_reps", "recipientIds": ["R-A"], "publisher": "E-PUB", "publishedAt": "2026-11-06T18:05:00Z", "status": "active", "revision": 1, "requestKey": "publish-img-1" }
}
```

Expected: R-A can find/preview/download IMG-v1. R-B cannot until an audited audience revision adds R-B within the reviewed ceiling. Publishing IMG-v2 after new approval supersedes IMG-v1; drafting v2 alone does not remove v1.

#### Restricted customer price list

```json
{
  "assetId": "AS-PRICE-A", "organizationId": "org-demo", "type": "price_list",
  "title": "Illustrative ACCT-A terms", "brandId": "BR-DEMO", "ownerEmployeeId": "E-MKT",
  "version": { "versionId": "PRICE-v1", "number": 1, "source": "upload", "sourceDocumentRef": "fixture-approved-price-document", "reviewState": "approved", "fileRef": "private:price-a-pdf", "digest": "sha256:fixture-price", "effectiveFrom": "2026-11-06T18:00:00Z", "expiresAt": "2026-12-01T08:00:00Z" },
  "policy": { "revision": 1, "classification": "customer_confidential", "restrictedAccountIds": ["ACCT-A"], "audienceCeiling": "current_assigned_reps_for_ACCT-A", "externalDestinationAccountIds": ["ACCT-A"], "externalSendRequiresNamedApproval": true },
  "review": { "reviewId": "RV-PRICE-1", "reviewer": "E-REVIEW", "decision": "approved", "reviewedVersionId": "PRICE-v1", "reviewedPolicyRevision": 1, "reviewedManifestDigest": "sha256:fixture-price", "reviewedAt": "2026-11-06T18:00:00Z" },
  "publication": { "publicationId": "PUB-PRICE-1", "versionId": "PRICE-v1", "reviewId": "RV-PRICE-1", "policyRevision": 1, "mode": "all_authorized_reps", "recipientIds": ["R-A"], "publisher": "E-PUB", "publishedAt": "2026-11-06T18:05:00Z", "status": "active", "revision": 1, "requestKey": "publish-price-1" }
}
```

Expected: selecting all results in R-A only. R-B cannot discover prices, title/account details, previews, files or AI snippets. If ACCT-A moves to R-B, R-A immediately loses access. Under the proposed snapshot policy R-B needs an explicit publication revision within the reviewed account ceiling before access; widening that ceiling itself requires renewed approval. Nothing updates Zoho pricing or creates an invoice.

#### Uploaded batch-specific COA

```json
{
  "assetId": "AS-COA-01", "organizationId": "org-demo", "type": "coa",
  "title": "Illustrative batch certificate", "brandId": "BR-DEMO", "ownerEmployeeId": "E-MKT",
  "version": { "versionId": "COA-v1", "number": 1, "source": "upload", "sourceDocumentRef": "fixture-original-lab-document", "sourceIssuerRef": "LAB-FIXTURE", "reportId": "REPORT-FIXTURE-01", "reviewState": "approved", "productIds": ["SKU-DEMO-01"], "batchIds": ["BATCH-DEMO-A"], "fileRef": "private:coa-original-pdf", "digest": "sha256:fixture-coa", "issuedOn": "2026-11-01", "expiresAt": null },
  "policy": { "revision": 1, "classification": "approved_product_document", "restrictedAccountIds": [], "audienceCeiling": "brand_authorized_reps", "externalSendRequiresNamedApproval": true },
  "review": { "reviewId": "RV-COA-1", "reviewer": "E-REVIEW", "decision": "approved", "reviewedVersionId": "COA-v1", "reviewedPolicyRevision": 1, "reviewedManifestDigest": "sha256:fixture-coa", "reviewedAt": "2026-11-06T18:00:00Z" },
  "publication": { "publicationId": "PUB-COA-1", "versionId": "COA-v1", "reviewId": "RV-COA-1", "policyRevision": 1, "mode": "all_authorized_reps", "recipientIds": ["R-A", "R-B"], "publisher": "E-PUB", "publishedAt": "2026-11-06T18:05:00Z", "status": "active", "revision": 1, "requestKey": "publish-coa-1" }
}
```

Expected: exact SKU-DEMO-01 + BATCH-DEMO-A lookup returns the authorized original approved PDF. BATCH-DEMO-B, a different SKU, missing/ambiguous batch or unresolved provider mapping returns no verified match; AI asks for clarification rather than guessing. No expiration value means policy needs reviewer assessment, not a promise of perpetual validity. Marketing cannot use generation/editing to fabricate or alter the report. Corrected issuer documents become new reviewed versions with preserved source provenance.

## Acceptance scenarios for later isolated tests

These are unexecuted design scenarios. Use the synthetic records above and inspect server access, files, audit, version/publication state and notification outcomes. No live generation, sends or uploads are needed for review.

| ID | Given / when | Expected result |
|---|---|---|
| AS01 | Editor creates a generated image draft or uploads a file | Private draft visible only to authorized editorial/review users; reps cannot retrieve it through any path. Generation pending/failed outputs cannot publish |
| AS02 | Reviewer approves IMG-v1, publisher selects R-A | Approval binds exact files/policy; one active publication, audit and in-app work item for R-A; R-A finds/previews/downloads PNG, R-B gets no asset metadata/file |
| AS03 | Publisher chooses all for the general image, within reviewed ceiling | Preview includes eligible R-A/R-B; confirm produces audited snapshot and notifications. Disabled/wrong-organization/non-rep users excluded; future hire excluded until explicit revision |
| AS04 | Rep or ungranted editor calls approve/publish directly; or approved version lacks matching file/policy manifest | Server denies; no publication or notifications. Forged client roles/state and missing approval do not bypass checks |
| AS05 | Editor revises image pixels, export crop, product label or distribution policy after approval | New draft/review needed; original approval cannot authorize altered output. Existing published IMG-v1 remains until superseded/revoked |
| AS06 | Approved IMG-v2 is published as replacement while retirement/publish requests race or retry | One current version; stale revision conflicts; repeated request is idempotent. v1 becomes superseded with reason/replacement; notification delivery is recoverable and deduplicated |
| AS07 | Old image is retired without replacement or reaches expiry | No current search/preview/download/AI/share access; no silent fallback. Historical management view is grant-scoped; already downloaded bytes are not claimed recalled |
| AS08 | All mode is requested for PRICE-v1 | Only R-A is eligible; R-B gets no title/account/price/thumbnail/file/AI snippet even by guessed ID. Publication selection never overrides customer restriction |
| AS09 | ACCT-A is reassigned from R-A to R-B after PRICE-v1 publication | R-A loses access immediately across gateway/caches/queues. R-B remains excluded until approved audience update under snapshot policy; no stale download link preserves R-A access |
| AS10 | R-A prepares to send PRICE-v1 to ACCT-B, or price file is edited/expired before approved send executes | Wrong destination denied; changed version/message/recipients require renewed named approval; expired/retired/unauthorized file blocks execution. Publication alone never authorizes send |
| AS11 | R-A requests SKU-DEMO-01 / BATCH-DEMO-A COA | Returns only authorized current COA-v1 with original provenance and digest. Preview/AI summaries retain product/batch context and cannot substitute generated evidence |
| AS12 | COA lookup uses BATCH-DEMO-B, unknown batch, another SKU, unapproved/revoked document or conflicting mapping | No verified match/clarification; never substitute a nearby batch, create a report, or reveal restricted document metadata |
| AS13 | Issuer supplies corrected COA | New version requires original-source verification and approval; old version retired/superseded and excluded from current lookup. History explains replacement; no overwrite of original report |
| AS14 | Publication notification fails, is retried, or recipient loses permission before dispatch | Visible failure/retry status; no duplicate confirmed delivery; delivery rechecks eligibility and omits sensitive content. Failure does not roll back authorized library access |
| AS15 | Employee identity is disabled, reviewer revokes approval, or publisher narrows audience during a queued download/share | Next platform request/execution is denied; caches/search/AI cannot retain authority. Audit remains; broader grants require explicit authorization |
| AS16 | User chooses WhatsApp group handoff or changes a previously approved external message | Named approval binds actual version/content/recipients. Unsupported capability shows manual handoff; launching dialog/download is not recorded as delivery |
| AS17 | Image generation times out and user retries | Request/outcome stays traceable; ambiguous provider outcome does not claim success or zero cost. Usage ledger distinguishes known/unknown and retry attempts; no automatic publishing |

## Shared review and decisions before implementation

No confirmed baseline requirement is superseded. C6 proposes a new asset contract; C1/C2 are consumed without changing identity or assignment rules. Both builders review C6 and the proposed permission extension; sales manager validates rep isolation, user validates studio/editorial workflow, and owner/admin confirms grants.

| ID | Decision to make (proposed default) | Review owner |
|---|---|---|
| M01 | Who may create, review, publish, retire and revoke? Separate grants and no self-approval proposed; price lists reviewed by designated sales/owner authority and COAs by designated product/document verifier. Delegation/emergency overrides need explicit design | Owner/admin with both builders |
| M02 | Snapshot vs dynamic all-rep audience; new hires/reassignments and restricted audience changes. Snapshot with explicit updates proposed; current authorization always rechecked | Both builders, sales manager leads rep impact |
| M03 | One current version per asset vs concurrent versions per channel/audience; proposed one current version, separate Asset identities for materially different audiences/use cases | Both builders |
| M04 | Exact price-list account/store scope, effective/expiry rules and who verifies product/batch/issuer mappings for COAs. Define required evidence and no-match policy before import | Sales manager + marketing/product verifier |
| M05 | Supported image model, export sizes/formats, exact-label composition, approved references, generation limits/budget and unknown-cost handling. No capability/cost is verified here | User with foundation lead/owner |
| M06 | Private file gateway/cache revocation, retention and historical audit access; replacement guidance for copies already downloaded. Define upload validation and supported preview formats | Foundation lead with owner/admin and both builders |
| M07 | External sharing approval roles, allowed channels/destinations and manual WhatsApp handoff. Verify actual account capability later; publishing internally remains separate | User + sales manager with owner |

After these decisions, implement reviewed C1/C2/file authorization foundations once, then a fixture-backed asset vertical slice: draft image -> review -> publication -> rep access -> retirement. Restricted price-list and COA scenarios must pass before claiming a generally usable Assets library. Provider generation and external delivery require separate integration tasks.
