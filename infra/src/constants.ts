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
