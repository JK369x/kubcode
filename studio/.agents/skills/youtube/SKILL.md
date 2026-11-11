---
name: youtube
description: >-
  Operate YouTube APIs after selecting and verifying the target channel. Use for
  channel/video data, uploads, metadata, thumbnails, playlists, comments, captions,
  Analytics, bulk reports or live management, including "ใช้ API YouTube",
  "จัดการช่อง", "ลงคลิป", and "ดูสถิติช่อง". Pure scripting or video production
  without a YouTube account/API task belongs to the relevant creative skill.
---

# YouTube

One entry point for YouTube API work in this clone. Select the channel first, then load only the needed operation reference. Use Bun + Elysia and native fetch for provider calls; read [the shared runtime guide](../../../social-api/README.md). No account credentials are included. The starter implements inventory and identity verification only; other operations below are workflows to implement when requested.

## Channel selection comes first

Before any YouTube API call, token refresh, OAuth launch or remote operation:

1. Enumerate local connection metadata as described in
   [references/channel-and-auth.md](references/channel-and-auth.md). This is disk-only.
2. Use the channel explicitly named in the current request, or a selection already
   made for this exact ongoing task. Otherwise show the available channels and ask
   which one to use. **Even one connected channel requires selection.** Do not infer a channel from an earlier task, a default profile, a filename or a Google login.
3. Bind the choice to an absolute profile directory and exact channel ID. An unconnected
   channel needs its own OAuth connection; another channel token cannot substitute.
4. After selection, verify `channels.list(mine=true)` matches that chosen ID, and
   state the channel name/ID for the operation. Stop on any mismatch.

Repeat selection when a new task starts without a target or when the user switches
channels. Keep the verified choice within one continuous task, so multi-step work
does not ask repeatedly. Selecting a channel does not authorize unrelated changes.
When asked only to create/edit this skill, no channel or remote call is needed.

## Route the selected task

| Requested work | Read after channel selection |
| --- | --- |
| Upload a finished clip or set its cover | [Upload workflow](../youtube-api-upload/SKILL.md) |
| Channel/videos, metadata, playlists, comments, captions, searches | [Data API](references/data-api.md) |
| Watch time, retention, traffic, revenue, bulk reports | [Analytics and Reporting](references/analytics-and-live.md#analytics-and-reporting) |
| Broadcast scheduling, stream binding, live chat | [Live](references/analytics-and-live.md#live) |
| Missing connection, expired token or scope | [Channel and OAuth](references/channel-and-auth.md) |

For copywriting or analysis optionally install `yt-package`, `yt-seo`, `yt-comment`,
`yt-chapters`, `yt-audit` or `yt-retention` when useful (not bundled here); this skill supplies the selected
channel context and API work. Drafting a reply is separate from posting it.

## Execute only the requested operation

The upload workflow requires `youtube.readonly` and `youtube.upload`. A selected profile may additionally hold `yt-analytics.readonly`. Check actual granted scopes and enabled API; OAuth permission alone does
not prove report access. Comment replies, playlist writes, revenue and metadata updates
need their own method scopes and authorization. Obtain only capabilities needed now.

For writes, read and identify the target resource under the selected channel first,
preserve unaffected writable fields, execute the requested change, then read back
the result. Sending comments/replies requires an explicit posting instruction.
Finishing a clip alone does not authorize upload. Do not delete resources or start
a broadcast merely to test this skill.

Report the selected channel, actual result/link, and any pending processing or
missing scope. On quota/permission/uncertain-write errors, keep the resource ID and
local receipt; stop repeated mutations and reconcile before retrying.
