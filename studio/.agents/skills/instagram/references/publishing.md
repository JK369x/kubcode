# Publishing

This is the publishing workflow, not an existing starter endpoint. Implement requested provider calls with Bun fetch in an Elysia service. Select/verify the account and actual Instagram Login grants before any publishing operation. No account was connected or published while packaging these skills.

## Prepare
Bind the exact final export, caption, account, media type and requested publication time. Every video/Reel needs a separate matching inspected cover; do not silently substitute a frame. Convert a cover to the supported format when necessary. Check current type-specific codecs, dimensions, duration and cover support.

Meta must fetch video_url/image_url/cover_url from authorized public HTTPS hosting for this login flow; localhost paths do not work. Staging is separate and not supplied by the starter. Expose only the chosen media/cover, never a project or credentials directory, and never forward the provider token to a media host. Do not promise that Facebook Login resumable routes work with Instagram Login.

## Execute and verify
1. Verify selected identity and content_publishing_limit. Check receipts and recent owned media for duplicates.
2. Create a private receipt keyed by selected user_id, video/cover SHA-256 and caption before mutation.
3. POST /<user_id>/media with current supported fields (REELS uses video_url and caption; apply required custom cover). Save container ID immediately. For carousels preserve ordered item IDs and parent container.
4. Poll the specific container status within documented bounds. FINISHED means ready, not published. Preserve IDs on ERROR/EXPIRED or uncertain writes.
5. POST /<user_id>/media_publish with creation_id only when ready and authorized. Save media ID immediately.
6. Read back permalink/caption/type under the selected account, and visually verify the actual custom cover/crop. API acceptance does not establish cover verification.

Serialize per profile and reconcile uncertain writes before retrying. Never reupload to fix a verification report. A missing/unusable required cover blocks publication.

For future publication read [scheduling](scheduled-publishing.md). No scheduler, staging relay, refresh worker or automatic duplicate reconciler is included in the Bun starter.

[Official content publishing](https://developers.facebook.com/documentation/instagram-platform/content-publishing).
