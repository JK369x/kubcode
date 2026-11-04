// IAM and KMS policy documents for the kubcode stack, as pure functions so the
// scoping rules can be unit-tested without AWS.
//
// Model: every kubcode-* role carries the permissions boundary
// `kubcode-deploy-boundary`. The deploy role may create or change roles only
// when they carry that boundary, and nothing CI runs may edit or remove the
// boundary. So even if CI rewrote its own role policy, it could not reach
// beyond kubcode-* resources (this account also holds client resources).
// Changing the boundary is an admin-only, local `pulumi up` (see README).
import { ACCOUNT_ID, GITHUB_REPO, NAMES, REGION } from "./constants";

export type Statement = {
  Sid?: string;
  Effect: "Allow" | "Deny";
  Action: string | string[];
  Resource?: string | string[];
  Principal?: { AWS?: string | string[]; Federated?: string; Service?: string };
  Condition?: Record<string, Record<string, string | string[]>>;
};
export type PolicyDocument = { Version: "2012-10-17"; Statement: Statement[] };

const doc = (Statement: Statement[]): PolicyDocument => ({ Version: "2012-10-17", Statement });

const iam = (kind: "role" | "policy", name: string) => `arn:aws:iam::${ACCOUNT_ID}:${kind}/${name}`;
const s3 = (bucket: string, path?: string) => `arn:aws:s3:::${bucket}${path === undefined ? "" : `/${path}`}`;
const KUBCODE_ROLES = iam("role", "kubcode-*");
const KUBCODE_POLICIES = iam("policy", "kubcode-*");
const KUBCODE_BUCKETS = s3("kubcode-*");
const KUBCODE_OBJECTS = s3("kubcode-*", "*");
const KUBCODE_ALIASES = `arn:aws:kms:${REGION}:${ACCOUNT_ID}:alias/kubcode-*`;
const KUBCODE_BUDGETS = `arn:aws:budgets::${ACCOUNT_ID}:budget/kubcode-*`;
const OIDC_PROVIDERS = `arn:aws:iam::${ACCOUNT_ID}:oidc-provider/*`;

const IAM_READ = [
  "iam:GetRole",
  "iam:GetRolePolicy",
  "iam:ListRolePolicies",
  "iam:ListAttachedRolePolicies",
  "iam:ListRoleTags",
  "iam:ListInstanceProfilesForRole",
  "iam:GetPolicy",
  "iam:GetPolicyVersion",
  "iam:ListPolicyVersions",
  "iam:ListPolicyTags",
];

/** Trust policy for a role assumed from GitHub Actions via the shared OIDC provider. */
export function githubTrustPolicy(oidcProviderArn: string, subjects: readonly string[]): PolicyDocument {
  if (subjects.length === 0) throw new Error("at least one GitHub subject is required");
  for (const sub of subjects) {
    if (sub.includes("*")) throw new Error(`wildcard GitHub subject not allowed: ${sub}`);
    if (!sub.startsWith(`repo:${GITHUB_REPO}:`)) throw new Error(`subject must belong to ${GITHUB_REPO}: ${sub}`);
  }
  return doc([
    {
      Effect: "Allow",
      Action: "sts:AssumeRoleWithWebIdentity",
      Principal: { Federated: oidcProviderArn },
      Condition: {
        StringEquals: {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
          "token.actions.githubusercontent.com:sub": [...subjects],
        },
      },
    },
  ]);
}

/**
 * The permissions boundary (ceiling) for every kubcode-* role. Covers what
 * slice 1 manages (S3, KMS aliases, IAM roles/policies, budget) plus the
 * Pulumi state. New services (Lambda, Scheduler, SSM) and new KMS keys are
 * added here by an admin-run `pulumi up`; CI is denied from changing it.
 */
export function deployBoundaryPolicy(opts: { stateKeyArn: string; secretsKeyArn: string; boundaryArn: string }): PolicyDocument {
  return doc([
    ...sharedDeployStatements(opts.boundaryArn),
    // Ceiling only: a key policy that names a role ARN is still capped by the
    // role's boundary, so the key-policy grants on these two keys must fit
    // here. No other key (client keys included) is reachable.
    { Sid: "KubcodeKeysCeiling", Effect: "Allow", Action: "kms:*", Resource: [opts.stateKeyArn, opts.secretsKeyArn] },
  ]);
}

/**
 * The deploy role's own permissions: the shared kubcode-* statements plus the
 * Pulumi state key. The secrets key is reached only through its key policy
 * (it has no account-root statement), and CI cannot create KMS keys.
 */
export function deployPolicy(opts: { stateKeyArn: string; boundaryArn: string }): PolicyDocument {
  return doc([
    ...sharedDeployStatements(opts.boundaryArn),
    {
      Sid: "StateKey",
      Effect: "Allow",
      Action: ["kms:Decrypt", "kms:Encrypt", "kms:GenerateDataKey", "kms:DescribeKey"],
      Resource: opts.stateKeyArn,
    },
  ]);
}

function sharedDeployStatements(boundaryArn: string): Statement[] {
  const withBoundary = { StringEquals: { "iam:PermissionsBoundary": boundaryArn } };
  return [
    { Sid: "KubcodeBuckets", Effect: "Allow", Action: "s3:*", Resource: [KUBCODE_BUCKETS, KUBCODE_OBJECTS] },
    { Sid: "ListKms", Effect: "Allow", Action: ["kms:ListAliases", "kms:ListKeys"], Resource: "*" },
    {
      Sid: "ManageKubcodeAliases",
      Effect: "Allow",
      Action: ["kms:CreateAlias", "kms:DeleteAlias", "kms:UpdateAlias"],
      Resource: KUBCODE_ALIASES,
    },
    {
      Sid: "WriteRolesWithBoundary",
      Effect: "Allow",
      Action: [
        "iam:CreateRole",
        "iam:PutRolePermissionsBoundary",
        "iam:PutRolePolicy",
        "iam:DeleteRolePolicy",
        "iam:AttachRolePolicy",
        "iam:DetachRolePolicy",
      ],
      Resource: KUBCODE_ROLES,
      Condition: withBoundary,
    },
    {
      // These actions do not expose iam:PermissionsBoundary; the boundary
      // already caps whatever such a role could do.
      Sid: "MaintainRoles",
      Effect: "Allow",
      Action: [
        "iam:UpdateRole",
        "iam:UpdateRoleDescription",
        "iam:UpdateAssumeRolePolicy",
        "iam:TagRole",
        "iam:UntagRole",
        "iam:DeleteRole",
      ],
      Resource: KUBCODE_ROLES,
    },
    {
      Sid: "ManagePolicies",
      Effect: "Allow",
      Action: [
        "iam:CreatePolicy",
        "iam:CreatePolicyVersion",
        "iam:DeletePolicy",
        "iam:DeletePolicyVersion",
        "iam:SetDefaultPolicyVersion",
        "iam:TagPolicy",
        "iam:UntagPolicy",
      ],
      Resource: KUBCODE_POLICIES,
    },
    { Sid: "ReadIam", Effect: "Allow", Action: IAM_READ, Resource: [KUBCODE_ROLES, KUBCODE_POLICIES] },
    {
      Sid: "ReadSharedGithubOidc",
      Effect: "Allow",
      Action: ["iam:GetOpenIDConnectProvider"],
      Resource: `arn:aws:iam::${ACCOUNT_ID}:oidc-provider/token.actions.githubusercontent.com`,
    },
    {
      Sid: "ManageKubcodeBudgets",
      Effect: "Allow",
      Action: ["budgets:ViewBudget", "budgets:ModifyBudget", "budgets:ListTagsForResource", "budgets:TagResource", "budgets:UntagResource"],
      Resource: KUBCODE_BUDGETS,
    },

    {
      Sid: "DenyBoundaryTampering",
      Effect: "Deny",
      Action: [
        "iam:CreatePolicyVersion",
        "iam:DeletePolicy",
        "iam:DeletePolicyVersion",
        "iam:SetDefaultPolicyVersion",
        "iam:TagPolicy",
        "iam:UntagPolicy",
      ],
      Resource: boundaryArn,
    },
    { Sid: "DenyBoundaryRemoval", Effect: "Deny", Action: "iam:DeleteRolePermissionsBoundary", Resource: KUBCODE_ROLES },
    {
      Sid: "DenySharedOidcWrites",
      Effect: "Deny",
      Action: [
        "iam:CreateOpenIDConnectProvider",
        "iam:DeleteOpenIDConnectProvider",
        "iam:UpdateOpenIDConnectProviderThumbprint",
        "iam:AddClientIDToOpenIDConnectProvider",
        "iam:RemoveClientIDFromOpenIDConnectProvider",
        "iam:TagOpenIDConnectProvider",
        "iam:UntagOpenIDConnectProvider",
      ],
      Resource: OIDC_PROVIDERS,
    },
    {
      Sid: "DenyOutOfScopeSpike",
      Effect: "Deny",
      Action: "*",
      Resource: [
        iam("role", `${NAMES.outOfScopePrefix}*`),
        iam("policy", `${NAMES.outOfScopePrefix}*`),
        s3(`${NAMES.outOfScopePrefix}*`),
        s3(`${NAMES.outOfScopePrefix}*`, "*"),
      ],
    },
    {
      Sid: "DenyStateBucketDestruction",
      Effect: "Deny",
      Action: [
        "s3:DeleteBucket",
        "s3:DeleteBucketPolicy",
        "s3:PutBucketPolicy",
        "s3:PutBucketVersioning",
        "s3:PutLifecycleConfiguration",
        "s3:PutEncryptionConfiguration",
        "s3:PutBucketPublicAccessBlock",
        "s3:DeleteObjectVersion",
      ],
      Resource: [s3(NAMES.stateBucket), s3(NAMES.stateBucket, "*")],
    },
  ];
}

/** Read-only role for `pulumi preview` on pull requests. */
export function previewPolicy(opts: { stateKeyArn: string }): PolicyDocument {
  return doc([
    {
      Sid: "ReadState",
      Effect: "Allow",
      Action: ["s3:GetObject", "s3:ListBucket", "s3:GetBucketLocation"],
      Resource: [s3(NAMES.stateBucket), s3(NAMES.stateBucket, "*")],
    },
    // The DIY backend takes a stack lock even for previews.
    { Sid: "StackLocks", Effect: "Allow", Action: ["s3:PutObject", "s3:DeleteObject"], Resource: s3(NAMES.stateBucket, ".pulumi/locks/*") },
    { Sid: "DecryptStackConfig", Effect: "Allow", Action: ["kms:Decrypt", "kms:DescribeKey"], Resource: opts.stateKeyArn },
    {
      Sid: "ReadBucketSettings",
      Effect: "Allow",
      Action: ["s3:GetBucket*", "s3:GetLifecycleConfiguration", "s3:GetEncryptionConfiguration", "s3:GetAccelerateConfiguration", "s3:GetReplicationConfiguration"],
      Resource: KUBCODE_BUCKETS,
    },
    { Sid: "ReadIam", Effect: "Allow", Action: IAM_READ, Resource: [KUBCODE_ROLES, KUBCODE_POLICIES] },
    {
      Sid: "ReadSharedGithubOidc",
      Effect: "Allow",
      Action: ["iam:GetOpenIDConnectProvider"],
      Resource: `arn:aws:iam::${ACCOUNT_ID}:oidc-provider/token.actions.githubusercontent.com`,
    },
    { Sid: "ListKms", Effect: "Allow", Action: ["kms:ListAliases"], Resource: "*" },
    { Sid: "ReadBudgets", Effect: "Allow", Action: ["budgets:ViewBudget", "budgets:ListTagsForResource"], Resource: KUBCODE_BUDGETS },
  ]);
}

// Key management without crypto use; deliberately no kms:CreateGrant.
const KEY_ADMIN_ACTIONS = [
  "kms:DescribeKey",
  "kms:GetKeyPolicy",
  "kms:GetKeyRotationStatus",
  "kms:ListResourceTags",
  "kms:ListGrants",
  "kms:ListKeyPolicies",
  "kms:PutKeyPolicy",
  "kms:UpdateKeyDescription",
  "kms:EnableKey",
  "kms:DisableKey",
  "kms:EnableKeyRotation",
  "kms:DisableKeyRotation",
  "kms:RotateKeyOnDemand",
  "kms:RevokeGrant",
  "kms:CreateAlias",
  "kms:UpdateAlias",
  "kms:DeleteAlias",
  "kms:TagResource",
  "kms:UntagResource",
  "kms:ScheduleKeyDeletion",
  "kms:CancelKeyDeletion",
];

/**
 * Key policy for alias/kubcode-secrets (BYOK envelope encryption). The
 * account root appears only as the root USER (aws:PrincipalArn = root), for
 * recovery if every admin below is lost; it does not delegate to IAM, so IAM
 * policies alone (e.g. other admins or client roles in this account) never
 * reach this key.
 * - admins (deploy role + break-glass admin) and the root user manage the key
 *   but cannot use it for crypto and cannot create grants;
 * - readers (preview role) can describe it;
 * - users (the Lambda roles, added later) are the only principals that can
 *   encrypt/decrypt.
 */
export function secretsKeyPolicy(opts: { adminArns: string[]; readerArns: string[]; userArns: string[] }): PolicyDocument {
  if (opts.adminArns.length === 0) throw new Error("the secrets key needs at least one admin (lockout safety)");
  const root = `arn:aws:iam::${ACCOUNT_ID}:root`;
  const statements: Statement[] = [
    { Sid: "KeyAdministration", Effect: "Allow", Principal: { AWS: opts.adminArns }, Action: KEY_ADMIN_ACTIONS, Resource: "*" },
    {
      Sid: "RootUserRecovery",
      Effect: "Allow",
      Principal: { AWS: root },
      Action: KEY_ADMIN_ACTIONS,
      Resource: "*",
      Condition: { StringEquals: { "aws:PrincipalArn": root } },
    },
  ];
  if (opts.readerArns.length > 0)
    statements.push({
      Sid: "KeyRead",
      Effect: "Allow",
      Principal: { AWS: opts.readerArns },
      Action: ["kms:DescribeKey", "kms:GetKeyPolicy", "kms:GetKeyRotationStatus", "kms:ListResourceTags"],
      Resource: "*",
    });
  if (opts.userArns.length > 0)
    statements.push({
      Sid: "KeyUse",
      Effect: "Allow",
      Principal: { AWS: opts.userArns },
      Action: ["kms:Encrypt", "kms:Decrypt", "kms:GenerateDataKey", "kms:DescribeKey"],
      Resource: "*",
    });
  return doc(statements);
}
