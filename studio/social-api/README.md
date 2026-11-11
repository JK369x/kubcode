# Social API — Bun + Elysia

Provider API calls use Bun native fetch, served by Elysia. Python remains only for voice/media tooling; it is not the social API runtime. This package is separate from Node/HyperFrames dependencies.

## Start

Requires Bun 1.4+ (tested 1.4.1) and Node 22+ for the existing video library.

~~~sh
cd social-api
bun install --frozen-lockfile
cp .env.example .env
# Replace JK_SOCIAL_API_KEY in .env with your own random key (24+ characters).
bun run start
~~~

The listener binds 127.0.0.1:3015. Do not expose it publicly or treat it as a deployed multi-user service. No CORS access is enabled. Health is public; account endpoints require Authorization: Bearer <local-api-key>. This key is not a provider token.

## Private connections

No tokens, app IDs, accounts, OAuth clients or existing upload receipts are copied. A fresh clone starts disconnected. Connect using your own provider OAuth setup, then place only the selected profile's metadata and token in the private state root (default repo/.local/social, or absolute JK_SOCIAL_STATE_DIR):

~~~text
youtube/<profile>/channel.json   {"id":"chosen-channel-id","title":"Channel name"}
youtube/<profile>/token.json     {"token":"PRIVATE GOOGLE ACCESS TOKEN"}
instagram/<profile>/account.json {"user_id":"chosen-user-id","username":"chosen.username"}
instagram/<profile>/token.json   {"access_token":"PRIVATE META ACCESS TOKEN"}
~~~

These are schemas, not credentials. Keep directories 700 and files 600. Select an account/channel explicitly for every new task, even when inventory contains only one. Reuse the selection within the continuous task. Do not overwrite bindings to make identity checks pass. Expired tokens require reconnection; refresh/login are not implemented by this starter. Existing profiles elsewhere are unchanged and are not discovered automatically.

## Implemented endpoints

| Method | Route | Input/result |
| --- | --- | --- |
| GET | /health | service health; no provider call |
| GET | /connections | local metadata only; never reads token contents |
| POST | /youtube/:profile/verify | JSON {channelId}; checks local binding, then live channels.list(mine=true) |
| POST | /instagram/:profile/verify | JSON {userId,username}; checks local binding, then live /me user_id and username |

Verification uses fixed provider hosts, bearer headers, a 15s timeout and rejects redirects. It returns only identity fields. It does not persist a global selected account or authorize later mutations. Before future operations, verify within that operation, not from an old response. Malformed profiles and provider failures produce sanitized errors.

## Skill workflows vs implemented API

The bundled youtube, youtube-api-upload and instagram skills preserve workflows for uploads, required covers, readback, Insights, comments, receipts and scheduling. They are instructions for requested work. This starter does **not** implement upload/publish, OAuth/refresh, media staging, Analytics, DMs, Webhooks or a scheduler. Build a requested operation as a separate Elysia route/service with Bun fetch, exact scope/ownership checks and private receipts; never infer an undocumented endpoint or silently call an unavailable legacy helper. No live account operation was performed to package this repo.

Run bun test from this folder, or npm run test:social from repo root. Tests exercise Elysia requests using a temporary fake profile and injected HTTP transport; they do not verify a real Google/Meta connection.

[Official Elysia quick start](https://elysiajs.com/quick-start), [Bun server docs](https://bun.sh/docs/runtime/http/server).
