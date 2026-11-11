---
name: instagram
description: >-
  Operate Instagram APIs after selecting and verifying the target account. Use for
  own profile/media, Insights, publishing, comments, messaging and authorization,
  including "ใช้ API IG", "ลงคลิป IG" and "ดูสถิติ Instagram". Video production
  or caption drafting alone belongs to the relevant creative skill.
---

# Instagram

One entry point for Instagram API work in this clone. Use Bun + Elysia and native fetch; read [the shared runtime guide](../../../social-api/README.md). No credentials or account connections are bundled. The starter implements inventory and identity verification only. Other references describe workflows to implement when requested.

## Select the account first

Before an account API call, token refresh, OAuth flow or remote mutation:

1. Enumerate local account metadata using [Account and auth](references/account-and-auth.md).
   Inventory is disk-only; do not read or print credentials.
2. Use an account explicitly named in this request or selected for this same ongoing
   task. Otherwise show the inventory and ask which account, even if only one exists.
   Do not infer an account from past tasks, browser login, filenames or YouTube.
3. Bind the choice to an absolute profile path, exact Instagram `user_id` and username.
   Compare the local binding, then run the live identity checker. Stop on mismatch;
   an app-scoped `id` is not `user_id`.
4. State the selected account for the operation. Reuse it in the continuous task;
   select again for a new task without a target or when the target changes.

Creating/editing this skill or explaining general capabilities needs no account
selection or remote call. Selecting an account does not authorize publishing.

## Route the selected task

| Work | Reference |
| --- | --- |
| Choose/connect account, expired token, missing permissions | [Account and auth](references/account-and-auth.md) |
| Profile, follower/media counts, posts/Reels, media details | [Profile and media](references/profile-and-media.md) |
| Account/post performance, reach, metrics | [Insights](references/insights.md) |
| Publish Reels/photos/carousels/eligible Stories, required covers | [Publishing](references/publishing.md) |
| Schedule a concrete clip for a date/time or authorized queue | [Scheduled publishing](references/scheduled-publishing.md) |
| Comments, replies, moderation, inbox/DMs, Webhooks, other APIs | [Engagement and extensions](references/engagement-and-extensions.md) |

## Capability, permission and proof

For Instagram Login, check actual grants for `instagram_business_basic`, `instagram_business_content_publish` and `instagram_business_manage_insights` as needed. No clone-specific grants or successful publish are implied. Comments/messages need separate permissions.

Use the matching host and scope family. Do not silently switch to Facebook/Unified Login or a Page token. Automatic refresh, publishing, hosting and scheduling are not implemented by the starter.

## Required cover

Every video/Reel publish, immediate or scheduled, requires a separate matching cover
image selected and inspected before publishing. If the cover is missing, prepare it
first; if unavailable or unsupported at execution, stop and report. Do not silently
use an automatic frame or omit the cover. Verify actual cover/crop after publishing.

## Execute and report

Read current official method documentation for an unverified operation. Load the
selected token privately into an HTTP client's Authorization header. Keep secrets
out of command arguments, logs, skills, receipts and notes. Redact paging URLs.
Verify existing-resource ownership before media Insights or mutations.

Change only what was requested. Explicit publishing/reply instructions authorize
that specific operation; creating a clip or drafting text alone does not. Obtain
only missing capabilities needed now. Preserve IDs/receipts on partial failures and
reconcile uncertain writes before retrying. Never publish/delete/send as a test.

Report selected account, result/permalink or output path, and pending processing,
missing permissions or unsupported operations. Report scheduled only after a real
durable job exists, with the user's timezone.
