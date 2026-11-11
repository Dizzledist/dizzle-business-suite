# OpenAI image generation: local setup

November 11, 2026. This task replaces the sample SVG generation path with a server-side OpenAI Image API adapter. New generation results are PNG files; existing synthetic SVG library/reference fixtures remain clearly identified as fixtures. Business identities and invoice data are still local fixtures. This is not a production deployment.

## Configure the key

The project-root `.env` file is Git-ignored and was created with an empty `OPENAI_API_KEY` placeholder. Open that file locally and enter your OpenAI project key after the equals sign. The server reads it when the API starts. `.env.example` documents the variable names; it contains no secret. Do not overwrite an existing private configuration file to copy the example.

- `OPENAI_API_KEY`: required for real generation; read by the API only.
- `OPENAI_IMAGE_MODEL`: defaults to `gpt-image-2.6-sunburst`. The supported server-side choices are gpt-image-1.5, gpt-image-2, gpt-image-2.5-sunburst/flare and gpt-image-2.6-sunburst/flare. Your project must have access to the chosen model. Existing local choices remain valid; the UI shows the configured model.
- `OPENAI_IMAGE_QUALITY`: low, medium or high; defaults to medium.

The Sales CRM Zoho branch has a separate documented convention: a private server environment file outside its checkout, plus an encrypted refresh-token file at `ZOHO_TOKEN_STORE_PATH`. Its actual private file was not found in this marketing workspace. Zoho credentials/token storage were not copied, changed or reused. You can also provide OpenAI variables through an existing private server environment, for example by starting only this backend with Node's `--env-file` option. The backend's local `.env` is a fallback; inherited process variables take priority. Keep the frontend process free of provider secrets. Consolidating both providers into the reviewed common server configuration remains integration work.

Restart this marketing API after changing configuration. Use `npm run dev` with the existing DIZZLE_WEB_PORT / DIZZLE_API_PORT preview settings. Current isolated preview: http://127.0.0.1:5473, API 3301. Choose Marketing editor, then Image Studio. The setup panel reports configuration readiness without returning the key. A configured key is not proof of model access or billing; the first generation verifies those. An absent key disables the Generate button and the API rejects generation without creating a job or making an outbound call.

Official references: [server-side API authentication](https://developers.openai.com/api/reference/overview#authentication), [image generation guide](https://developers.openai.com/api/docs/guides/image-generation), [generate endpoint](https://developers.openai.com/api/reference/resources/images/methods/generate), [image edits endpoint](https://developers.openai.com/api/reference/resources/images/methods/edit). The implementation fixes the upstream host to api.openai.com; the browser cannot supply a destination or model credential.

## Generate, review and publish

1. Select a brand/campaign and enter the image prompt. Choose a new asset or a new version of an existing creative in that campaign.
2. Optionally upload PNG, JPEG or WebP references (5 MB each, 24 million decoded pixels maximum). Original uploaded bytes are saved unchanged. Choose up to four references. Selected images are sent to OpenAI; the adapter converts separate copies to PNG for the image-edit request. Existing sample SVG references can also be converted, but they remain synthetic examples, not real brand masters. Image guidance does not guarantee exact labels/product fidelity; review is still required.
3. Choose 1080 x 1350, 1080 x 1080 or a custom export size from 64 to 4096 pixels per edge. Generate one image. The provider renders at a supported standard size (1024 square, 1024 x 1536 portrait or 1536 x 1024 landscape); Sharp fits the complete result to the requested PNG export with transparent padding if needed. There is no cropping or stretching. Native provider size is retained in job provenance.
4. The request returns a running job immediately; the UI refreshes status while it works. Prompt, references, dimensions, model, quality, provider request ID and returned token usage are retained. Dollar cost is not returned by this request and is not estimated. Preview/download `artwork-vN.png`, then submit the exact version for review.
5. Owner reviews/publishes and eligible reps consume the same protected bytes through the existing workflow. Approval, audiences, restricted price-list assignment checks and retirement remain unchanged. A generated image never becomes a COA or an approved reference document automatically.

## Billing, retries and saved data

The local pilot allows one in-flight image request, at most ten attempts per UTC day and at most three attempts on a retryable job. Counts persist across API restarts. These are request-count guards, not a dollar budget or an organization-wide provider spending limit. Generation and explicit retries can incur OpenAI charges. No SDK/HTTP automatic retries are enabled.

Client request UUIDs are saved before calling the provider. Replaying the same creation command returns the same job; a changed payload with the same UUID is rejected. Retry commands have their own deduplicated UUID. Invalid-key, model-access and quota failures have sanitized actionable errors. A timeout, connection interruption, 5xx or malformed/partial success is treated as an uncertain outcome: no blind retry button. Check OpenAI usage before creating a new job. An API restart during a running job likewise marks its outcome uncertain, with no automatic resubmission. Changing model/quality configuration requires a new job rather than changing a retry's provenance.

Marketing metadata and file bytes are saved atomically in a local JSON snapshot outside the web workspace: `~/.dizzle-data/marketing/<checkout-path-hash>/state.json`. The key is never included. This is one process's private local store, not a multi-user production database or a backed-up storage service. Do not run two API processes for this checkout. Invoice/payment fixtures remain in memory. Reset demo resets those invoice fixtures while preserving saved marketing work and paid image history. File retirement stops future authorized rep retrieval; it cannot erase downloaded copies.

Production identity, multi-process locking, managed storage, backup/retention, a durable worker and full review-event ledger remain separate foundation tasks. The local selectable identities must never be deployed as authentication.

## Verification

`npm run check` runs typecheck, HTTP/provider/store tests, build and Chromium tests. Tests inject a dedicated PNG provider from `tests/fixtures/image-generator.ts` and run `tests/browser/fixture-server.ts`; runtime has no environment flag that silently switches to fake generation. Tests never need your key, call OpenAI or incur charges. Provider tests inspect outbound generation/edit payloads with a stub transport, validate PNG output/size, errors, usage and redaction. Store tests exercise restart persistence, idempotency, uncertain recovery, limits, original bytes and protected publication. Browser tests demonstrate raster-reference upload through PNG generation/review/rep download and a disabled missing-key state.

A live account test requires the user to supply a key privately. No live result or paid call is claimed until that test has actually occurred; current account-verification status is recorded in HANDOFF and the final response.
