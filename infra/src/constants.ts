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
  deployRole: "kubcode-github-deploy",
  previewRole: "kubcode-github-preview",
  deployBoundary: "kubcode-deploy-boundary",
  budget: "kubcode-monthly",
  // Skill package downloads (ADR 0002).
  packageSignerFunction: "kubcode-package-signer",
  packageSignerRole: "kubcode-package-signer",
  packageSignerLogGroup: "/aws/lambda/kubcode-package-signer",
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
export const PACKAGES: readonly { slug: string; version: string }[] = [{ slug: "freshstack-what-if", version: "0.1.0" }];

export const packageObjectKey = (p: { slug: string; version: string }) => `packages/${p.slug}/${p.version}.zip`;
// Relative to infra/, like PACKAGE_SIGNER_BINARY.
export const packageSourceDir = (p: { slug: string; version: string }) => `../packages/${p.slug}/${p.version}`;

export function validatePackageSignerKey(key: string): string {
  if (Buffer.byteLength(key, "utf8") < PACKAGE_SIGNER_KEY_MIN_BYTES)
    throw new Error(`kubcode:packageSignerKey must be at least ${PACKAGE_SIGNER_KEY_MIN_BYTES} bytes (use: openssl rand -hex 32)`);
  return key;
}
