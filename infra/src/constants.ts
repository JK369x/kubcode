// Fixed identifiers for the kubcode AWS footprint. The account also holds
// unrelated client resources: everything this stack owns is named kubcode-*.
export const ACCOUNT_ID = "955758449820";
export const REGION = "ap-southeast-1";
export const PROJECT_TAG = { project: "kubcode" } as const;
export const MEDIA_CORS_ORIGIN = "https://kubcode.dev";

// Shared with other repositories in this account: looked up, never managed.
export const GITHUB_OIDC_PROVIDER_ARN = `arn:aws:iam::${ACCOUNT_ID}:oidc-provider/token.actions.githubusercontent.com`;

export const NAMES = {
  // Created by scripts/bootstrap.sh, outside the stack.
  stateBucket: `kubcode-pulumi-state-${ACCOUNT_ID}`,
  stateKeyAlias: "alias/kubcode-pulumi",
  // Managed by the stack.
  mediaBucket: `kubcode-media-${ACCOUNT_ID}`,
  secretsKeyAlias: "alias/kubcode-secrets",
  // RSA key that wraps per-secret DEKs (docs/design/settings-keys.md §1).
  wrapKeyAlias: "alias/kubcode-secrets-wrap",
  deployRole: "kubcode-github-deploy",
  previewRole: "kubcode-github-preview",
  deployBoundary: "kubcode-deploy-boundary",
  budget: "kubcode-monthly",
  // Skill package downloads (ADR 0002).
  packageSignerFunction: "kubcode-package-signer",
  packageSignerRole: "kubcode-package-signer",
  packageSignerLogGroup: "/aws/lambda/kubcode-package-signer",
  // OAuth connect Lambda (docs/design/settings-keys.md §2). The role name must
  // match kubcode-lambda-* to ever decrypt with the wrap key.
  oauthConnectFunction: "kubcode-oauth-connect",
  oauthConnectRole: "kubcode-lambda-oauth-connect",
  oauthConnectLogGroup: "/aws/lambda/kubcode-oauth-connect",
  // Publishing Lambda (docs/design/publishing-core.md §4): one binary, two
  // functions sharing one role. The ops function has no URL (IAM invoke only).
  publishingFunction: "kubcode-publishing",
  publishingOpsFunction: "kubcode-publishing-ops",
  publishingRole: "kubcode-lambda-publishing",
  publishingLogGroup: "/aws/lambda/kubcode-publishing",
  publishingOpsLogGroup: "/aws/lambda/kubcode-publishing-ops",
  // Spike resources that predate this stack; denied to every kubcode role.
  outOfScopePrefix: "kubcode-igtest-",
} as const;

// The repo uses GitHub's immutable OIDC subject (owner/repo IDs), see
// `gh api repos/JK369x/kubcode/actions/oidc/customization/sub`. Tokens never
// carry the name-only `repo:JK369x/kubcode:` form.
export const GITHUB_SUB_PREFIX = "repo:JK369x@104179568/kubcode@1444458364";

export const GITHUB_SUBJECTS = {
  deploy: [`${GITHUB_SUB_PREFIX}:ref:refs/heads/main`],
  preview: [`${GITHUB_SUB_PREFIX}:pull_request`],
} as const;

// --- Skill package downloads (docs/adr/0002-skill-package-downloads.md)

// Zip holding the static musl binary `bootstrap` (mode 0755), produced by
// services/package-signer/build-lambda.sh. Uploaded as-is: repacking it with
// AssetArchive could drop the exec bit. Relative to infra/, where Pulumi runs.
export const PACKAGE_SIGNER_BINARY = "../services/package-signer/dist/bootstrap.zip";
export const PACKAGE_LOG_RETENTION_DAYS = 14;
// The HMAC key must be at least this long (both the web app and the Lambda enforce it).
export const PACKAGE_SIGNER_KEY_MIN_BYTES = 32;

/**
 * Downloadable skill packages. One line per package version: the stack zips
 * `packages/<slug>/<version>/` (repo root) and stores it as
 * `packages/<slug>/<version>.zip` in the media bucket. The owner approves a
 * package by merging the PR that adds it. growkaz-stickman and thai-survival
 * have no licence and must never appear here.
 */
export const PACKAGES: readonly { slug: string; version: string }[] = [
  { slug: "freshstack-what-if", version: "0.1.0" },
  { slug: "podcast-tool-short", version: "0.1.0" },
];

export const packageObjectKey = (p: { slug: string; version: string }) => `packages/${p.slug}/${p.version}.zip`;
// Relative to infra/, like PACKAGE_SIGNER_BINARY.
export const packageSourceDir = (p: { slug: string; version: string }) => `../packages/${p.slug}/${p.version}`;

export function validatePackageSignerKey(key: string): string {
  if (Buffer.byteLength(key, "utf8") < PACKAGE_SIGNER_KEY_MIN_BYTES)
    throw new Error(`kubcode:packageSignerKey must be at least ${PACKAGE_SIGNER_KEY_MIN_BYTES} bytes (use: openssl rand -hex 32)`);
  return key;
}

// --- Settings keys (docs/design/settings-keys.md §1, §5)

// Only roles with this prefix may ever decrypt with the wrap key (boundary Deny).
export const LAMBDA_ROLE_PREFIX = "kubcode-lambda-";

/**
 * SecureString parameters read by the step-5 Lambdas. Created and set by the
 * admin with `aws ssm put-parameter`, never by this stack: a Pulumi-managed
 * parameter with ignoreChanges on its value would re-send the placeholder from
 * state on any later update and overwrite the real secret.
 */
export const SSM_PARAMETERS = {
  workerDbUrl: "/kubcode/prod/worker-db-url",
  connectHmacKey: "/kubcode/prod/connect-hmac-key",
  // kubcode's shared Google client, JSON {client_id, client_secret} (design §2a).
  googleConnectClient: "/kubcode/prod/google-connect-client",
} as const;

// What the publishing Lambda reads (SecureStrings set by the admin CLI, never
// the stack). The worker DB URL is shared with the connect Lambda.
export const PUBLISHING_PARAMETERS = {
  workerDbUrl: "/kubcode/prod/worker-db-url",
  hmacKey: "/kubcode/prod/publishing-hmac-key",
  zernioApiKey: "/kubcode/prod/zernio-api-key",
  zernioWebhookSecret: "/kubcode/prod/zernio-webhook-secret",
  zernioWebhookSecretPrevious: "/kubcode/prod/zernio-webhook-secret-previous",
  // Signs the owner CLI's ops commands; the other copy is in the owner's vault.
  opsKey: "/kubcode/prod/publishing-ops-key",
} as const;

// services/crates/kubcode-publishing-lambda/build-lambda.sh output. Relative to infra/.
export const PUBLISHING_BINARY = "../services/crates/kubcode-publishing-lambda/dist/bootstrap.zip";

// Zip with the static musl `bootstrap` from
// services/crates/kubcode-oauth-connect/build-lambda.sh. Relative to infra/.
export const OAUTH_CONNECT_BINARY = "../services/crates/kubcode-oauth-connect/dist/bootstrap.zip";
