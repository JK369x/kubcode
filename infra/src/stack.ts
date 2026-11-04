// The kubcode `prod` stack: media bucket, BYOK secrets key, GitHub deploy and
// preview roles (via the existing, shared GitHub OIDC provider) and the budget.
// Every resource goes through one explicit provider pinned to the kubcode
// account and region, which tags everything project=kubcode.
import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import {
  ACCOUNT_ID,
  GITHUB_OIDC_PROVIDER_ARN,
  GITHUB_SUBJECTS,
  MEDIA_CORS_ORIGIN,
  NAMES,
  PROJECT_TAG,
  REGION,
} from "./constants";
import { deployBoundaryPolicy, deployPolicy, githubTrustPolicy, previewPolicy, secretsKeyPolicy } from "./policies";

export type StackConfig = {
  /** Budget alert recipient; the budget is skipped until the owner sets one. */
  budgetEmail?: string;
  /** Humans who can administer the secrets key outside CI (lockout safety). */
  breakGlassAdminArns: string[];
  /** Roles allowed to encrypt/decrypt with alias/kubcode-secrets (the Lambda roles). */
  secretsKeyUserArns: pulumi.Input<string>[];
};

const json = (v: unknown) => JSON.stringify(v);

export function createStack(cfg: StackConfig) {
  const provider = new aws.Provider("kubcode", {
    region: REGION,
    allowedAccountIds: [ACCOUNT_ID],
    defaultTags: { tags: { ...PROJECT_TAG } },
  });
  const opts = { provider };
  const invokeOpts = { provider };

  // --- Lookups only: these exist outside this stack and are never managed here.
  const oidc = aws.iam.getOpenIdConnectProviderOutput({ arn: GITHUB_OIDC_PROVIDER_ARN }, invokeOpts);
  const stateKey = aws.kms.getAliasOutput({ name: NAMES.stateKeyAlias }, invokeOpts);

  // --- BYOK secrets key (envelope encryption). Its policy is a separate
  // resource: the boundary below names this key's ARN, and the key policy
  // names the roles that carry that boundary.
  const secretsKey = new aws.kms.Key(
    "secrets-key",
    {
      description: "kubcode-secrets: envelope encryption for per-user BYOK secrets",
      enableKeyRotation: true,
      deletionWindowInDays: 30,
    },
    // Losing this key loses every stored user secret.
    { ...opts, protect: true },
  );
  new aws.kms.Alias("secrets-key-alias", { name: NAMES.secretsKeyAlias, targetKeyId: secretsKey.keyId }, opts);

  // --- Permissions boundary shared by every kubcode-* role.
  const boundaryArn = `arn:aws:iam::${ACCOUNT_ID}:policy/${NAMES.deployBoundary}`;
  const boundary = new aws.iam.Policy(
    "deploy-boundary",
    {
      name: NAMES.deployBoundary,
      description: "Ceiling for every kubcode-* role; only an admin can change it (CI is denied)",
      policy: pulumi
        .all([stateKey.targetKeyArn, secretsKey.arn])
        .apply(([stateKeyArn, secretsKeyArn]) => json(deployBoundaryPolicy({ stateKeyArn, secretsKeyArn, boundaryArn }))),
    },
    opts,
  );

  const deployRole = new aws.iam.Role(
    "github-deploy",
    {
      name: NAMES.deployRole,
      description: "GitHub Actions on JK369x/kubcode main: pulumi up for kubcode-* resources",
      assumeRolePolicy: oidc.arn.apply((arn) => json(githubTrustPolicy(arn, GITHUB_SUBJECTS.deploy))),
      permissionsBoundary: boundary.arn,
      maxSessionDuration: 3600,
    },
    opts,
  );
  new aws.iam.RolePolicy(
    "github-deploy-policy",
    {
      name: NAMES.deployRole,
      role: deployRole.name,
      policy: stateKey.targetKeyArn.apply((stateKeyArn) => json(deployPolicy({ stateKeyArn, boundaryArn }))),
    },
    opts,
  );

  const previewRole = new aws.iam.Role(
    "github-preview",
    {
      name: NAMES.previewRole,
      description: "GitHub Actions on JK369x/kubcode pull requests: read-only pulumi preview",
      assumeRolePolicy: oidc.arn.apply((arn) => json(githubTrustPolicy(arn, GITHUB_SUBJECTS.preview))),
      permissionsBoundary: boundary.arn,
      maxSessionDuration: 3600,
    },
    opts,
  );
  new aws.iam.RolePolicy(
    "github-preview-policy",
    {
      name: NAMES.previewRole,
      role: previewRole.name,
      policy: stateKey.targetKeyArn.apply((stateKeyArn) => json(previewPolicy({ stateKeyArn }))),
    },
    opts,
  );

  new aws.kms.KeyPolicy(
    "secrets-key-policy",
    {
      keyId: secretsKey.keyId,
      policy: pulumi
        .all([deployRole.arn, previewRole.arn, pulumi.all(cfg.secretsKeyUserArns)])
        .apply(([deployArn, previewArn, userArns]) =>
          json(
            secretsKeyPolicy({
              adminArns: [deployArn, ...cfg.breakGlassAdminArns],
              readerArns: [previewArn],
              userArns,
            }),
          ),
        ),
    },
    opts,
  );

  // --- Media bucket: private, SSE-KMS (AWS-managed aws/s3 key with a bucket
  // key, so presigned uploads need no access to the BYOK secrets key),
  // versioning off, browser uploads from kubcode.dev only.
  const media = new aws.s3.Bucket("media", { bucket: NAMES.mediaBucket }, opts);
  const publicAccess = new aws.s3.BucketPublicAccessBlock(
    "media-public-access",
    { bucket: media.id, blockPublicAcls: true, blockPublicPolicy: true, ignorePublicAcls: true, restrictPublicBuckets: true },
    opts,
  );
  new aws.s3.BucketOwnershipControls("media-ownership", { bucket: media.id, rule: { objectOwnership: "BucketOwnerEnforced" } }, opts);
  new aws.s3.BucketServerSideEncryptionConfiguration(
    "media-sse",
    { bucket: media.id, rules: [{ applyServerSideEncryptionByDefault: { sseAlgorithm: "aws:kms" }, bucketKeyEnabled: true }] },
    opts,
  );
  new aws.s3.BucketLifecycleConfiguration(
    "media-lifecycle",
    {
      bucket: media.id,
      rules: [
        {
          id: "abort-incomplete-multipart",
          status: "Enabled",
          filter: {},
          abortIncompleteMultipartUpload: { daysAfterInitiation: 7 },
        },
      ],
    },
    opts,
  );
  new aws.s3.BucketCorsConfiguration(
    "media-cors",
    {
      bucket: media.id,
      corsRules: [
        {
          allowedOrigins: [MEDIA_CORS_ORIGIN],
          allowedMethods: ["PUT", "POST", "GET"],
          allowedHeaders: ["*"],
          // Multipart uploads read each part's ETag in the browser.
          exposeHeaders: ["ETag"],
          maxAgeSeconds: 3000,
        },
      ],
    },
    opts,
  );
  new aws.s3.BucketPolicy(
    "media-tls-only",
    {
      bucket: media.id,
      policy: media.arn.apply((arn) =>
        json({
          Version: "2012-10-17",
          Statement: [
            {
              Sid: "DenyInsecureTransport",
              Effect: "Deny",
              Principal: "*",
              Action: "s3:*",
              Resource: [arn, `${arn}/*`],
              Condition: { Bool: { "aws:SecureTransport": "false" } },
            },
          ],
        }),
      ),
    },
    // The public access block must exist before any bucket policy is set.
    { ...opts, dependsOn: [publicAccess] },
  );

  // --- Monthly cost alert on everything tagged project=kubcode. The tag must
  // also be activated as a cost allocation tag (scripts/bootstrap.sh cost-tag).
  if (cfg.budgetEmail) {
    const subscribers = [cfg.budgetEmail];
    new aws.budgets.Budget(
      "monthly",
      {
        name: NAMES.budget,
        budgetType: "COST",
        timeUnit: "MONTHLY",
        limitAmount: "5",
        limitUnit: "USD",
        costFilters: [{ name: "TagKeyValue", values: ["user:project$kubcode"] }],
        notifications: [
          { comparisonOperator: "GREATER_THAN", notificationType: "ACTUAL", threshold: 80, thresholdType: "PERCENTAGE", subscriberEmailAddresses: subscribers },
          { comparisonOperator: "GREATER_THAN", notificationType: "FORECASTED", threshold: 100, thresholdType: "PERCENTAGE", subscriberEmailAddresses: subscribers },
        ],
      },
      opts,
    );
  }

  return {
    mediaBucket: media.bucket,
    secretsKeyArn: secretsKey.arn,
    secretsKeyAlias: pulumi.output(NAMES.secretsKeyAlias),
    deployRoleArn: deployRole.arn,
    previewRoleArn: previewRole.arn,
    boundaryPolicyArn: boundary.arn,
  };
}
