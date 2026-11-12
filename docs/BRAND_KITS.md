# Reusable Brand Kits

November 11, 2026. Each configured brand has its own saved visual direction and private reference library. This reuses existing marketing identity, asset storage and image-generation permissions; it does not create a new auth or file service.

## Set up a brand

1. Open the marketing workspace and select **Brand Kits** in the left panel. Choose Cheddr, Dizzle Dist or another configured brand. New kits start blank; sample branding is not silently treated as company policy.
2. Under **Written brand bible**, upload a UTF-8 `.md` file containing the full written overview (up to 80 KB and 20,000 characters). Review/edit the imported text, then **Save brand kit**. The text and filename are stored privately with the kit and the full text is included in future image prompts. Oversize, empty, invalid UTF-8 and non-Markdown imports are rejected without shortening or changing saved text. Replacing/removing existing text asks before changing the draft; save to apply. Markdown stays plain editable text; links/images/scripts inside it are not fetched or executed. Enter image type, visual style, palette, typography/layout, logo/packaging rules, things to avoid and any additional written guidelines from your brand bible.
3. Add reference images once. Select up to 20 files per batch: PNG, JPEG or WebP, up to 5 MB each. Original uploaded bytes remain unchanged in the existing private local store. For a PDF brand bible, export relevant pages as images and paste the relevant written rules; PDF/font ingestion is not implemented.
4. Organize images as Logo, Product photo, Style example, Brand-bible page or Other reference. Search by name or filter by category. The library displays 24 images per page.
5. Mark up to four **Use by default** images and **Save brand kit** or **Save reference choices**. Categories/defaults and written rules save together. Image uploads themselves save immediately. The saved revision and author are visible. Unsaved edits are labelled, and switching brands asks before discarding them.

A useful starting set is one product original, a logo and one or two strong style examples. The library can hold more examples than a single request uses. Choosing four defaults fills the current per-request reference budget; use fewer if individual briefs need additional images. The server rejects excess combined references instead of silently dropping a default.

## Generate with the kit

Select the brand/campaign in **Image Studio**. Its saved kit revision and default-reference count are shown. Defaults are preselected and cannot be unchecked there; change them in Brand Kits. You can select additional saved references or upload image-specific additions while staying within four total.

The server adds the saved written rules and default images to every new generation request for that brand, even when the browser sends no reference IDs. It names each selected reference and its category in the effective prompt. The image brief supplies the new scene/content; the saved direction supplies the recurring visual treatment. Defaults are sent first in saved order, followed by distinct image-specific selections.

This improves consistency through repeated instructions and reference input. It does not fine-tune a model or guarantee identical layouts, exact typography or pixel-perfect logos/packaging. Original files remain available, and generated output still needs the normal exact-version review before sales publication. Official context: [OpenAI image prompting](https://developers.openai.com/api/docs/guides/image-prompting).

Every new job retains its kit snapshot/revision, effective prompt and exact reference IDs. Expand **Brand kit vN used for this image** in its job card to inspect the applied direction. Editing the kit affects new requests only. Replayed request UUIDs return their original job, and retries use the original kit/prompt rather than silently applying newer rules. Images created before Brand Kits remain available with a legacy provenance label.

## Storage, access and limits

- Brand settings and library images share the existing local marketing snapshot outside the web workspace. Restart and invoice Reset demo preserve saved kits and images. Existing snapshots lacking kits are extended with blank kits without replacing previous image history.
- The existing `workspace:read` grant allows marketing workspace/library reading. `campaign:write` allows kit editing; `creative:generate` allows raster uploads and generation. These are existing conservative local grants, not new production policy. Sales reps, warehouse-only, disabled/revoked, foreign-organization and ungranted actors cannot read/edit the marketing kit through the API.
- Kit saves include an expected revision; stale changes are rejected for refresh rather than overwriting another editor. Every default/category reference must belong to the same organization and brand and be an original reference asset. COAs, price lists and generated drafts cannot be attached as kit references.
- A save supports category mappings for up to 500 references; each generation keeps the existing four-image cap and billing/attempt guards. Private file previews/downloads reuse the existing authorization gateway. Saving a kit does not publish an asset or make an OpenAI call.

Known boundaries: local single-process storage, selectable test identities, no production brand-level membership administration, no PDF extraction, no font uploads, no per-image-type preset catalog and no complete historical kit-edit ledger. Generation snapshots preserve the kit used for each image. See [OpenAI setup](OPENAI_IMAGE_GENERATION.md) and [handoff](HANDOFF.md) before combining this work with Sales CRM/Warehouse sessions or production storage.
