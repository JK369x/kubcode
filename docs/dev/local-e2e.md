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
scripts/local-e2e/run.sh               # YouTube; `run.sh instagram` for Instagram
```

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
echo sk_dummy | KUBCODE_LOCAL_E2E_SMOKE=1 npx tsx scripts/local-e2e/connect.ts
```

Headless; clicks connect itself and stops at Zernio's first answer. With a
dummy key the runner prints `outcome=zernio_auth_failed`, which proves browser
→ Next → runner → Zernio. No Zernio state is created.

### Reproduce on another checkout's runner

`KUBCODE_LOCAL_SERVICES_DIR=/path/to/other-worktree/services scripts/local-e2e/run.sh`
runs that checkout's Rust runner with this checkout's web build, e.g. main
before a fix, to see the bug locally first.

## Zernio quota

Zernio's first 2 connected accounts are free; each further one is billed. A
run creates one account and removes it at the end. If a run is killed, check
the Zernio dashboard for a leftover `kubcode-<8 hex>` profile and its accounts.

## Not covered (yet)

- Webhooks: Zernio cannot reach 127.0.0.1. Use a tunnel when a change needs them.
- Scheduling and media upload (S3): the runner has no media bucket.
