# kubcode-web: the kubcode.dev web host (Lightsail)

Why and what: [docs/adr/0001-host-web-on-lightsail.md](../../docs/adr/0001-host-web-on-lightsail.md).

## Rules

- **Admin-applied only.** CI never runs this project (`infra.yml` excludes
  `infra/web/**`), and the CI roles have no Lightsail or Route 53 permissions.
  The account also holds client Lightsail instances: touch only `kubcode-web*`.
- **Never run `pulumi login` or `pulumi logout`.** The backend is pinned in `Pulumi.yaml`.
- Secrets live only in `/etc/kubcode/web.env` on the box (root, 0600). They go
  in through `scripts/webhost.sh set-env` (hidden prompts, SSH stdin). They
  never go in git, chat, argv or a local file.

## What is where

| Path | What |
|---|---|
| `src/web.ts` | Instance `kubcode-web` (micro_3_0, Ubuntu 24.04), static IP `kubcode-web-ip`, ports 22/80/443, apex `A` record switched by `kubcode-web:dnsTarget` |
| `host/setup.sh` | Box setup: Node 22, Caddy, users `kubcode` (runs the app) and `deploy` (CI), sshd keys-only, swap. Re-runnable |
| `host/kubcode-deploy` | The deploy key's forced command: `deploy <sha> <sha256>` (tarball on stdin), `rollback`, `status` |
| `host/smoke` | Smoke test: `/` 200, auth providers exactly google+line, `/account` 200. Run on the box after each deploy, and by CI against kubcode.dev |
| `host/write-env` | Writes web.env from stdin; keeps or generates `NEXTAUTH_SECRET` on the box; restores the old file if the app then fails its smoke |
| `host/start-web` | systemd `ExecStart`: exports the public DB CA from the release, starts `server.js` |
| `scripts/webhost.sh` | Local admin/owner tool: `known-hosts`, `deploy-key`, `provision`, `set-env`, `smoke`, `tls`, `status`, `rollback`, `ssh` |
| `tests/` | `npm test` (stack shape, deploy command, write-env); `tests/container-e2e.sh` (full box in Docker) |

## Cutover runbook

Run each step from the repo root on the owner's machine with AWS profile `default`.

1. **Create the box.** DNS stays on Vercel:
   ```sh
   cd infra/web && npm ci && pulumi stack init prod --secrets-provider "awskms://alias/kubcode-pulumi?region=ap-southeast-1"   # first time only
   pulumi preview --stack prod   # expect: creates kubcode-web* and the apex record (allowOverwrite: an upsert of the same IPs, TTL 300 -> 60)
   pulumi up --stack prod
   ```
2. **Pin host keys, then the CI deploy key.** `deploy-key` installs the new
   public key on the box (it runs `provision`) before it puts the private half
   into GitHub, so CI never holds a key the box refuses:
   ```sh
   infra/web/scripts/webhost.sh known-hosts
   infra/web/scripts/webhost.sh deploy-key     # then commit infra/web/host/deploy_key.pub
   ```
   Later re-runs of the box setup only need `webhost.sh provision`.
3. **Secrets.** The owner types them; `NEXTAUTH_SECRET` is generated on the box:
   ```sh
   infra/web/scripts/webhost.sh set-env
   ```
4. **First deploy.** Merge the PR (or re-run Production on main). The run
   deploys to the box and the box smoke-tests itself. The public smoke is
   skipped because DNS is still on Vercel. Then check again with
   `webhost.sh smoke`.
5. **Switch DNS, then TLS.** Set `kubcode-web:dnsTarget: lightsail` in
   `Pulumi.prod.yaml` and run `pulumi up`. Then run `webhost.sh tls` right away:
   Caddy tried for the certificate at provision time, while DNS still pointed at
   Vercel, and is backing off. `tls` restarts it and waits until the box serves
   a valid certificate. Then check:
   - `curl -sI https://kubcode.dev`
   - the owner logs in with Google, then LINE (one forced re-login is expected)
   - re-run Production so its public smoke runs against the box
6. **Rollback.** Set `dnsTarget: vercel` and run `pulumi up` (TTL 60). The old
   Vercel deployment is untouched and still has its env.
7. **After 1–2 quiet days:**
   - remove `VERCEL_TOKEN` and the `VERCEL_*` variables from GitHub
   - remove `lib/ci/vercel-release.ts` and `scripts/ci-vercel-release.ts`
   - update HANDOFF §7a
   - keep the Vercel project (don't delete it) until the owner says so

## Day to day

- Deploys happen only through `production.yml` on main.
- To roll back to the previous release: `webhost.sh rollback`. It **swaps**
  live and previous, so running it twice undoes it. Check `webhost.sh status`
  first, especially after CI has already rolled back on its own.
- Admin SSH (`webhost.sh ssh`, `provision`, `set-env`, ...) uses a short-lived
  certificate from the Lightsail API by default, so it needs only the AWS
  `default` profile. Set `KUBCODE_ADMIN_KEY` to use your own key instead.
- Rotate the admin SSH key on the box (`~ubuntu/.ssh/authorized_keys`), not in
  `Pulumi.prod.yaml`: the key pair is only used when the instance is created.
- Rotate the CI deploy key with `webhost.sh deploy-key`.
- To change a secret: `webhost.sh set-env`. It restarts the app and runs the smoke test.
- OS security updates come from unattended-upgrades. Reboot when the box asks
  (`webhost.sh ssh cat /var/run/reboot-required`).

## Known gaps (follow-ups)

- The smoke test does not touch the database, so a wrong `DATABASE_URL` passes
  it. Google login after `set-env` is the real check.
- `set-env` rewrites the whole env file. Turning on a flag later (e.g.
  `KUBCODE_INTERACTIONS_ENABLED`) means re-typing the secrets until there is a
  `set-flag` command. Skill downloads are the exception: `set-env` asks for the
  signer URL and key (empty URL = off), see `infra/README.md`.
- There is no uptime alert yet.
- Next logs harmless "Failed to update prerender cache" warnings if an ISR
  write is ever attempted: the release directory is read-only by design.
