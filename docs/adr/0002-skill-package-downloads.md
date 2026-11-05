# 0002 — Skill package downloads through a Rust presign Lambda

Status: accepted (2026-11-05, owner) · Numbered 0002 because 0001 is the Lightsail ADR in PR #12

## Context

- The homepage style cards and catalogue cards show a locked download. There is
  no download service; `app/api/download/[slug]` always answers 503.
- The web app is moving to a Lightsail box that holds **no AWS credentials**
  (ADR 0001). Private files live in the private bucket `kubcode-media-955758449820`.
- Most catalogue skills have no distributable kit, and some (growkaz-stickman,
  thai-survival) have no licence at all and must never be downloadable.
- New backend services are written in Rust; Next/TS is UI and route glue only.

## Decision

### Owner decisions (2026-11-05)

| Question | Decision |
|---|---|
| What is downloadable first | **What If only**: the `kit/` of `freshstack-what-if` 0.1.0 (SKILL.md, scripts, references, MIT LICENSE with the FreshStack credit). No generated episodes, audio or studio source. Other skills are added one package version at a time after the owner approves each. |
| Who may download | **Any member** (signed in, active). No member-approval step. |
| Where files live | Private S3 bucket, prefix `packages/`. A **Rust Lambda** issues a presigned GET that expires in 60 s. |
| Rate limit | **20 downloads per member per rolling 24 h**, every download logged. |

### Technical choices (agent; open to change)

1. **Package manifest in code** (`lib/packages.ts`): slug, version, object key,
   licence, credit, approval date. It is the allowlist: a slug not in it, or
   without an approval, gets 404. Approval is the owner merging the PR that adds
   the entry. growkaz-stickman and thai-survival are on a test-enforced denylist.
2. **Request flow** — `POST /api/download/{slug}` (same Origin + CSRF guard as
   other account mutations):
   feature flag → manifest lookup → signed session → one transaction: check
   the session against the DB and lock the member's row (`lockMember`, shared
   with interactions), count the member's downloads in the last 24 h, refuse
   with 429 + `Retry-After` at 20, else insert a `download_events` row → call
   the signer → return `{url}`. The browser then navigates to the URL. A signer
   failure still counts toward the limit (rare, and it keeps the DB
   transaction short).
3. **Signer Lambda `kubcode-package-signer`** (Rust, Function URL, auth NONE):
   - Accepts only requests HMAC-signed with `KUBCODE_PACKAGE_SIGNER_KEY`, the
     same scheme as the scheduler design (method, path, timestamp, nonce, SHA-256
     of the body), timestamp within ±60 s. It has no DB, so no nonce store: a
     replay within 60 s only yields another 60-second link to the same file.
   - Accepts only object keys matching `packages/<slug>/<version>.zip`.
   - Presigns `GetObject` locally (SigV4, no network call) with
     `response-content-disposition: attachment`.
   - Its role allows `s3:GetObject` on `kubcode-media-…/packages/*` only.
     No DB, no KMS, no other bucket.
4. **Package objects** are managed by the Pulumi stack from the files in
   `packages/<slug>/<version>/`, stored with SSE-S3 (`AES256`) so the presign
   role needs no KMS rights.
5. **DB**: additive migration `0003_downloads` (table `download_events`, grants
   and RLS for `kubcode_app` in the file).
6. **Infra**: the permissions boundary gains Lambda and CloudWatch Logs on
   `kubcode-*`. CI cannot change the boundary, so the **owner runs one
   admin `pulumi up` from the PR branch before merging** (otherwise the
   first CI apply is denied halfway). The signer function, role and URL are
   created only once the secret `kubcode:packageSignerKey` is set. The Lambda
   code is a zip built by `services/package-signer/build-lambda.sh` and
   uploaded as-is so `bootstrap` keeps its exec bit.

## Consequences

- Cost: Lambda and S3 requests stay inside the free tier at this traffic; logs
  kept 14 days. No new paid resource.
- The HMAC key is a web-host-level secret: whoever holds it can presign any
  package in the manifest prefix, which is no more than the web app can already do.
- Downloads stay off until `KUBCODE_DOWNLOADS_ENABLED=true` and the two signer
  variables are set on the web host.
- Adding a package = one PR with the files + a manifest entry; the owner merging
  it is the approval.

## Alternatives rejected

- **Narrow S3 key on the web box**: simpler, but breaks ADR 0001 (no AWS
  credentials on the box).
- **Serve files from the web box**: no AWS at all, but private kits would ship
  inside every release.
- **Approved members only**: needs an approval system first; the owner wants
  sign-in to be the gate.
