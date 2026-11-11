# Local end-to-end: channel connect

Verify publishing changes on this machine before production. The loop runs the
production code paths (web routes, the Lambda's `http::handle`, the Zernio
adapter, the store, RLS) against a throwaway local database and the **real
Zernio API**. Production is for one smoke test after merge, never for debugging.

## What runs where

| Piece | Local stand-in | Same code as production? |
|---|---|---|
| Database | throwaway DB on the local test Postgres, all migrations, a fictional owner | yes (migrations, grants, RLS) |
| Publishing Lambda | `services/crates/kubcode-publishing-lambda/examples/publishing_local.rs` on 127.0.0.1 | yes: `http::handle`, `Service`, Zernio adapter, `Store`; only the HTTP server, secret source and a no-TLS DB connection differ |
| Web host | `next start` with the production build | yes; `scripts/local-e2e/lambda-route.cjs` (preload) sends the fake Function URL to the runner |
| Browser | headless Chromium for our pages, where `https://kubcode.dev/**` is answered by the local Next server; the platform consent in a separate, normal Brave window | yes: same origin, cookies, CSRF and callback URL as production |
| Zernio, Google/Meta consent | real | real |

The pinned guards (`https://kubcode.dev` callback, Function URL format, Origin
and CSRF checks) stay unchanged and are exercised. Zernio's real redirect to
`https://kubcode.dev/api/channels/callback` lands on the local server because
the harness replays it into the browser that routes that origin, not because
of DNS or a certificate. Nothing is
added to the system keychain or trust store.

## Run

```bash
# once: the local test Postgres (any loopback Postgres 17 works)
docker start kubcode-pub-test   # or: docker run -d --name kubcode-pub-test -e POSTGRES_PASSWORD=fixture-only -e POSTGRES_DB=kubcode_local_test -p 55432:5432 postgres:17
export KUBCODE_TEST_DATABASE_URL=postgres://postgres:fixture-only@127.0.0.1:55432/kubcode_local_test

npm run build                          # the web host runs the production build
scripts/local-e2e/run.sh               # YouTube; `run.sh instagram` / `run.sh tiktok`
```

TikTok: sign in to the TikTok account to connect (@kubcode) in the consent
window and accept **every** permission. If one is left out, Zernio changes
nothing and returns `missing_tiktok_permissions`. The run also prints the
account type TikTok reported. Zernio's free tier holds 2 accounts. The run
adds one and removes it at the end, so a slot must be free.

### Channel pages, screenshots (no provider call)

`npx tsx scripts/local-e2e/channels-screens.ts` (after `npm run build`) seeds
fixture channels and saves `/account/channels` and a TikTok automations page
at desktop and 390 px width in `.qa/local-e2e/channels/`.

`run.sh` reads `kubcode/zernio-api-key` from the Keychain (macOS asks for your
login password) and pipes it to the harness on stdin. The key never appears in
argv, env, logs or files.

The harness drives our pages in a headless browser, clicks **เชื่อม YouTube**
itself and opens the platform's consent page in a **separate Brave window**:
a normal app process (no automation flags; Google refuses sign-in in an
automated browser) with its own profile in `.qa/local-e2e/consent-browser` and
a debugging port on 127.0.0.1 that the harness only listens to. When it prints
`READY`:

1. sign in (the first time only; the profile keeps the login) and approve.
   Zernio redirects to the production callback, which refuses it before
   touching the database or the Lambda (no intent cookie for this state), so
   the window ends on `kubcode.dev/account/channels?notice=connect_failed`.
   Nothing is consumed. The harness has already seen the callback request and
   replays it into the local server with this run's cookies.

Fallback, if that window cannot sign in: open the same consent page in your
normal browser, first **Cmd+Opt+I → Network → "Preserve log" → filter
`callback`**, approve, then right-click the `callback?i=...` request → **Copy →
Copy URL**. The harness also reads the clipboard and accepts only
`https://kubcode.dev/api/channels/callback?i=<64 hex>...`; it never prints it.

Delete the consent profile when you are done: `rm -rf .qa/local-e2e/consent-browser`.

The intent behind it expires 10 minutes after the click (as in production).

The harness then:

1. waits for the connect intent to close and prints the runner's
   `[publishing] api ...` lines (outcome code + callback parameter names);
2. checks one active connection in the database and that the page lists the
   channel (screenshot in `.qa/local-e2e/`);
3. clicks **ยกเลิกการเชื่อม** (exercises disconnect → Zernio `DELETE /v1/accounts/{id}`);
4. deletes any account left in this run's Zernio profile, then the profile, and
   drops the throwaway database (also when a step fails).

### Wiring check without consent

```bash
echo sk_dummy | KUBCODE_LOCAL_E2E_SMOKE=1 npx tsx scripts/local-e2e/connect.ts          # or ... connect.ts tiktok
```

Headless; clicks connect itself and stops at Zernio's first answer. With a
dummy key the runner prints `outcome=zernio_auth_failed`, which proves browser
→ Next → runner → Zernio. No Zernio state is created.

### Reproduce on another checkout's runner

`KUBCODE_LOCAL_SERVICES_DIR=/path/to/other-worktree/services scripts/local-e2e/run.sh`
runs that checkout's Rust runner with this checkout's web build, e.g. main
before a fix, to see the bug locally first.

## Publish (the owner's CLI, a real post)

`scripts/local-e2e/run-publish.sh` runs the owner's real `kubcode` CLI
(push, schedule with its confirmation summary) against the local runner, and
posts to the account of a channel that is **already connected in production**:
Zernio's free quota is used by those channels, so a third test account would
be billed.

- The script finds that account read-only (`GET /v1/accounts`, one active
  account of the platform) and seeds it, with its Zernio profile, into a
  throwaway local database.
- **Production's account is never changed:** the runner runs with
  `KUBCODE_LOCAL_PROTECT_ACCOUNTS=1` (connect, complete and disconnect are
  refused; tested in the example), and the script's only Zernio client allows
  reads only (`scripts/local-e2e/zernio-guard.ts`, tested). Nothing at Zernio is
  deleted at the end.
- The CLI's local mode is chosen by `KUBCODE_LOCAL_OPS_URL` (must be
  `http://127.0.0.1:<port>`): commands go, signed as usual, to the runner's
  `POST /ops`; media is copied to a local directory that stands in for S3.
- A scratch copy of the clip carries the test title, so the studio folder is
  not touched.

```bash
# dry run: push + summary, then cancel at the confirmation (nothing sent to Zernio)
KUBCODE_LOCAL_E2E_CLIP=<clip-id> KUBCODE_LOCAL_E2E_TITLE="[ทดสอบ kubcode] ..." \
  scripts/local-e2e/run-publish.sh

# post (private by default, 10 minutes ahead) — only with the owner's OK on clip, title, channel
KUBCODE_LOCAL_E2E_CLIP=<clip-id> KUBCODE_LOCAL_E2E_TITLE="..." KUBCODE_LOCAL_E2E_POST=<clip-id> \
  scripts/local-e2e/run-publish.sh
```

After a post the script follows it at Zernio until it is published (webhooks
go to production, which ignores a post it does not know). Check the thumbnail
in YouTube Studio: it must be the designed cover.

Rehearsal, the real Zernio path with nothing visible: `KUBCODE_LOCAL_E2E_REHEARSE=<clip-id>`
schedules **private seven days out**, checks the post at Zernio (scheduled,
our cover as the thumbnail, private), cancels it with `kubcode cancel` and
checks it is gone. It always cancels before judging. Zernio sends a scheduled
YouTube video at most 15 minutes before its time (OpenAPI `publishedAt`), so
a cancel minutes after scheduling leaves nothing on YouTube.

Wiring check with no Zernio call and no key:
`echo sk_dummy | KUBCODE_LOCAL_E2E_OFFLINE=1 KUBCODE_LOCAL_E2E_CLIP=<clip-id> npx tsx scripts/local-e2e/publish.ts`.

## Post picker (automation rules, read only)

```bash
npm run build
scripts/local-e2e/run-post-picker.sh
```

Finds the production Instagram and TikTok accounts with GET calls only
(`zernio-guard.ts`), seeds them into a throwaway database, starts the
protected runner (connect, complete and disconnect refused) and the production
web build, and screenshots `/account/channels/<id>/automations` with the
picker open (desktop and 390 px) into `.qa/local-e2e/post-picker/`. The page's
only Zernio call is `GET /v1/accounts/{accountId}/posts`. Nothing is posted,
replied, sent or deleted. `KUBCODE_LOCAL_E2E_FIXTURE=1 npx tsx
scripts/local-e2e/post-picker.ts` runs the same page against a stub Lambda,
with no key.

## Zernio quota

Zernio's first 2 connected accounts are free; each further one is billed. A
run creates one account and removes it at the end. If a run is killed, check
the Zernio dashboard for a leftover `kubcode-<8 hex>` profile and its accounts.

## Not covered (yet)

- Webhooks: Zernio cannot reach 127.0.0.1. Use a tunnel when a change needs them.
- S3 itself (publish mode uses a local directory) and the ops Lambda's IAM
  invoke (the CLI talks to the runner over loopback).
