# Upload operations

These are REST implementation requirements for Bun + Elysia, not existing CLI commands. Check official method docs before adding a new upload route. Verify the exact selected channel in the same operation; use private server credentials and fixed Google HTTPS origins.

## Resumable upload and receipts
Before mutation, create a private receipt keyed by channel ID and SHA-256 video hash, retaining title/description, cover hash, privacy/audience and requested publishAt. Serialize per profile. Keep session URLs secret; provider URLs can contain capabilities. Handle documented resumable 308 responses and query existing session progress before retrying. An uncertain receipt with no confirmed ID blocks reinsertion until reconciled with recent uploads.

Existing video hashes mean reuse/report the ID, not silently edit metadata or visibility. Preserve returned IDs even if thumbnails/verification fail. Report sanitized HTTP status and missing scope/quota without printing authorization, raw provider errors or credential-bearing URLs. Do not delete as a test.

## Verify
Use videos.list for actual snippet.channelId, title/description, status.privacyStatus, processingDetails and contentDetails.duration. A processing upload is not ready. Verify the required thumbnail using thumbnails.set and readback, then inspect its actual visual use.

## Mandatory Shorts cover verification
A hasCustomThumbnail/API success signal does not prove the Shorts card displays the designed cover. Inspect the real card/thumbnail surface. If unresolved, preserve the accepted video ID and report cover verification pending; do not reupload to repair a report.

## Schedules
For a new scheduled video, insert with private privacyStatus and a valid future status.publishAt. Use an explicit offset/timezone and one requested target time per bundle. Verify the actual returned publishAt. Updating an existing video's schedule is separate work with its own scope and preserved writable fields. YouTube scheduling does not create an IG schedule or local background queue.

[Resumable upload protocol](https://developers.google.com/youtube/v3/guides/using_resumable_upload_protocol), [videos.insert](https://developers.google.com/youtube/v3/docs/videos/insert), [thumbnails.set](https://developers.google.com/youtube/v3/docs/thumbnails/set).
