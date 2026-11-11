---
name: youtube-api-upload
description: Upload workflow for the unified youtube skill, with selected-channel verification, required covers, receipts and processing checks.
---
# YouTube API Upload

First pass [the YouTube channel gate](../youtube/SKILL.md). Reuse the explicit selection within this continuous task. Selecting a channel or finishing a clip alone does not authorize upload.

Use Bun + Elysia with native fetch for provider calls; see [the runtime guide](../../../social-api/README.md). The bundled starter currently supports inventory/verification only. This skill describes the upload workflow; there is no upload endpoint/CLI yet. Do not invent one or silently fall back to the original machine's Python helper.

## Prepare a concrete upload
Use one directory with final nonempty video.mp4, UTF-8 title.txt (1–100 characters), description.txt (at most 5,000 UTF-8 bytes), and separately designed matching thumbnail.png/jpg. Inspect the cover. A missing required cover must be prepared first. Preserve source credits/newlines and validate current limits. Upload multiple bundles only when requested.

Bind the chosen channel/profile, exact file hashes, metadata, visibility and actual audience classification. Animation alone does not imply made-for-kids. When an upload test has no visibility specified, use private and report it. No upload test is implied by packaging this skill.

## Upload and verify
Check receipts/recent uploads before a new insertion. Use the current resumable videos.insert protocol; preserve session/receipt state and handle 308 acknowledgements correctly. Do not blindly repeat initiation or finalization after uncertain writes. Save an accepted video ID before setting the required thumbnail.

Read [operations](references/operations.md) for verification, duplicate handling and schedules. Read back actual channel, metadata, visibility, processing success and plausible duration. Verify the cover visually; Shorts cards may use a separate thumbnail despite API acceptance. Retain the video ID if cover submission fails; repair the cover without reuploading. Report pending processing honestly.

Only requested mutations are authorized. Keep credentials in private profiles, tokens out of logs and receipts, and acquire only needed scopes. Native future publishing must use private status plus a valid future publishAt with timezone, then verify the returned timestamp. A skipped existing upload does not reschedule it.
