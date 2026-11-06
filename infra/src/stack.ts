// The kubcode `prod` stack: media bucket, BYOK secrets key, GitHub deploy and
// preview roles (via the existing, shared GitHub OIDC provider), the budget and
// the skill package downloads (package objects, plus the presign Lambda once
// its secret key is set; see docs/adr/0002-skill-package-downloads.md).
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
  OAUTH_CONNECT_BINARY,
  PACKAGES,
  PACKAGE_LOG_RETENTION_DAYS,
  PACKAGE_SIGNER_BINARY,
  PROJECT_TAG,
  REGION,
  packageObjectKey,
  packageSourceDir,
  validatePackageSignerKey,
} from "./constants";
import {
  deployBoundaryPolicy,
  deployPolicy,
  githubTrustPolicy,
  lambdaTrustPolicy,
  oauthConnectPolicy,
  packageSignerPolicy,
  previewPolicy,
  secretsKeyPolicy,
  wrapKeyPolicy,
} from "./policies";

export type StackConfig = {
  /** Budget alert recipient (a stack secret); the budget is skipped until the owner sets one. */
  budgetEmail?: pulumi.Input<string>;
  /** Humans who can administer the secrets key outside CI (lockout safety). */
  breakGlassAdminArns: string[];
  /**
   * HMAC key shared with the web host (a stack secret). The package signer
   * Lambda, its role, log group and URL are created only once it is set.
   */
  packageSignerKey?: pulumi.Input<string>;
  /** Roles allowed to encrypt/decrypt with alias/kubcode-secrets (the Lambda roles). */
  secretsKeyUserArns: pulumi.Input<string>[];
  /** kubcode-lambda-* roles allowed to Decrypt with alias/kubcode-secrets-wrap (step 5). */
  wrapKeyDecryptArns: pulumi.Input<string>[];
  /** Deploy the OAuth connect Lambda (kubcode:oauthConnect). Its role joins both key policies. */
  oauthConnect: boolean;
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

  // --- Wrap key for per-user secrets (docs/design/settings-keys.md §1): the
  // web host seals DEKs with its committed public key; only the Lambdas
  // unwrap. Asymmetric keys cannot rotate; rotation is a new key (design §6).
  // kms:CreateKey is not allowed for CI, so an admin creates it (README).
  const wrapKey = new aws.kms.Key(
    "secrets-wrap-key",
    {
      description: "kubcode-secrets-wrap: RSA public key wraps per-secret DEKs; Lambda-only Decrypt",
      customerMasterKeySpec: "RSA_4096",
      keyUsage: "ENCRYPT_DECRYPT",
      deletionWindowInDays: 30,
    },
    // Losing this key loses every stored user secret and token.
    { ...opts, protect: true },
  );
  new aws.kms.Alias("secrets-wrap-key-alias", { name: NAMES.wrapKeyAlias, targetKeyId: wrapKey.keyId }, opts);

  // --- Permissions boundary shared by every kubcode-* role.
  const boundaryArn = `arn:aws:iam::${ACCOUNT_ID}:policy/${NAMES.deployBoundary}`;
  const boundary = new aws.iam.Policy(
    "deploy-boundary",
    {
      name: NAMES.deployBoundary,
      description: "Ceiling for every kubcode-* role; only an admin can change it (CI is denied)",
      policy: pulumi
        .all([stateKey.targetKeyArn, secretsKey.arn, wrapKey.arn])
        .apply(([stateKeyArn, secretsKeyArn, wrapKeyArn]) =>
          json(deployBoundaryPolicy({ stateKeyArn, secretsKeyArn, wrapKeyArn, boundaryArn })),
        ),
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

  // --- OAuth connect Lambda role (docs/design/settings-keys.md §2). Created
  // before the key policies, which name it: KMS rejects a policy naming a
  // role that does not exist.
  const connectTags = { service: "oauth-connect" };
  const connectRole = cfg.oauthConnect
    ? new aws.iam.Role(
        "oauth-connect-role",
        {
          name: NAMES.oauthConnectRole,
          description: "kubcode-oauth-connect Lambda: OAuth code exchange, token sealing and revoke",
          assumeRolePolicy: json(lambdaTrustPolicy()),
          permissionsBoundary: boundary.arn,
          tags: connectTags,
        },
        opts,
      )
    : undefined;
  const secretsKeyUsers = [...cfg.secretsKeyUserArns, ...(connectRole ? [connectRole.arn] : [])];
  const wrapKeyDecrypters = [...cfg.wrapKeyDecryptArns, ...(connectRole ? [connectRole.arn] : [])];

  new aws.kms.KeyPolicy(
    "secrets-key-policy",
    {
      keyId: secretsKey.keyId,
      policy: pulumi
        .all([deployRole.arn, previewRole.arn, pulumi.all(secretsKeyUsers)])
        .apply(([deployArn, previewArn, userArns]) =>
          json(
            secretsKeyPolicy({
              adminArns: [deployArn, ...cfg.breakGlassAdminArns],
              readerArns: [previewArn],
              userArns,
              // The admin sets the step-5 SSM SecureStrings with this key.
              ssmWriterArns: cfg.breakGlassAdminArns,
            }),
          ),
        ),
    },
    opts,
  );

  new aws.kms.KeyPolicy(
    "secrets-wrap-key-policy",
    {
      keyId: wrapKey.keyId,
      policy: pulumi
        .all([deployRole.arn, previewRole.arn, pulumi.all(wrapKeyDecrypters)])
        .apply(([deployArn, previewArn, decryptArns]) =>
          json(wrapKeyPolicy({ adminArns: [deployArn, ...cfg.breakGlassAdminArns], readerArns: [previewArn], decryptArns })),
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

  // --- Skill package objects: zipped from packages/<slug>/<version>/ and stored
  // with SSE-S3 (not the bucket's SSE-KMS default) so the signer role needs no
  // KMS access. Independent of the signer secret.
  for (const pkg of PACKAGES) {
    new aws.s3.BucketObjectv2(
      `package-${pkg.slug}-${pkg.version}`,
      {
        bucket: media.bucket,
        key: packageObjectKey(pkg),
        source: new pulumi.asset.FileArchive(packageSourceDir(pkg)),
        serverSideEncryption: "AES256",
        contentType: "application/zip",
        tags: { kind: "skill-package", package: pkg.slug, version: pkg.version },
      },
      opts,
    );
  }

  // --- Package signer Lambda: presigns 60-second S3 GET URLs for the web app,
  // which holds no AWS credentials. The HMAC in the request is its only auth.
  let packageSignerUrl: pulumi.Output<string> | undefined;
  if (cfg.packageSignerKey) {
    const tags = { service: "package-signer" };
    const signerKey = pulumi.output(cfg.packageSignerKey).apply(validatePackageSignerKey);

    const role = new aws.iam.Role(
      "package-signer-role",
      {
        name: NAMES.packageSignerRole,
        description: "kubcode-package-signer Lambda: read packages/* in the media bucket and write its own logs",
        assumeRolePolicy: json(lambdaTrustPolicy()),
        permissionsBoundary: boundary.arn,
        tags,
      },
      opts,
    );
    const rolePolicy = new aws.iam.RolePolicy(
      "package-signer-policy",
      {
        name: NAMES.packageSignerRole,
        role: role.name,
        policy: media.bucket.apply((bucket) => json(packageSignerPolicy({ bucket, logGroupName: NAMES.packageSignerLogGroup }))),
      },
      opts,
    );

    // Created here so retention is set from the first invocation (Lambda
    // would otherwise auto-create it with no expiry).
    const logGroup = new aws.cloudwatch.LogGroup(
      "package-signer-logs",
      { name: NAMES.packageSignerLogGroup, retentionInDays: PACKAGE_LOG_RETENTION_DAYS, tags },
      opts,
    );

    const fn = new aws.lambda.Function(
      "package-signer",
      {
        name: NAMES.packageSignerFunction,
        description: "Presigns 60-second S3 GET URLs for skill packages (HMAC-authenticated)",
        role: role.arn,
        runtime: "provided.al2023",
        architectures: ["x86_64"],
        handler: "bootstrap",
        memorySize: 128,
        timeout: 5,
        code: new pulumi.asset.FileArchive(PACKAGE_SIGNER_BINARY),
        environment: {
          variables: {
            KUBCODE_PACKAGE_BUCKET: media.bucket,
            KUBCODE_PACKAGE_SIGNER_KEY: signerKey,
          },
        },
        tags,
      },
      // The inline policy and log group must exist before the first invocation.
      { ...opts, dependsOn: [rolePolicy, logGroup] },
    );

    const url = new aws.lambda.FunctionUrl(
      "package-signer-url",
      { functionName: fn.name, authorizationType: "NONE" },
      opts,
    );
    // A public (auth NONE) URL needs both statements in the function's resource policy.
    new aws.lambda.Permission(
      "package-signer-url-access",
      { function: fn.name, action: "lambda:InvokeFunctionUrl", principal: "*", functionUrlAuthType: "NONE" },
      opts,
    );
    new aws.lambda.Permission(
      "package-signer-url-invoke",
      { function: fn.name, action: "lambda:InvokeFunction", principal: "*", invokedViaFunctionUrl: true },
      opts,
    );
    packageSignerUrl = url.functionUrl;
  }

  // --- OAuth connect Lambda: secrets come from SSM at cold start (never env),
  // the Function URL's only auth is the HMAC shared with the web host.
  let oauthConnectUrl: pulumi.Output<string> | undefined;
  if (connectRole) {
    const rolePolicy = new aws.iam.RolePolicy(
      "oauth-connect-policy",
      { name: NAMES.oauthConnectRole, role: connectRole.name, policy: json(oauthConnectPolicy({ logGroupName: NAMES.oauthConnectLogGroup })) },
      opts,
    );
    const logGroup = new aws.cloudwatch.LogGroup(
      "oauth-connect-logs",
      { name: NAMES.oauthConnectLogGroup, retentionInDays: PACKAGE_LOG_RETENTION_DAYS, tags: connectTags },
      opts,
    );
    const fn = new aws.lambda.Function(
      "oauth-connect",
      {
        name: NAMES.oauthConnectFunction,
        description: "OAuth connect for YouTube/Instagram: code exchange, token sealing, revoke (HMAC-authenticated)",
        role: connectRole.arn,
        runtime: "provided.al2023",
        architectures: ["x86_64"],
        handler: "bootstrap",
        memorySize: 256,
        // Provider calls (token, channel/profile) plus the DB, cold start included.
        timeout: 20,
        code: new pulumi.asset.FileArchive(OAUTH_CONNECT_BINARY),
        tags: connectTags,
      },
      { ...opts, dependsOn: [rolePolicy, logGroup] },
    );
    const url = new aws.lambda.FunctionUrl("oauth-connect-url", { functionName: fn.name, authorizationType: "NONE" }, opts);
    new aws.lambda.Permission(
      "oauth-connect-url-access",
      { function: fn.name, action: "lambda:InvokeFunctionUrl", principal: "*", functionUrlAuthType: "NONE" },
      opts,
    );
    new aws.lambda.Permission(
      "oauth-connect-url-invoke",
      { function: fn.name, action: "lambda:InvokeFunction", principal: "*", invokedViaFunctionUrl: true },
      opts,
    );
    oauthConnectUrl = url.functionUrl;
  }

  return {
    mediaBucket: media.bucket,
    secretsKeyArn: secretsKey.arn,
    secretsKeyAlias: pulumi.output(NAMES.secretsKeyAlias),
    wrapKeyArn: wrapKey.arn,
    wrapKeyAlias: pulumi.output(NAMES.wrapKeyAlias),
    deployRoleArn: deployRole.arn,
    previewRoleArn: previewRole.arn,
    boundaryPolicyArn: boundary.arn,
    packageSignerUrl,
    oauthConnectUrl,
  };
}
