# Local Marketing Workspace

Updated November 11, 2026. Cheddr leads implementation; both builders review shared identity/API/navigation and sales consumption. Business records and initial artwork are synthetic fixtures. New images are generated through OpenAI when a server key is configured. Marketing metadata and files are saved privately outside the checkout; invoice/payment fixtures reset separately. The identity selector remains local test infrastructure, never production authentication. See [OpenAI setup and storage](OPENAI_IMAGE_GENERATION.md).

## Run and reproduce

Navigation update, November 11: Home, Calendar, Image Studio, Review and Assets are in the left workspace panel. On narrow screens, use the menu button at the top left to open that same panel; Escape or the close button dismisses it. Keyboard users can move between sections with Up/Down/Home/End. Calendar shows the plan first; **New campaign** or **New content** opens the relevant editor, and **Close editor** returns to the plan. Image Studio has its own brand selector; the page-level brand filter applies to the other sections.

Use Node 24.x, `npm ci`, then `npm run dev`. Open **http://127.0.0.1:5173**. If another preview occupies the defaults, use PowerShell:

```powershell
$env:DIZZLE_WEB_PORT = '5473'
$env:DIZZLE_API_PORT = '3301'
npm run dev
```

That preview opens at **http://127.0.0.1:5473**. Keep both ports free; do not stop another builder's server. Port variables are optional. Browsing and planning need no provider credential; real image generation requires OPENAI_API_KEY in the API environment. `npm run dev:web` is the historical fixed-port command; use `npm run dev` for configurable preview ports.

1. Select **Marketing editor**. Home shows record counts, upcoming content, review links and published creative. The brand filter scopes Home, Calendar, Review and Assets; Image Studio has its own brand/campaign selection.
2. Open **Calendar**, then **New campaign**. Create a Cheddr campaign with title, objective and owner. The content editor opens after campaign creation; **New content** also opens it directly. Select that campaign; enter title, objective, owner, channel, destination account, Pacific date/time, caption and optionally an exact approved creative version. **Create draft**, then **Submit review** in the plan. Channel and status filters scope the date-grouped plan. Scheduling is internal only.
3. Open **Image Studio** after configuring the server key as described in [OpenAI setup](OPENAI_IMAGE_GENERATION.md). Select a brand/campaign, enter a prompt, upload/select up to four original references and choose export dimensions. **Generate image** starts one OpenAI request and shows running/succeeded/failed status. Preview/download the PNG and **Submit version for review**. A variation creates a new draft version; originals and previous output bytes remain unchanged. Model-supported renders are fitted to the requested export without cropping. Retry is explicit and available only for a confirmed retryable failure; uncertain outcomes are held for usage review.
4. Select **Owner**, then Department **Marketing**. Open **Review**, inspect the exact content, destination and time or creative version, enter notes, and approve or return it. Owner is the only fixture with review/publish grants. Self-approval is disabled for creator and latest content editor; this is a conservative demo rule pending joint review.
5. In **Calendar**, schedule approved content internally. In **Assets**, find the approved version, choose **Selected reps**, check Rep A and **Publish approved version**. Repeating the same active publication returns the same record. All-reps mode stores the currently eligible recipient IDs. Later hires are excluded until explicitly published to; current assignment and grants are still checked on every read.
6. Select **Rep A**. In the local Sales view use **Find Assets** to search title, brand, campaign, kind, SKU or batch. Preview/download the creative. Search `BATCH-26-044` and expand the synthetic COA preview. Search `Juniper` to download/preview the restricted CSV price list. Rep B cannot discover or directly download Rep A's selected creative or Juniper price list.
7. Return to **Owner → Marketing → Assets** and **Retire** a publication. It records the actor/time/reason and blocks future rep discovery/file requests for that publication. Other explicitly active publications remain effective. Retirement cannot recall copies already downloaded.

## Fixture authority and decisions

| Identity | Allowed local behavior |
|---|---|
| Marketing editor | Marketing workspace, campaign/content preparation, generation and draft downloads; no invoice, review, publish or restricted-document access |
| Owner | Sales + Marketing; prepare, review other people's work, publish, retire and read all marketing documents |
| Rep A / Rep B | Sales view and currently authorized published Assets; current account assignment additionally limits price lists |
| Sales manager / Admin / Warehouse | Existing invoice/warehouse authority only; no implicit marketing grant |
| Disabled / Revoked / Other organization | Existing denial behavior; no marketing or protected-file bypass |

MKT04–MKT06 in [DECISIONS](DECISIONS.md) distinguish this authorized local scope from production policy. PR #2 remains a proposal; its complete schema/workflow is not silently adopted. The conservative demo uses recipient snapshots, explicit owner grants, no self-review, version-specific approval and publication retirement. Multiple versions/publications can remain active until individually retired; automatic replacement, expiry, document verification and full immutable review-decision history are deferred. Editors do not receive restricted price-list/COA metadata in the workspace response.

## API and integration boundaries

`server/marketing.ts` owns campaigns, content items, assets, versions, generation jobs, publications and protected files. The `ImageGenerator` boundary now uses server-side OpenAI generation/edits and PNG results. `MarketingStore` saves marketing metadata/files locally outside the web workspace. API jobs return immediately and the UI polls for completion. Internal publication only changes library visibility; there is no external campaign-send worker.

- `/api/marketing/workspace`, `/campaigns`, `/content`, `/content/:id`, `/content/:id/submit|review|schedule` (paths after the first share `/api/marketing`).
- `/api/marketing/generation-jobs`, `/generation-jobs/:id/retry`, `/versions/:id/submit|review|publish`, `/publications/:id/retire`, `/versions/:id/file` under the same prefix.
- `/api/marketing/references` uploads validated raster references under the existing creative-generation grant. Creation and retry requests include UUID request keys; job creation/retry returns HTTP 202.
- `/api/assets` and `/api/assets/:assetId/versions/:versionId/file` serve the same approved published bytes to authorized reps. `?download=1` sets attachment disposition. No public file URLs are created.

All routes resolve the existing server-defined identity, validate organization and action grants, and recheck file visibility. Content edits through PATCH reset approval/scheduling; changes to caption, creative version, destination or time require review again. Linked creative must be approved and from the same brand. Draft creative cannot be published or retrieved through a rep file URL. These checks preserve existing invoice release and rep assignment behavior.

Shared files requiring both builders' review: `shared/contracts.ts`, `server/fixtures.ts`, `server/workflow.ts` (assignment predicate only), `server/api.ts`, `src/App.tsx`, `src/styles.css`, the reused local-port helper and preview/test configuration. Sales CRM's session/password routes run before fixture authentication on its separate branch; do not transplant these fixture routes into that session boundary without adapting the actor and testing tenant/account scope. Warehouse adds move grants, job fields, routes and board UI in the same files; preserve those during the later integration task. No branches are merged by this PR.

## Validation and remaining slices

Run `npm run check`: typecheck, HTTP tests, build and Chromium tests, including the original invoice-to-warehouse regressions. Marketing coverage includes draft/review/schedule, isolated provider error/retry, immutable variations, self-review denial, unapproved publication denial, audience snapshots, restricted documents, protected list/file permissions, retirement, rep preview/download, mobile layout, filters and error recovery. Browser screenshots are written to ignored `test-results/`.

The runtime supports real OpenAI calls, raster-reference upload and local saved history. Account-specific live verification is reported separately; automated tests use injected PNG providers with no paid calls. External campaign posting/messages, Omnisend/GA4 reporting, managed production storage, production authentication, notification delivery and combined Sales CRM/Warehouse integration remain outside this task. COAs are seeded uploaded-document fixtures with explicit provenance, never generated lab evidence. Full production policy and integration remain for both builders' review.

Next slices are recorded in [HANDOFF](HANDOFF.md): scheduling/publishing agent with exact-content approval and one verified channel first; brand kits/product library; production storage/budgets/exact-product composition; multichannel planning and UTM; verified reporting; and approved lead/influencer distribution with WhatsApp verification.
