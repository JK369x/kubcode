# kubcode infra (Pulumi, TypeScript)

AWS resources for kubcode in the owner's personal account **955758449820**,
region **ap-southeast-1**, stack **`prod`**. Scheduler slice 1 (see
`docs/scheduler.md` / the scheduler PRD).

The account also holds unrelated client resources. This stack only manages
resources named `kubcode-*`, and everything it creates is tagged `project=kubcode`.
The GitHub OIDC provider `token.actions.githubusercontent.com` is shared with
other repositories: the stack **looks it up** and never manages it. The spike
resources `kubcode-igtest-*` are out of scope, and every kubcode role is denied
access to them.

## What is where

| Thing | Managed by | Notes |
|---|---|---|
| S3 `kubcode-pulumi-state-955758449820` | `scripts/bootstrap.sh state` | Pulumi state. Versioned, private, SSE-S3, TLS-only, noncurrent versions expire after 90 days |
| KMS `alias/kubcode-pulumi` | `scripts/bootstrap.sh state` | Pulumi secrets provider. Default key policy (IAM-delegated); CI roles reach it by its key ARN |
| Stack `prod` | `scripts/bootstrap.sh stack` | `awskms://alias/kubcode-pulumi?region=ap-southeast-1` |
| KMS `alias/kubcode-secrets` | stack (`protect: true`) | BYOK envelope encryption, rotation on. See the key policy below |
| KMS `alias/kubcode-secrets-wrap` | stack (`protect: true`), **admin creates it** | RSA_4096 ENCRYPT_DECRYPT: the web host seals per-secret DEKs with its public key, only `kubcode-lambda-*` roles may Decrypt. See "Settings keys wrap key" |
| SSM SecureStrings `/kubcode/prod/worker-db-url`, `/kubcode/prod/connect-hmac-key` | **admin CLI only** (step 5), never the stack | Encrypted with `alias/kubcode-secrets`. Not Pulumi resources on purpose, see "Settings keys wrap key" |
| S3 `kubcode-media-955758449820` | stack | Block public access, SSE-KMS (`aws/s3` + bucket key), versioning off, abort incomplete multipart after 7 days, CORS `https://kubcode.dev` PUT/POST/GET (exposes `ETag`), TLS-only |
| IAM policy `kubcode-deploy-boundary` | stack, **admin-only changes** | Permissions boundary for every `kubcode-*` role |
| IAM role `kubcode-github-deploy` | stack | OIDC sub `repo:JK369x@104179568/kubcode@1444458364:ref:refs/heads/main` only. Runs `pulumi up` |
| IAM role `kubcode-github-preview` | stack | OIDC sub `repo:JK369x@104179568/kubcode@1444458364:pull_request` only. Read-only, plus Pulumi lock objects |
| Budget `kubcode-monthly` ($5, `user:project$kubcode`) | stack | Created only once the secret `kubcode:budgetEmail` is set |
| S3 objects `packages/<slug>/<version>.zip` | stack | Skill packages, zipped from `packages/<slug>/<version>/`, SSE-S3. See "Skill package downloads" |
| IAM role `kubcode-package-signer`, log group `/aws/lambda/kubcode-package-signer`, Lambda `kubcode-package-signer` + Function URL | stack | Created only once the secret `kubcode:packageSignerKey` is set. See "Skill package downloads" |
| Cost allocation tag `project` | `scripts/bootstrap.sh cost-tag` | Can be activated only after billing has seen the tag (up to 24h) |
| Lambda concurrency quota | `scripts/bootstrap.sh quota N` | The API accepts only N > 1000 (the AWS default). Lower values need a console support case |

The backend is pinned in `Pulumi.yaml` (`backend.url`). **Never run `pulumi login`
or `pulumi logout`** for this project: the machine's default login is used by
other work.

## Permission model

- **OIDC subject**: the repo uses GitHub's *immutable* subject (owner and repo
  IDs). Check it with `gh api repos/JK369x/kubcode/actions/oidc/customization/sub`.
  Tokens carry `repo:JK369x@104179568/kubcode@1444458364:…`, never `repo:JK369x/kubcode:…`. A trust policy written
  with the name-only form fails with "Not authorized to perform
  sts:AssumeRoleWithWebIdentity". `githubTrustPolicy` rejects any other prefix.
- Trust changes and deletion of the two GitHub roles are denied to CI. Who can
  assume them is decided only by an admin-run apply.

- Every `kubcode-*` role carries the boundary `kubcode-deploy-boundary`. The deploy
  role can create or change roles only when they carry that boundary
  (`iam:PermissionsBoundary` condition). Every kubcode role is denied
  from editing, deleting or detaching the boundary. So even a CI run that rewrote
  its own role policy could not reach beyond `kubcode-*` resources.
- The boundary allows S3 on `kubcode-*` buckets, KMS aliases `alias/kubcode-*`,
  and **only the three kubcode keys by ARN** (state, secrets, secrets-wrap).
  `kms:Decrypt` and `kms:ReEncrypt*` on the wrap key are **denied** to every
  principal whose ARN is not `role/kubcode-lambda-*`, and `kms:PutKeyPolicy` /
  `kms:CreateGrant` on it are denied to every kubcode role. So CI can neither
  grant itself decryption nor name an outside principal (another account) in
  the key policy or a grant: the wrap key policy is admin-only. Parameters under `parameter/kubcode/*` can be read
  (`ssm:GetParameter(s)`, for the step-5 Lambdas) but not written. It also allows IAM
  roles and policies named `kubcode-*`, budgets `kubcode-*`, Lambda functions
  `kubcode-*` (create, update, delete, tags, Function URL config, resource
  policy), CloudWatch Logs under `/aws/lambda/kubcode-*`, `iam:PassRole` of
  `kubcode-*` roles to `lambda.amazonaws.com` only, and a read (Get) of
  the shared OIDC provider. Writes to any OIDC provider are denied, as are
  destructive changes to the state bucket (delete bucket, delete object versions,
  versioning/policy/lifecycle).
- CI cannot create KMS keys or use services the boundary does not list
  (Scheduler, SSM writes...). Adding them means changing the boundary, and **CI is denied
  from changing the boundary**. An admin applies that change locally (below).

### `alias/kubcode-secrets` key policy

| Statement | Principals | Can |
|---|---|---|
| `KeyAdministration` | `kubcode-github-deploy`, break-glass admins (`kubcode:breakGlassAdminArns`, now `user/super_admin`) | manage (policy, rotation, alias, tags, schedule deletion). **No** encrypt/decrypt, **no** `CreateGrant` |
| `RootUserRecovery` | account root, condition `aws:PrincipalArn = …:root` | same admin actions, for recovery if every admin is lost. The condition means it is the root **user** only: it does not delegate to IAM, so other IAM admins and client roles in the account cannot take over the key |
| `KeyRead` | `kubcode-github-preview` | describe / read policy |
| `KeyUse` | Lambda roles (the hook below) | `Encrypt`, `Decrypt`, `GenerateDataKey`, `DescribeKey`. Absent until a role is added |
| `SsmParameterWrite` | break-glass admins | `Encrypt`, `GenerateDataKey` only via SSM (`kms:ViaService`) and only for `parameter/kubcode/*` (`kms:EncryptionContext:PARAMETER_ARN`): lets the admin `put-parameter` the step-5 SecureStrings. No Decrypt |

The key policy is a separate `aws.kms.KeyPolicy` resource: the boundary names the
key ARN, and the key policy names roles that carry the boundary. Putting the
policy on the key itself would create a dependency cycle.

### Adding a Lambda role to the secrets key (slice 2/5)

1. Define the role in this stack with `permissionsBoundary: boundary.arn` (CI
   cannot create a kubcode role without it).
2. Append its ARN to `secretsKeyUserArns` in `index.ts` (the `HOOK` comment), e.g.
   `const secretsKeyUserArns = [publisherRole.arn];`. The `KeyUse` statement
   appears with exactly those principals.
3. The boundary already allows `kms:*` on this key, so Decrypt fits under it.
   Lambda functions and their `/aws/lambda/kubcode-*` log groups are already in
   the boundary (added for the package signer), and so is `iam:PassRole` to
   `lambda.amazonaws.com`. Scheduler and SSM are not: add those statements to
   `deployBoundaryPolicy` in `src/policies.ts`, scoped to `kubcode-*`, with
   tests, and apply that boundary change as an admin (below) before CI can
   deploy them. The package signer role in `src/stack.ts` is the template:
   boundary, `lambdaTrustPolicy()`, a small inline policy.

### `alias/kubcode-secrets-wrap` key policy

| Statement | Principals | Can |
|---|---|---|
| `KeyAdministration` | `kubcode-github-deploy`, break-glass admins | manage. **No** crypto, **no** `CreateGrant` |
| `RootUserRecovery` | account root user only (`aws:PrincipalArn = …:root`) | same admin actions, for recovery |
| `PublicKeyRead` | admins + `kubcode-github-preview` | `GetPublicKey`, `DescribeKey`, `GetKeyPolicy`, `ListResourceTags` |
| `KeyDecrypt` | the `wrapKeyDecryptArns` hook in `index.ts`, which must match `role/kubcode-lambda-*` | `Decrypt` with `kms:EncryptionAlgorithm = RSAES_OAEP_SHA_256` only. Absent until step 5 adds the Lambda roles (KMS rejects a policy naming a role that does not exist) |
| `DenyDecryptOutsideLambdaRoles` | `*` unless `aws:PrincipalArn` is `role/kubcode-lambda-*` | **Deny** `Decrypt`, `ReEncrypt*`: covers admins, root and other accounts |
| `DenyGrants` | `*` | **Deny** `CreateGrant` |

Nobody encrypts through KMS: the web host uses the committed public key
(`lib/keys/secrets-wrap-v1.pub.pem`). CI is denied `PutKeyPolicy` and
`CreateGrant` on this key by the boundary, so **any change to this key policy
(including adding the step-5 Lambda roles to the hook) is an admin apply**.

## Day to day

- **PR** touching `infra/**`: `.github/workflows/infra.yml` runs the unit tests,
  then `pulumi preview` with `kubcode-github-preview`, and comments the diff
  summary on the PR (one comment, updated in place).
- **main**: tests, then preview with `kubcode-github-deploy`, then the gate, then
  `pulumi up`. If the preview **deletes or replaces** anything, the push run
  fails and prints `approve infra <digest>`. The digest is bound to the exact set
  of destructive steps. The owner then runs *Actions → Infra → Run workflow* on
  `main` with that phrase. Another actor, or a phrase that does not match, does
  not apply. A re-run must also be triggered by the owner (`GITHUB_TRIGGERING_ACTOR`).
  This is an accident interlock, not an authorization boundary (anyone who can
  push can edit workflows).
- The gate checks the preview, then `pulumi up --skip-preview` recomputes the
  plan from the same commit and the same state, inside the `infra-prod`
  concurrency group. The plan can only differ if someone applies to the stack
  locally between those two steps. Don't apply locally while an Infra run is in
  progress. (`pulumi up --plan` would close this gap, but it is still a preview
  feature in CLI 3.232.)

## Admin-only local apply (bootstrap, boundary changes, emergencies)

```bash
cd infra
npm ci --ignore-scripts
export AWS_PROFILE=default AWS_REGION=ap-southeast-1
aws sts get-caller-identity --query Account --output text   # must be 955758449820
pulumi preview --stack prod --diff     # read it fully: only kubcode-* changes
pulumi up --stack prod
```

The provider pins `allowedAccountIds: [955758449820]`, and default providers are
disabled, so a wrong profile fails instead of creating resources elsewhere.

### One-time bootstrap (done 2026-11-04)

```bash
infra/scripts/bootstrap.sh state      # state bucket + alias/kubcode-pulumi (idempotent)
infra/scripts/bootstrap.sh stack      # stack prod with the awskms secrets provider
pulumi -C infra config set --stack prod --path 'kubcode:breakGlassAdminArns[0]' arn:aws:iam::955758449820:user/super_admin
pulumi -C infra config set --stack prod --path 'pulumi:disable-default-providers[0]' aws
infra/scripts/bootstrap.sh cost-tag   # retry after ~24h if billing has not seen the tag yet
```

### Budget email

```bash
pulumi -C infra config set --stack prod --secret kubcode:budgetEmail <address chosen by the owner>
```

The address is stored as a stack secret (encrypted with `alias/kubcode-pulumi`),
so the owner's personal address is not in git as plaintext. Then open a PR. The
budget appears as one `create` in the preview, and CI applies it on merge. Set
on 2026-11-04 (address chosen by the owner). Notifications: actual > 80% and
forecast > 100% of $5.

## Skill package downloads

ADR `docs/adr/0002-skill-package-downloads.md`, contract
`docs/design/package-signer.md`. The web host holds no AWS credentials. It calls
a small Rust Lambda that presigns a 60-second S3 GET URL for one package.

| Resource | Notes |
|---|---|
| S3 objects `packages/<slug>/<version>.zip` in `kubcode-media-955758449820` | One line per package in `PACKAGES` (`src/constants.ts`). The stack zips `packages/<slug>/<version>/` (repo root) and stores it with SSE-S3 (`AES256`, not the bucket's KMS default, so the signer needs no KMS). Always managed, independent of the signer secret. `growkaz-stickman` and `thai-survival` must never be listed (test-enforced) |
| IAM role `kubcode-package-signer` | Boundary `kubcode-deploy-boundary`, trusts `lambda.amazonaws.com`. Inline policy: `s3:GetObject` on `…/packages/*` and `logs:CreateLogStream`/`PutLogEvents` on its own log group. No KMS, no ListBucket, no other bucket |
| Log group `/aws/lambda/kubcode-package-signer` | Retention 14 days |
| Lambda `kubcode-package-signer` | `provided.al2023`, `x86_64`, handler `bootstrap`, 128 MB, 5 s. Code: `services/package-signer/dist/bootstrap.zip` (uploaded as-is so `bootstrap` keeps mode 0755), built by `services/package-signer/build-lambda.sh` (CI runs it before Pulumi). Env `KUBCODE_PACKAGE_BUCKET` and `KUBCODE_PACKAGE_SIGNER_KEY` (secret) |
| Function URL (auth `NONE`, no CORS) + two resource-policy statements | The HMAC in each request is the authentication; the URL is server-to-server only. Output `packageSignerUrl` |

The role, log group, function and URL exist **only while the secret
`kubcode:packageSignerKey` is set** (like the budget), so previews and tests work
before the binary exists and before the owner sets it. Adding a package is one
line in `PACKAGES` plus the files under `packages/<slug>/<version>/`; the owner
merging that PR is the approval.

### Owner's one-time steps, in order

1. **Admin local apply of the boundary change** (CI cannot change the boundary).
   Do this **from the PR branch, before merging it**: the first CI `pulumi up` on
   main would otherwise try to update the boundary, be denied, and fail halfway.
   The boundary gains Lambda and Logs on `kubcode-*` and `iam:PassRole`. See
   "Admin-only local apply". Read the preview: expect updates to
   `kubcode-deploy-boundary`, the two GitHub roles' inline policies and the
   package zip object. Nothing else.
2. **Set the signing key**, then open a PR so CI creates the Lambda:
   ```bash
   KEY=$(openssl rand -hex 32)
   printf %s "$KEY" | pulumi -C infra config set --stack prod --secret kubcode:packageSignerKey
   ```
   Stdin keeps the key out of argv. Keep `$KEY` for step 3. At least 32 bytes is enforced.
3. **Wire the web host** once CI has applied: read the URL with
   `pulumi -C infra stack output --stack prod packageSignerUrl`, then run
   `infra/web/scripts/webhost.sh set-downloads`. It asks for
   `KUBCODE_PACKAGE_SIGNER_URL` (that URL) and `KUBCODE_PACKAGE_SIGNER_KEY`
   (the same `$KEY`, hidden), turns on `KUBCODE_DOWNLOADS_ENABLED` and merges
   just those keys into the box's env file (every other secret is kept). A box
   provisioned before `--merge` existed needs `webhost.sh provision` first.
   `set-env` asks for the same two values after the usual secrets.

To rotate the key, set a new secret, let CI apply, then update the web host.

Cost: Lambda and S3 requests stay inside the free tier at this traffic, logs are
kept 14 days, the package zip is ~150 KB. No new paid resource.

Possible later hardening (not done): reserved concurrency on the function to cap
abuse of the public URL. Not set now because the account's Lambda concurrency
quota may be too small to reserve any (`scripts/bootstrap.sh quota`).

## Settings keys wrap key (docs/design/settings-keys.md §1, §5)

What the PR adds: `alias/kubcode-secrets-wrap` with its key policy, the boundary
changes above (wrap key in the ceiling, Decrypt Deny outside
`kubcode-lambda-*`, SSM read on `parameter/kubcode/*`) and `SsmParameterWrite`
on `alias/kubcode-secrets`. CI cannot create KMS keys or change the boundary,
so an admin applies it.

**SSM parameters are deliberately not managed here.** With Pulumi,
`ignoreChanges: [value]` keeps the placeholder in state; any later update of the
parameter (description, tier, key) makes the provider send that placeholder and
overwrite the real secret, and a refresh would copy the real value into state.
The admin sets them with the CLI at step 5 instead.

### Owner's steps, in order

1. **Admin apply from the PR branch, before merging** (the first CI run on main
   would otherwise be denied on the key and the boundary and fail halfway):
   ```bash
   git fetch origin && git switch infra/settings-wrap-key
   cd infra && npm ci --ignore-scripts
   export AWS_PROFILE=default AWS_REGION=ap-southeast-1
   aws sts get-caller-identity --query Account --output text   # must be 955758449820
   pulumi preview --stack prod --diff
   ```
   Read the preview fully. Expect exactly: **create** `secrets-wrap-key`,
   `secrets-wrap-key-alias` (`alias/kubcode-secrets-wrap`) and
   `secrets-wrap-key-policy`; **update** `deploy-boundary`
   (`kubcode-deploy-boundary`) and `secrets-key-policy`. Nothing deleted or
   replaced, nothing outside `kubcode-*`. Then:
   ```bash
   pulumi up --stack prod
   pulumi stack output --stack prod wrapKeyArn
   ```
2. **Export the public key** (repo root, same credentials):
   ```bash
   npm run keys:wrap-key -- export
   npm run keys:wrap-key -- interop --expect-denied   # PASS = the admin cannot Decrypt
   ```
   `export` writes `lib/keys/secrets-wrap-v1.pub.pem` and prints the SPKI
   SHA-256 fingerprint. Commit the PEM on the PR branch (the public key is not
   a secret) and post the fingerprint on the PR; the follow-up commit sets
   `CURRENT_WRAP_KEY` and pins the fingerprint in the TS test and the Rust crate.
   **Done 2026-11-05:** key `39320743-1ef2-4627-b212-df76db143dc3`, SPKI SHA-256
   `3e1ff570c6db6682616c623cffbcfd84a572291462d4b564f30efd65d9268ac5`
   (pinned in `tests/wrap-key.test.ts` and `kubcode-envelope/src/keys.rs`).
3. **Merge** the PR (after #23). The CI run on main should be a no-op.
4. **At step 5**, once the Lambdas exist (run this block in `bash`; it uses `read -s`):
   ```bash
   # Supabase SQL editor (role created by migration 0004):
   #   ALTER ROLE kubcode_worker LOGIN PASSWORD '<generated>';
   F=$(mktemp) && chmod 600 "$F"           # keeps values out of argv / ps
   read -rs -p 'worker DB URL: ' V && printf %s "$V" > "$F" && unset V
   aws ssm put-parameter --region ap-southeast-1 --type SecureString \
     --key-id alias/kubcode-secrets --name /kubcode/prod/worker-db-url --value "file://$F"
   openssl rand -hex 32 | tr -d '\n' > "$F"   # keep this value for the web host env
   aws ssm put-parameter --region ap-southeast-1 --type SecureString \
     --key-id alias/kubcode-secrets --name /kubcode/prod/connect-hmac-key --value "file://$F"
   rm -f "$F"
   ```
   The HMAC key also goes into the web host env (`KUBCODE_CONNECT_HMAC_KEY`),
   so copy it from the file before `rm`. Add `--overwrite` to change a value later. Values never go in git, chat or
   Pulumi state. When step 5 adds the Lambda roles to `wrapKeyDecryptArns`,
   that key-policy change is an admin apply too (CI cannot change this key
   policy). Then run `npm run keys:wrap-key -- interop` with a Lambda role's
   credentials (or inside the Lambda) for the end-to-end interop check.

## OAuth connect Lambda (docs/design/settings-keys.md §2, §5)

`kubcode:oauthConnect: "true"` deploys `kubcode-oauth-connect` (role
`kubcode-lambda-oauth-connect`, log group, Function URL) and adds the role to the
secrets key's `KeyUse` and the wrap key's `KeyDecrypt`. CI cannot change the wrap
key policy, so the admin applies this from the PR branch **before merging**.

### Admin apply, in order (bash, repo root, admin profile)

```bash
git fetch origin && git switch feat/oauth-connect
# Both Lambda binaries are static musl builds (Linux only): build them in Docker.
# Mount the repo root: the crates embed files from lib/keys and db/certs.
docker run --rm --platform linux/amd64 -v "$PWD:/repo" -w /repo rust:1-bookworm bash -c \
  'rustup target add x86_64-unknown-linux-musl && apt-get update && apt-get install -y musl-tools zip &&
   bash services/package-signer/build-lambda.sh &&
   CARGO_TARGET_DIR=/tmp/target-linux bash services/crates/kubcode-oauth-connect/build-lambda.sh'
cd infra && npm ci --ignore-scripts
export AWS_PROFILE=default AWS_REGION=ap-southeast-1   # the default profile's region is ap-southeast-7
aws sts get-caller-identity --query '[Account,Arn]' --output text   # 955758449820 … user/super_admin
pulumi preview --stack prod --diff
pulumi up --stack prod
pulumi stack output --stack prod oauthConnectUrl
```

Expected preview: **create** `oauth-connect-role`, `oauth-connect-policy`,
`oauth-connect-logs`, `oauth-connect`, `oauth-connect-url`,
`oauth-connect-url-access`, `oauth-connect-url-invoke`; **update**
`deploy-boundary` (`DenyRoleTrustChanges` now also covers `kubcode-lambda-*`:
CI cannot change who may assume those roles or delete them; action lists
shortened with exact wildcards to stay under IAM's 6,144-character limit), `secrets-key-policy` (KeyUse gains the role)
and `secrets-wrap-key-policy` (KeyDecrypt gains the role); also
`package-signer [~code]` (local build bytes).
Nothing deleted or replaced, nothing outside `kubcode-*`.

Then the owner runs `infra/web/scripts/webhost.sh set-connect`
(docs/design/settings-keys-owner-checklist.md §E), then merge. The worker DB URL
is already in SSM from the move to Supabase `kubcode-sg`
(`infra/scripts/move-db.sh`); `webhost.sh set-worker-db` is only for rotating it.

## Tests

`npm test` (in `infra/`) runs unit tests with Pulumi mocks. They cover policy
scoping (boundary incl. the wrap-key Decrypt Deny and SSM read, deploy, preview,
both key policies), naming and tags (one explicit
provider), the media bucket settings, the OIDC lookup, the budget, the package
signer (role, log group, function, URL, package objects) and the CI gate. `npm run typecheck` checks types. The root `tsconfig.json` excludes `infra/`.
