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
| S3 `kubcode-media-955758449820` | stack | Block public access, SSE-KMS (`aws/s3` + bucket key), versioning off, abort incomplete multipart after 7 days, CORS `https://kubcode.dev` PUT/POST/GET (exposes `ETag`), TLS-only |
| IAM policy `kubcode-deploy-boundary` | stack, **admin-only changes** | Permissions boundary for every `kubcode-*` role |
| IAM role `kubcode-github-deploy` | stack | OIDC `repo:JK369x/kubcode:ref:refs/heads/main` only. Runs `pulumi up` |
| IAM role `kubcode-github-preview` | stack | OIDC `repo:JK369x/kubcode:pull_request` only. Read-only, plus Pulumi lock objects |
| Budget `kubcode-monthly` ($5, `user:project$kubcode`) | stack | Created only once `kubcode:budgetEmail` is set |
| Cost allocation tag `project` | `scripts/bootstrap.sh cost-tag` | Can be activated only after billing has seen the tag (up to 24h) |
| Lambda concurrency quota | `scripts/bootstrap.sh quota N` | The API accepts only N > 1000 (the AWS default). Lower values need a console support case |

The backend is pinned in `Pulumi.yaml` (`backend.url`). **Never run `pulumi login`
or `pulumi logout`** for this project: the machine's default login is used by
other work.

## Permission model

- Every `kubcode-*` role carries the boundary `kubcode-deploy-boundary`. The deploy
  role can create or change roles only when they carry that boundary
  (`iam:PermissionsBoundary` condition). Every kubcode role is denied
  from editing, deleting or detaching the boundary. So even a CI run that rewrote
  its own role policy could not reach beyond `kubcode-*` resources.
- The boundary allows S3 on `kubcode-*` buckets, KMS aliases `alias/kubcode-*`,
  and **only the two kubcode keys by ARN** (state + secrets). It also allows IAM
  roles and policies named `kubcode-*`, budgets `kubcode-*`, and a read (Get) of
  the shared OIDC provider. Writes to any OIDC provider are denied, as are
  destructive changes to the state bucket (delete bucket, delete object versions,
  versioning/policy/lifecycle).
- CI cannot create KMS keys or use services the boundary does not list (Lambda,
  Scheduler, SSM...). Adding them means changing the boundary, and **CI is denied
  from changing the boundary**. An admin applies that change locally (below).

### `alias/kubcode-secrets` key policy

| Statement | Principals | Can |
|---|---|---|
| `KeyAdministration` | `kubcode-github-deploy`, break-glass admins (`kubcode:breakGlassAdminArns`, now `user/super_admin`) | manage (policy, rotation, alias, tags, schedule deletion). **No** encrypt/decrypt, **no** `CreateGrant` |
| `RootUserRecovery` | account root, condition `aws:PrincipalArn = …:root` | same admin actions, for recovery if every admin is lost. The condition means it is the root **user** only: it does not delegate to IAM, so other IAM admins and client roles in the account cannot take over the key |
| `KeyRead` | `kubcode-github-preview` | describe / read policy |
| `KeyUse` | Lambda roles (the hook below) | `Encrypt`, `Decrypt`, `GenerateDataKey`, `DescribeKey`. Absent until a role is added |

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
   Lambda itself (and its logs, scheduler, SSM) is not in the boundary yet. Add
   those statements to `deployBoundaryPolicy` in `src/policies.ts`, scoped to
   `kubcode-*`, with tests, and apply that boundary change as an admin (below)
   before CI can deploy the Lambda.

## Day to day

- **PR** touching `infra/**`: `.github/workflows/infra.yml` runs the unit tests,
  then `pulumi preview` with `kubcode-github-preview`, and comments the diff
  summary on the PR (one comment, updated in place).
- **main**: tests, then preview with `kubcode-github-deploy`, then the gate, then
  `pulumi up`. If the preview **deletes or replaces** anything, the push run
  fails and prints `approve infra <digest>`. The digest is bound to the exact set
  of destructive steps. The owner then runs *Actions → Infra → Run workflow* on
  `main` with that phrase. Another actor, or a phrase that does not match, does
  not apply. This is an accident interlock, not an authorization boundary
  (anyone who can push can edit workflows).

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
pulumi -C infra config set --stack prod kubcode:budgetEmail <address chosen by the owner>
```

Then open a PR. The budget appears as one `create` in the preview.

## Tests

`npm test` (in `infra/`) runs unit tests with Pulumi mocks. They cover policy
scoping (boundary, deploy, preview, key policy), naming and tags (one explicit
provider), the media bucket settings, the OIDC lookup, the budget, and the CI
gate. `npm run typecheck` checks types. The root `tsconfig.json` excludes `infra/`.
