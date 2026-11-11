# 0006 — Members-only packages: private source, owner upload, pinned zip

Status: accepted (2026-11-11, owner) · Extends 0002 (skill package downloads)

## Context

ADR 0002 ships open-licence packages: their files sit in `packages/<slug>/<version>/` and the infra stack zips and
uploads them on merge. This repo is public. Deep Sea Docs is kubcode's own kit with the licence "kubcode members only,
no redistribution", so its files must never be in this repo.

## Decision

1. `lib/packages.ts` has two kinds: `PACKAGES` (`kind: "repo"`, built by the stack as before) and `PRIVATE_PACKAGES`
   (`kind: "private"`). Downloads, limits (20/day) and sign-in are the same for both.
2. A private package's source lives in the private repo `JK369x/jk-animation-studio`
   (`packages/<slug>/<version>/`). The owner runs `scripts/upload-private-package.ts <slug> <dir>`: dry run by
   default; it refuses a source inside this repo, builds a deterministic zip with `LICENSE-kubcode-members.txt`
   (English + Thai), and with `--upload` puts it at `packages/<slug>/<version>.zip` (SSE-S3, `sha256` metadata) using
   the owner's own AWS profile, then verifies it with `head-object`.
3. `lib/packages.ts` pins the zip's `sha256` and `bytes`. A private package is downloadable only when pinned; a version
   is immutable (the script refuses to overwrite a pinned version with different bytes).
4. If the object is missing, the download route answers 404 `PACKAGE_NOT_FOUND` (one ranged GET on the presigned URL).
5. No IAM or CI change: the signer already reads `packages/*`; the stack never manages private objects.
   Superseded repo-package versions stay in the bucket via `RETAINED_PACKAGES` (no delete through the infra gate).
6. Open-licence packages (What If Lab MIT, Podcast Shorts MIT, make-short MIT, EGM Apache-2.0) stay in the public repo;
   their licences allow that.
