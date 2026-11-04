# 0001 — Host the kubcode.dev web app on AWS Lightsail

Status: accepted (2026-11-04, owner) · Supersedes the Vercel hosting in HANDOFF §7a once cut over

## Context

- Production ran on Vercel Hobby. On 2026-11-04 we hit the Hobby upload cap
  (~5000 files/day, `api-upload-free`), which blocked every deploy for 24 h.
  Hobby is also non-commercial only.
- The app has nothing that needs Vercel: every route runs on the Node runtime,
  there is no `vercel.json`, no edge runtime and no Vercel-only API. Interaction
  rate limits are per user in the DB, not per IP.
- DNS for `kubcode.dev` is one apex `A` record (TTL 300) in Route 53 in the same
  AWS account. That account also holds client resources, including Lightsail
  instances (ttopup, supersix), so nothing outside `kubcode-*` may be touched.
- Almost every Vercel runtime variable is type `sensitive` and can never be read
  back (read 2026-11-04 from the Vercel API, types only).

## Decision

### Owner decisions

| Question | Decision |
|---|---|
| Size | Lightsail `micro_3_0`: $7/mo, 1 GB RAM, 2 vCPU, 40 GB, IPv4, ap-southeast-1 |
| Scope | (ก) web app only. The scheduler stays on Lambda. The box holds **no AWS credentials** and cannot decrypt user secrets. |
| `DATABASE_URL` | The owner has the existing `kubcode_app` URL and types it into a hidden prompt. No password reset, so Vercel stays a working fallback without a redeploy. |
| `GOOGLE_CLIENT_SECRET` | The owner has the existing value and types it into a hidden prompt. |
| `NEXTAUTH_SECRET` | Generated fresh on the box and never shown. Effect: one forced re-login after the switch. |
| Who applies Lightsail / DNS | Admin only, by local `pulumi up` (like the permissions boundary). The CI roles get no Lightsail or Route 53 permissions. |
| Vercel previews | Stopped. Branch pushes run checks only; changes are viewed locally. |
| Vercel fallback | Keep the Vercel project and its last production deployment for 1–2 days after the cutover. Don't delete the project. |

### Technical choices (made by the agent; open to change)

- **Separate Pulumi project `infra/web`**, stack `prod`, same pinned S3 backend.
  It is not run by `infra.yml` (excluded by path), so CI never holds Lightsail
  or Route 53 rights.
- **Resources:** `kubcode-web` instance (Ubuntu 24.04), `kubcode-web-ip`
  static IP, public ports 22/80/443, a key pair holding the owner's admin public
  key, and the apex `A` record. The record is always managed by this stack with
  TTL 60. A config value `dnsTarget: vercel | lightsail` flips it, so rolling
  back is one config change plus `pulumi up`.
- **Build in CI, never on the box.** `next build` with `output: "standalone"`
  runs on the GitHub runner (linux x64, the same arch as Lightsail). The release
  is a tarball of the standalone server plus `.next/static` and `public/`.
- **Deploy over SSH with a forced command.** A `deploy` user's only key may run
  just `kubcode-deploy`, which takes the tarball on stdin and checks its sha256.
  It unpacks into `/srv/kubcode/releases/<sha>`, switches the `current` symlink
  atomically, restarts, and smoke-tests on localhost. If the smoke test fails it
  switches back. It keeps the last 5 releases, and `rollback` / `status` are its
  only other verbs. A leaked deploy key can install a release, not get a shell.
  The host key is pinned in CI.
- **SSH is open to the world on port 22** (GitHub runner IPs are not fixed),
  with key-only auth: no passwords, no root login.
- **Runtime:** systemd `kubcode-web.service` runs `node server.js` as the
  unprivileged `kubcode` user on `127.0.0.1:3000`, with `MemoryMax`, and has no
  write access outside its release cache. Env comes from `/etc/kubcode/web.env`
  (root, 0600, read by systemd before it drops privileges). There is 1 GB swap.
- **Caddy** terminates TLS (Let's Encrypt, HTTP-01/TLS-ALPN) for `kubcode.dev`
  only and reverse-proxies to the app. Requests by bare IP or another host
  name get no site. The existing canonical-host check in `lib/auth-policy.ts`
  stays the second layer.
- **Host glue is shell** (`provision.sh`, `kubcode-deploy`, `set-env.sh`),
  the same as `infra/scripts/bootstrap.sh`. It is not backend product code, so
  the Rust rule doesn't apply. The box needs no toolchain.
- **Migrations are unchanged:** GitHub Actions still plans, gates and migrates
  before deploying. Only the deploy, smoke and promote steps change.

## Cutover runbook (summary)

1. Admin runs `pulumi up` in `infra/web` with `dnsTarget=vercel`. This creates
   the box and IP, and takes over the `A` record unchanged except for TTL 60.
2. Admin runs `provision.sh` over SSH. It is idempotent.
3. Owner runs `set-env.sh` and types the secrets into hidden prompts. The
   values go straight to the box over SSH stdin and nowhere else.
4. The PR merges. `production.yml` builds and deploys to the box, and the box
   smoke-tests on localhost.
5. Check through an SSH tunnel with `Host: kubcode.dev`.
6. Admin sets `dnsTarget=lightsail` and runs `pulumi up`. Caddy issues the
   certificate on the first request. Then check `https://kubcode.dev`, Google
   login and LINE login.
7. Rollback: `dnsTarget=vercel`, `pulumi up`. With TTL 60 this takes about a
   minute.
8. After 1–2 quiet days, remove the Vercel steps and secrets from CI.

## Consequences

- No more upload cap or non-commercial clause. Cost is about $7/mo plus egress
  beyond 2 TB.
- We now own OS patching (unattended-upgrades), TLS renewal (Caddy) and uptime.
  There is no uptime alert yet; adding one is a follow-up.
- Previews are gone, so UI review happens locally before merging.
- A box rebuild needs the owner to re-enter the secrets (`set-env.sh`).
