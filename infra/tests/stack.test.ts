// Stack shape tests with Pulumi mocks: naming, tags/provider, the media bucket
// settings, and that the shared GitHub OIDC provider is only looked up.
import test from "node:test";
import assert from "node:assert/strict";
import * as pulumi from "@pulumi/pulumi";
import fs from "node:fs";
import path from "node:path";
import {
  ACCOUNT_ID,
  GITHUB_OIDC_PROVIDER_ARN,
  NAMES,
  PACKAGES,
  RETAINED_PACKAGES,
  PACKAGE_SIGNER_BINARY,
  PUBLISHING_PARAMETERS,
  REGION,
  packageObjectKey,
  packageSourceDir,
  validatePackageSignerKey,
} from "../src/constants";
import { lambdaTrustPolicy, oauthConnectPolicy, packageSignerPolicy, publishingPolicy } from "../src/policies";

type Recorded = { type: string; name: string; inputs: any; provider?: string };
let resources: Recorded[] = [];
let invokes: { token: string; inputs: any }[] = [];

pulumi.runtime.setMocks(
  {
    newResource(args) {
      resources.push({ type: args.type, name: args.name, inputs: args.inputs, provider: args.provider });
      const physical = args.inputs.name ?? args.inputs.bucket ?? args.name;
      const arn =
        args.type === "aws:iam/role:Role"
          ? `arn:aws:iam::${ACCOUNT_ID}:role/${physical}`
          : args.type === "aws:iam/policy:Policy"
            ? `arn:aws:iam::${ACCOUNT_ID}:policy/${physical}`
            : args.type === "aws:kms/key:Key"
              ? `arn:aws:kms:${REGION}:${ACCOUNT_ID}:key/${args.name}-id`
              : `arn:mock:${args.type}:${physical}`;
      const extra = args.type === "aws:lambda/functionUrl:FunctionUrl" ? { functionUrl: "https://abc123.lambda-url.ap-southeast-1.on.aws/" } : {};
      return { id: `${physical}-id`, state: { ...args.inputs, arn, keyId: `${args.name}-id`, ...extra } };
    },
    call(args) {
      invokes.push({ token: args.token, inputs: args.inputs });
      if (args.token === "aws:kms/getAlias:getAlias")
        return { name: args.inputs.name, targetKeyArn: `arn:aws:kms:${REGION}:${ACCOUNT_ID}:key/state-key-id` };
      if (args.token === "aws:iam/getOpenIdConnectProvider:getOpenIdConnectProvider")
        return { arn: args.inputs.arn, url: "token.actions.githubusercontent.com" };
      return {};
    },
  },
  "kubcode-infra",
  "prod",
  true,
);

// Record asset constructor arguments: the Pulumi mock serializes assets lossily.
type AssetCall = { kind: string; path?: string; entries?: string[] };
let assetCalls: AssetCall[] = [];
const assetNs = pulumi.asset as any;
for (const kind of ["FileAsset", "FileArchive"] as const) {
  const Orig = assetNs[kind];
  assetNs[kind] = class extends Orig {
    constructor(path: string) {
      super(path);
      assetCalls.push({ kind, path });
    }
  };
}
{
  const Orig = assetNs.AssetArchive;
  assetNs.AssetArchive = class extends Orig {
    constructor(assets: Record<string, unknown>) {
      super(assets);
      assetCalls.push({ kind: "AssetArchive", entries: Object.keys(assets) });
    }
  };
}
// The runtime also re-creates assets when it deserializes mock results, so match by content.
const seen = (call: AssetCall) => assetCalls.some((c) => JSON.stringify(c) === JSON.stringify(call));

const SIGNER_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const settle = (o: pulumi.Output<unknown>) => new Promise((resolve) => o.apply(resolve));

async function build(
  opts: {
    budgetEmail?: pulumi.Input<string>;
    secretsKeyUserArns?: pulumi.Input<string>[];
    wrapKeyDecryptArns?: pulumi.Input<string>[];
    packageSignerKey?: pulumi.Input<string>;
    oauthConnect?: boolean;
    publishing?: boolean;
  } = {},
) {
  resources = [];
  invokes = [];
  assetCalls = [];
  const { createStack } = await import("../src/stack");
  const out = createStack({
    budgetEmail: opts.budgetEmail,
    breakGlassAdminArns: [`arn:aws:iam::${ACCOUNT_ID}:user/super_admin`],
    secretsKeyUserArns: opts.secretsKeyUserArns ?? [],
    wrapKeyDecryptArns: opts.wrapKeyDecryptArns ?? [],
    packageSignerKey: opts.packageSignerKey,
    oauthConnect: opts.oauthConnect ?? false,
    publishing: opts.publishing ?? false,
  });
  await Promise.all(Object.values(out).map((o) => settle(pulumi.output(o))));
  // Let dependent resources (policies built from other outputs) register.
  for (let i = 0; i < 20; i++) await new Promise((r) => setImmediate(r));
  return out;
}

const byType = (type: string) => resources.filter((r) => r.type === type);
const one = (type: string) => {
  const list = byType(type);
  assert.equal(list.length, 1, `expected one ${type}, got ${list.length}`);
  return list[0];
};

test("one explicit AWS provider: pinned account, region and project=kubcode default tags", async () => {
  await build({ budgetEmail: "owner@example.com" });
  const provider = one("pulumi:providers:aws");
  assert.equal(provider.inputs.region, REGION);
  assert.deepEqual(JSON.parse(provider.inputs.allowedAccountIds), [ACCOUNT_ID]);
  assert.deepEqual(JSON.parse(provider.inputs.defaultTags), { tags: { project: "kubcode" } });
  for (const r of resources.filter((r) => r.type.startsWith("aws:"))) {
    assert.ok(r.provider?.includes("pulumi:providers:aws"), `${r.type} ${r.name} must use the explicit provider`);
  }
});

test("every named resource is kubcode-*", async () => {
  await build({ budgetEmail: "owner@example.com", packageSignerKey: SIGNER_KEY });
  const named = resources.filter((r) => r.type.startsWith("aws:"));
  assert.ok(named.length >= 8);
  for (const r of named) {
    const physical = r.inputs.name ?? r.inputs.bucket ?? r.inputs.role;
    if (physical === undefined) continue; // sub-resources keyed by bucket/role are checked through those
    assert.match(String(physical), /^(alias\/|\/aws\/lambda\/)?kubcode-/, `${r.type} ${r.name} => ${physical}`);
    assert.doesNotMatch(String(physical), /igtest/);
  }
});

test("the shared GitHub OIDC provider is looked up, never created or imported", async () => {
  await build();
  assert.equal(byType("aws:iam/openIdConnectProvider:OpenIdConnectProvider").length, 0);
  const lookup = invokes.find((i) => i.token === "aws:iam/getOpenIdConnectProvider:getOpenIdConnectProvider");
  assert.equal(lookup?.inputs.arn, GITHUB_OIDC_PROVIDER_ARN);
});

test("deploy and preview roles carry the boundary and trust only their GitHub subjects", async () => {
  await build();
  const roles = byType("aws:iam/role:Role");
  const names = roles.map((r) => r.inputs.name).sort();
  assert.deepEqual(names, [NAMES.deployRole, NAMES.previewRole].sort());
  const boundary = `arn:aws:iam::${ACCOUNT_ID}:policy/${NAMES.deployBoundary}`;
  for (const r of roles) assert.equal(r.inputs.permissionsBoundary, boundary);
  const sub = (name: string) =>
    JSON.parse(roles.find((r) => r.inputs.name === name)!.inputs.assumeRolePolicy).Statement[0].Condition.StringEquals[
      "token.actions.githubusercontent.com:sub"
    ];
  assert.deepEqual(sub(NAMES.deployRole), ["repo:JK369x@104179568/kubcode@1444458364:ref:refs/heads/main"]);
  assert.deepEqual(sub(NAMES.previewRole), ["repo:JK369x@104179568/kubcode@1444458364:pull_request"]);
});

test("media bucket: private, SSE-KMS, no versioning, multipart cleanup, kubcode.dev CORS", async () => {
  await build();
  const bucket = one("aws:s3/bucket:Bucket");
  assert.equal(bucket.inputs.bucket, NAMES.mediaBucket);
  assert.notEqual(bucket.inputs.forceDestroy, true);

  const pab = one("aws:s3/bucketPublicAccessBlock:BucketPublicAccessBlock").inputs;
  for (const k of ["blockPublicAcls", "blockPublicPolicy", "ignorePublicAcls", "restrictPublicBuckets"]) assert.equal(pab[k], true, k);

  const sse = one("aws:s3/bucketServerSideEncryptionConfiguration:BucketServerSideEncryptionConfiguration").inputs;
  assert.equal(sse.rules[0].applyServerSideEncryptionByDefault.sseAlgorithm, "aws:kms");
  assert.equal(sse.rules[0].bucketKeyEnabled, true);

  assert.equal(byType("aws:s3/bucketVersioning:BucketVersioning").length, 0, "versioning stays off");

  const lifecycle = one("aws:s3/bucketLifecycleConfiguration:BucketLifecycleConfiguration").inputs;
  assert.equal(lifecycle.rules[0].abortIncompleteMultipartUpload.daysAfterInitiation, 7);
  assert.equal(lifecycle.rules[0].status, "Enabled");

  const cors = one("aws:s3/bucketCorsConfiguration:BucketCorsConfiguration").inputs.corsRules[0];
  assert.deepEqual(cors.allowedOrigins, ["https://kubcode.dev"]);
  assert.deepEqual([...cors.allowedMethods].sort(), ["GET", "POST", "PUT"]);
  assert.ok(cors.exposeHeaders.includes("ETag"), "multipart uploads need the ETag header");

  const owner = one("aws:s3/bucketOwnershipControls:BucketOwnershipControls").inputs;
  assert.equal(owner.rule.objectOwnership, "BucketOwnerEnforced");

  const policy = JSON.parse(one("aws:s3/bucketPolicy:BucketPolicy").inputs.policy);
  assert.ok(policy.Statement.some((s: any) => s.Effect === "Deny" && s.Condition?.Bool?.["aws:SecureTransport"] === "false"));
});

const named = (type: string, name: string) => {
  const r = byType(type).find((r) => r.name === name);
  assert.ok(r, `expected ${type} ${name}`);
  return r;
};

test("secrets key: rotation on, aliased, policy hook for Lambda roles", async () => {
  const lambda = `arn:aws:iam::${ACCOUNT_ID}:role/kubcode-publisher`;
  await build({ secretsKeyUserArns: [lambda] });
  const key = named("aws:kms/key:Key", "secrets-key").inputs;
  assert.equal(key.enableKeyRotation, true);
  assert.equal(key.deletionWindowInDays, 30);
  // The key policy is a separate resource so the boundary can name the key ARN
  // without a dependency cycle (key -> boundary -> roles -> key policy).
  const keyPolicy = named("aws:kms/keyPolicy:KeyPolicy", "secrets-key-policy").inputs;
  const policy = JSON.parse(keyPolicy.policy);
  assert.deepEqual(policy.Statement.find((s: any) => s.Sid === "KeyUse").Principal.AWS, [lambda]);
  assert.deepEqual(policy.Statement.find((s: any) => s.Sid === "KeyAdministration").Principal.AWS, [
    `arn:aws:iam::${ACCOUNT_ID}:role/${NAMES.deployRole}`,
    `arn:aws:iam::${ACCOUNT_ID}:user/super_admin`,
  ]);
  const boundary = JSON.parse(byType("aws:iam/policy:Policy").find((p) => p.inputs.name === NAMES.deployBoundary)!.inputs.policy);
  const ceiling = boundary.Statement.find((s: any) => s.Sid === "KubcodeKeysCeiling");
  assert.ok(ceiling.Resource.includes(`arn:aws:kms:${REGION}:${ACCOUNT_ID}:key/secrets-key-id`));
  const alias = named("aws:kms/alias:Alias", "secrets-key-alias").inputs;
  assert.equal(alias.name, NAMES.secretsKeyAlias);
});

test("budget: $5 monthly on project=kubcode, only when an email is configured", async () => {
  await build();
  assert.equal(byType("aws:budgets/budget:Budget").length, 0);

  await build({ budgetEmail: "owner@example.com" });
  const b = one("aws:budgets/budget:Budget").inputs;
  assert.equal(b.name, NAMES.budget);
  assert.equal(b.budgetType, "COST");
  assert.equal(b.timeUnit, "MONTHLY");
  assert.equal(Number(b.limitAmount), 5);
  assert.equal(b.limitUnit, "USD");
  assert.deepEqual(b.costFilters, [{ name: "TagKeyValue", values: ["user:project$kubcode"] }]);
  assert.ok(b.notifications.length >= 1);
  for (const n of b.notifications) assert.deepEqual(n.subscriberEmailAddresses, ["owner@example.com"]);
});

test("budget email can be a stack secret (kept out of git as plaintext)", async () => {
  await build({ budgetEmail: pulumi.secret("owner@example.com") });
  const b = one("aws:budgets/budget:Budget").inputs;
  // Pulumi's wire format for a secret value: the whole notifications list is secret.
  const SECRET_SIG = "4dabf18193072939515e22adb298388d";
  assert.equal(b.notifications[SECRET_SIG], "1b47061264138c4ac30d75fd1eb44270", "notifications must be marked secret");
  for (const n of b.notifications.value) assert.deepEqual(n.subscriberEmailAddresses, ["owner@example.com"]);
});

// --- Skill package downloads (ADR 0002)

const BOUNDARY_ARN = `arn:aws:iam::${ACCOUNT_ID}:policy/${NAMES.deployBoundary}`;

test("package signer: nothing is created until the secret key is set (previews work before the owner sets it)", async () => {
  const out = await build();
  for (const t of ["aws:lambda/function:Function", "aws:lambda/functionUrl:FunctionUrl", "aws:lambda/permission:Permission", "aws:cloudwatch/logGroup:LogGroup"])
    assert.equal(byType(t).length, 0, t);
  assert.deepEqual(byType("aws:iam/role:Role").map((r) => r.inputs.name).sort(), [NAMES.deployRole, NAMES.previewRole].sort());
  assert.equal(await new Promise((r) => pulumi.output(out.packageSignerUrl).apply(r)), undefined);
});

test("package signer role: kubcode boundary, Lambda trust, exactly the signer inline policy", async () => {
  await build({ packageSignerKey: SIGNER_KEY });
  const role = byType("aws:iam/role:Role").find((r) => r.inputs.name === NAMES.packageSignerRole)!;
  assert.ok(role, "role exists");
  assert.equal(role.inputs.permissionsBoundary, BOUNDARY_ARN);
  assert.deepEqual(JSON.parse(role.inputs.assumeRolePolicy), lambdaTrustPolicy());
  const rp = byType("aws:iam/rolePolicy:RolePolicy").find((r) => r.inputs.name === NAMES.packageSignerRole)!;
  assert.ok(rp, "inline policy exists");
  assert.equal(rp.inputs.role, NAMES.packageSignerRole);
  assert.deepEqual(JSON.parse(rp.inputs.policy), packageSignerPolicy({ bucket: NAMES.mediaBucket, logGroupName: NAMES.packageSignerLogGroup }));
  // No managed policy attachments: the inline policy is the whole grant.
  assert.equal(byType("aws:iam/rolePolicyAttachment:RolePolicyAttachment").length, 0);
});

test("package signer log group: /aws/lambda/kubcode-package-signer, 14 days, tagged", async () => {
  await build({ packageSignerKey: SIGNER_KEY });
  const lg = one("aws:cloudwatch/logGroup:LogGroup").inputs;
  assert.equal(lg.name, "/aws/lambda/kubcode-package-signer");
  assert.equal(lg.name, NAMES.packageSignerLogGroup);
  assert.equal(lg.retentionInDays, 14);
  assert.equal(lg.tags.service, "package-signer");
});

test("package signer function: Rust custom runtime, small, env from the media bucket and the secret", async () => {
  await build({ packageSignerKey: SIGNER_KEY });
  const fn = one("aws:lambda/function:Function").inputs;
  assert.equal(fn.name, "kubcode-package-signer");
  assert.equal(fn.runtime, "provided.al2023");
  assert.deepEqual(fn.architectures, ["x86_64"]);
  assert.equal(fn.handler, "bootstrap");
  assert.equal(fn.memorySize, 128);
  assert.equal(fn.timeout, 5);
  assert.equal(fn.role, `arn:aws:iam::${ACCOUNT_ID}:role/${NAMES.packageSignerRole}`);
  assert.equal(fn.reservedConcurrentExecutions, undefined, "quota may be tiny: no reserved concurrency");
  assert.equal(fn.kmsKeyArn, undefined);
  assert.equal(fn.tags.service, "package-signer");
  // The log group exists first, so Lambda never auto-creates it with infinite retention.
  assert.deepEqual(fn.loggingConfig, undefined);
  // Code: the zip the build script makes, uploaded as-is so `bootstrap` keeps
  // its exec bit (the mock serializes assets lossily, so the constructor calls
  // are recorded instead).
  assert.ok(seen({ kind: "FileArchive", path: "../services/package-signer/dist/bootstrap.zip" }));
  assert.ok(!assetCalls.some((c) => c.kind === "AssetArchive" || c.kind === "FileAsset"), "no repacking of the binary");
  assert.equal(PACKAGE_SIGNER_BINARY, "../services/package-signer/dist/bootstrap.zip");
});

test("package signer env: bucket name plus the key, and the key stays a secret", async () => {
  await build({ packageSignerKey: pulumi.secret(SIGNER_KEY) });
  const env = one("aws:lambda/function:Function").inputs.environment;
  const SECRET_SIG = "4dabf18193072939515e22adb298388d";
  assert.equal(env[SECRET_SIG], "1b47061264138c4ac30d75fd1eb44270", "environment must be marked secret");
  assert.deepEqual(env.value.variables, { KUBCODE_PACKAGE_BUCKET: NAMES.mediaBucket, KUBCODE_PACKAGE_SIGNER_KEY: SIGNER_KEY });
});

test("package signer function URL: auth NONE (the HMAC is the auth), no CORS, permissions for the URL, output", async () => {
  const out = await build({ packageSignerKey: SIGNER_KEY });
  const url = one("aws:lambda/functionUrl:FunctionUrl").inputs;
  assert.equal(url.authorizationType, "NONE");
  assert.equal(url.cors, undefined, "server-to-server: no CORS");
  assert.equal(url.functionName, "kubcode-package-signer");
  // Since Oct 2025 a public URL needs both resource-policy statements.
  const perms = byType("aws:lambda/permission:Permission").map((p) => p.inputs);
  assert.equal(perms.length, 2);
  const urlPerm = perms.find((p) => p.action === "lambda:InvokeFunctionUrl")!;
  assert.equal(urlPerm.principal, "*");
  assert.equal(urlPerm.functionUrlAuthType, "NONE");
  const invokePerm = perms.find((p) => p.action === "lambda:InvokeFunction")!;
  assert.equal(invokePerm.principal, "*");
  assert.equal(invokePerm.invokedViaFunctionUrl, true);
  for (const p of perms) assert.equal(p.function, "kubcode-package-signer");
  assert.equal(await new Promise((r) => pulumi.output(out.packageSignerUrl).apply(r)), "https://abc123.lambda-url.ap-southeast-1.on.aws/");
});

test("package signer key must be at least 32 bytes (the Lambda rejects shorter keys)", () => {
  assert.equal(validatePackageSignerKey(SIGNER_KEY), SIGNER_KEY);
  assert.throws(() => validatePackageSignerKey("short"), /32/);
  assert.throws(() => validatePackageSignerKey(""), /32/);
});

test("package objects: packages/<slug>/<version>.zip, SSE-S3, zipped from the package directory", async () => {
  await build();
  const objects = byType("aws:s3/bucketObjectv2:BucketObjectv2");
  assert.equal(objects.length, PACKAGES.length + RETAINED_PACKAGES.length);
  const o = objects[0].inputs;
  assert.equal(o.bucket, NAMES.mediaBucket);
  assert.equal(o.key, "packages/freshstack-what-if/0.2.0.zip");
  assert.equal(o.serverSideEncryption, "AES256");
  assert.equal(o.contentType, "application/zip");
  assert.equal(o.tags.package, "freshstack-what-if");
  assert.equal(o.tags.version, "0.2.0");
  assert.ok(seen({ kind: "FileArchive", path: "../packages/freshstack-what-if/0.2.0" }));
  // The superseded 0.1.0 object is kept (same resource name), so the release is not a delete.
  assert.ok(objects.some((x) => x.name === "package-freshstack-what-if-0.1.0" && x.inputs.key === "packages/freshstack-what-if/0.1.0.zip"));
  // Members-only kits are uploaded by the owner, never by this stack.
  assert.ok(!objects.some((x) => String(x.inputs.key).includes("deep-sea-docs")));
  assert.ok(!assetCalls.some((c) => c.kind === "FileAsset"), "no signer binary without the secret");
});

test("package list: key format matches the signer contract, directories exist, denylisted skills absent", () => {
  assert.ok(PACKAGES.length >= 1);
  const keys = [...PACKAGES, ...RETAINED_PACKAGES].map(packageObjectKey);
  assert.equal(new Set(keys).size, keys.length, "no duplicates");
  for (const p of [...PACKAGES, ...RETAINED_PACKAGES]) {
    // Same pattern the Lambda enforces (docs/design/package-signer.md).
    assert.match(packageObjectKey(p), /^packages\/[a-z0-9]+(-[a-z0-9]+)*\/[0-9]+\.[0-9]+\.[0-9]+\.zip$/);
    const dir = path.resolve(__dirname, "..", packageSourceDir(p));
    assert.ok(fs.statSync(dir).isDirectory(), `${dir} must exist`);
    assert.ok(fs.existsSync(path.join(dir, "LICENSE")), `${p.slug} ships a LICENSE`);
  }
  const slugs = PACKAGES.map((p) => p.slug);
  for (const never of ["growkaz-stickman", "thai-survival"]) assert.ok(!slugs.includes(never), `${never} must never be downloadable`);
  assert.ok(!keys.some((k) => /growkaz|thai-survival/.test(k)));
});

test("package objects do not depend on the signer secret", async () => {
  await build();
  assert.equal(byType("aws:s3/bucketObjectv2:BucketObjectv2").length, PACKAGES.length + RETAINED_PACKAGES.length);
  await build({ packageSignerKey: SIGNER_KEY });
  assert.equal(byType("aws:s3/bucketObjectv2:BucketObjectv2").length, PACKAGES.length + RETAINED_PACKAGES.length);
});

test("wrap key: RSA_4096 for encryption, no rotation (asymmetric), 30-day deletion window, aliased", async () => {
  await build();
  const key = named("aws:kms/key:Key", "secrets-wrap-key").inputs;
  assert.equal(key.customerMasterKeySpec, "RSA_4096");
  assert.equal(key.keyUsage, "ENCRYPT_DECRYPT");
  assert.notEqual(key.enableKeyRotation, true, "asymmetric keys cannot rotate");
  assert.equal(key.deletionWindowInDays, 30);
  const alias = byType("aws:kms/alias:Alias").find((a) => a.inputs.name === NAMES.wrapKeyAlias);
  assert.ok(alias, "alias/kubcode-secrets-wrap");
  assert.equal(NAMES.wrapKeyAlias, "alias/kubcode-secrets-wrap");
});

test("wrap key policy: deploy + break-glass administer, preview reads the public key, no Decrypt yet", async () => {
  await build();
  const policy = JSON.parse(named("aws:kms/keyPolicy:KeyPolicy", "secrets-wrap-key-policy").inputs.policy);
  const sid = (id: string) => policy.Statement.find((s: any) => s.Sid === id);
  assert.deepEqual(sid("KeyAdministration").Principal.AWS, [
    `arn:aws:iam::${ACCOUNT_ID}:role/${NAMES.deployRole}`,
    `arn:aws:iam::${ACCOUNT_ID}:user/super_admin`,
  ]);
  assert.ok(sid("PublicKeyRead").Principal.AWS.includes(`arn:aws:iam::${ACCOUNT_ID}:role/${NAMES.previewRole}`));
  assert.equal(sid("KeyDecrypt"), undefined, "step 5 adds the Lambda roles");
  const boundary = JSON.parse(byType("aws:iam/policy:Policy").find((p) => p.inputs.name === NAMES.deployBoundary)!.inputs.policy);
  const wrapArn = `arn:aws:kms:${REGION}:${ACCOUNT_ID}:key/secrets-wrap-key-id`;
  assert.ok(boundary.Statement.find((s: any) => s.Sid === "KubcodeKeysCeiling").Resource.includes(wrapArn));
  assert.ok(boundary.Statement.some((s: any) => s.Effect === "Deny" && s.Resource === wrapArn));
});

test("wrap key policy hook: Decrypt for listed kubcode-lambda-* roles", async () => {
  const role = `arn:aws:iam::${ACCOUNT_ID}:role/kubcode-lambda-oauth-connect`;
  await build({ wrapKeyDecryptArns: [role] });
  const policy = JSON.parse(named("aws:kms/keyPolicy:KeyPolicy", "secrets-wrap-key-policy").inputs.policy);
  assert.deepEqual(policy.Statement.find((s: any) => s.Sid === "KeyDecrypt").Principal.AWS, [role]);
});

test("secrets key: the break-glass admin can write /kubcode/* SecureStrings; the deploy role cannot", async () => {
  await build();
  const policy = JSON.parse(named("aws:kms/keyPolicy:KeyPolicy", "secrets-key-policy").inputs.policy);
  const w = policy.Statement.find((s: any) => s.Sid === "SsmParameterWrite");
  assert.deepEqual(w.Principal.AWS, [`arn:aws:iam::${ACCOUNT_ID}:user/super_admin`]);
});

test("SSM parameters are not managed by the stack (values are set by the admin CLI only)", async () => {
  // A Pulumi-managed SecureString with ignoreChanges: [value] would re-send the
  // placeholder from state on any later update and overwrite the real secret.
  await build({ budgetEmail: "owner@example.com", packageSignerKey: SIGNER_KEY });
  assert.equal(byType("aws:ssm/parameter:Parameter").length, 0);
});

// --- OAuth connect Lambda (docs/design/settings-keys.md §2, §5)

const CONNECT_ROLE_ARN = `arn:aws:iam::${ACCOUNT_ID}:role/kubcode-lambda-oauth-connect`;
const byName = (type: string, name: string) => byType(type).find((r) => r.inputs.name === name);

test("oauth connect: off unless kubcode:oauthConnect is true", async () => {
  await build();
  assert.equal(byName("aws:iam/role:Role", NAMES.oauthConnectRole), undefined);
  assert.equal(byName("aws:lambda/function:Function", NAMES.oauthConnectFunction), undefined);
});

test("oauth connect role: kubcode-lambda-* name, boundary, Lambda trust, logs + exact SSM reads only", async () => {
  await build({ oauthConnect: true });
  assert.equal(NAMES.oauthConnectRole, "kubcode-lambda-oauth-connect");
  const role = byName("aws:iam/role:Role", NAMES.oauthConnectRole)!;
  assert.ok(role);
  assert.equal(role.inputs.permissionsBoundary, BOUNDARY_ARN);
  assert.deepEqual(JSON.parse(role.inputs.assumeRolePolicy), lambdaTrustPolicy());
  const rp = byName("aws:iam/rolePolicy:RolePolicy", NAMES.oauthConnectRole)!;
  assert.deepEqual(JSON.parse(rp.inputs.policy), oauthConnectPolicy({ logGroupName: NAMES.oauthConnectLogGroup }));
});

test("oauth connect function: Rust custom runtime, its own log group, URL with auth NONE (the HMAC is the auth)", async () => {
  const out = await build({ oauthConnect: true });
  const fn = byName("aws:lambda/function:Function", NAMES.oauthConnectFunction)!.inputs;
  assert.equal(fn.name, "kubcode-oauth-connect");
  assert.equal(fn.runtime, "provided.al2023");
  assert.deepEqual(fn.architectures, ["x86_64"]);
  assert.equal(fn.handler, "bootstrap");
  assert.equal(fn.timeout, 20);
  assert.equal(fn.role, CONNECT_ROLE_ARN);
  assert.equal(fn.environment, undefined, "no secrets in env: they are read from SSM");
  assert.ok(seen({ kind: "FileArchive", path: "../services/crates/kubcode-oauth-connect/dist/bootstrap.zip" }));
  const lg = byName("aws:cloudwatch/logGroup:LogGroup", NAMES.oauthConnectLogGroup)!.inputs;
  assert.equal(lg.retentionInDays, 14);
  const url = byType("aws:lambda/functionUrl:FunctionUrl").find((u) => u.inputs.functionName === "kubcode-oauth-connect")!.inputs;
  assert.equal(url.authorizationType, "NONE");
  assert.equal(url.cors, undefined);
  const perms = byType("aws:lambda/permission:Permission").filter((p) => p.inputs.function === "kubcode-oauth-connect");
  assert.deepEqual(perms.map((p) => p.inputs.action).sort(), ["lambda:InvokeFunction", "lambda:InvokeFunctionUrl"]);
  assert.equal(await new Promise((r) => pulumi.output(out.oauthConnectUrl).apply(r)), "https://abc123.lambda-url.ap-southeast-1.on.aws/");
});

test("oauth connect role may decrypt: wrap key (DEKs) and secrets key (its SSM SecureStrings)", async () => {
  await build({ oauthConnect: true });
  const wrap = JSON.parse(byType("aws:kms/keyPolicy:KeyPolicy").find((p) => p.name === "secrets-wrap-key-policy")!.inputs.policy);
  assert.deepEqual(wrap.Statement.find((s: any) => s.Sid === "KeyDecrypt").Principal.AWS, [CONNECT_ROLE_ARN]);
  const secrets = JSON.parse(byType("aws:kms/keyPolicy:KeyPolicy").find((p) => p.name === "secrets-key-policy")!.inputs.policy);
  assert.deepEqual(secrets.Statement.find((s: any) => s.Sid === "KeyUse").Principal.AWS, [CONNECT_ROLE_ARN]);
});

// --- Publishing Lambdas (docs/design/publishing-core.md §4)

const PUBLISHING_ROLE_ARN = `arn:aws:iam::${ACCOUNT_ID}:role/kubcode-lambda-publishing`;

test("publishing: off unless kubcode:publishing is true", async () => {
  await build();
  assert.equal(byName("aws:iam/role:Role", NAMES.publishingRole), undefined);
  assert.equal(byName("aws:lambda/function:Function", NAMES.publishingFunction), undefined);
  assert.equal(byName("aws:lambda/function:Function", NAMES.publishingOpsFunction), undefined);
});

test("publishing role: kubcode-lambda-* name, boundary, Lambda trust, logs + SSM + clips/* read only", async () => {
  await build({ publishing: true });
  const role = byName("aws:iam/role:Role", NAMES.publishingRole)!;
  assert.equal(role.inputs.permissionsBoundary, BOUNDARY_ARN);
  assert.deepEqual(JSON.parse(role.inputs.assumeRolePolicy), lambdaTrustPolicy());
  const rp = byName("aws:iam/rolePolicy:RolePolicy", NAMES.publishingRole)!;
  const policy = JSON.parse(rp.inputs.policy);
  assert.deepEqual(
    policy,
    publishingPolicy({ logGroupNames: [NAMES.publishingLogGroup, NAMES.publishingOpsLogGroup], bucket: NAMES.mediaBucket }),
  );
  const s3: any = policy.Statement.find((s: any) => s.Sid === "ReadClipMedia");
  assert.deepEqual(s3.Action, "s3:GetObject");
  assert.equal(s3.Resource, `arn:aws:s3:::kubcode-media-${ACCOUNT_ID}/clips/*`, "never packages/ or the whole bucket");
  const ssm: any = policy.Statement.find((s: any) => s.Sid === "ReadOwnParameters");
  assert.ok(ssm.Resource.every((r: string) => r.startsWith(`arn:aws:ssm:ap-southeast-1:${ACCOUNT_ID}:parameter/kubcode/prod/`)));
  assert.ok(!JSON.stringify(policy).includes("kms:"), "KMS only through the key policy");
});

test("publishing functions: one binary, two modes; only the url mode has a Function URL", async () => {
  const out = await build({ publishing: true });
  const url = byName("aws:lambda/function:Function", NAMES.publishingFunction)!.inputs;
  const ops = byName("aws:lambda/function:Function", NAMES.publishingOpsFunction)!.inputs;
  for (const fn of [url, ops]) {
    assert.equal(fn.runtime, "provided.al2023");
    assert.equal(fn.handler, "bootstrap");
    assert.equal(fn.role, PUBLISHING_ROLE_ARN);
    assert.equal(fn.timeout, 300);
    assert.equal(fn.environment.variables.KUBCODE_MEDIA_BUCKET, `kubcode-media-${ACCOUNT_ID}`);
    assert.deepEqual(Object.keys(fn.environment.variables).sort(), ["KUBCODE_MEDIA_BUCKET", "KUBCODE_PUBLISHING_MODE"], "no secrets in env");
  }
  assert.equal(url.environment.variables.KUBCODE_PUBLISHING_MODE, "url");
  assert.equal(ops.environment.variables.KUBCODE_PUBLISHING_MODE, "ops");
  assert.ok(seen({ kind: "FileArchive", path: "../services/crates/kubcode-publishing-lambda/dist/bootstrap.zip" }));
  const urls = byType("aws:lambda/functionUrl:FunctionUrl").filter((u) => String(u.inputs.functionName).startsWith("kubcode-publishing"));
  assert.deepEqual(urls.map((u) => u.inputs.functionName), ["kubcode-publishing"], "the ops function has no URL");
  assert.equal(urls[0].inputs.authorizationType, "NONE");
  const opsPerms = byType("aws:lambda/permission:Permission").filter((p) => p.inputs.function === "kubcode-publishing-ops");
  assert.equal(opsPerms.length, 0, "no resource policy: IAM is the only way in");
  for (const lg of [NAMES.publishingLogGroup, NAMES.publishingOpsLogGroup]) {
    assert.equal(byName("aws:cloudwatch/logGroup:LogGroup", lg)!.inputs.retentionInDays, 14);
  }
  assert.ok(await new Promise((r) => pulumi.output(out.publishingUrl).apply(r)));
});

test("publishing role: decrypt only through SSM and only its own parameters; not KeyUse, not the wrap key", async () => {
  await build({ oauthConnect: true, publishing: true });
  const secrets = JSON.parse(byType("aws:kms/keyPolicy:KeyPolicy").find((p) => p.name === "secrets-key-policy")!.inputs.policy);
  assert.deepEqual(secrets.Statement.find((s: any) => s.Sid === "KeyUse").Principal.AWS, [CONNECT_ROLE_ARN]);
  const read = secrets.Statement.find((s: any) => s.Sid === "SsmParameterRead");
  assert.deepEqual(read.Principal.AWS, [PUBLISHING_ROLE_ARN]);
  assert.equal(read.Action, "kms:Decrypt");
  assert.equal(read.Condition.StringEquals["kms:ViaService"], "ssm.ap-southeast-1.amazonaws.com");
  assert.deepEqual(
    read.Condition.StringEquals["kms:EncryptionContext:PARAMETER_ARN"],
    Object.values(PUBLISHING_PARAMETERS).map((n) => `arn:aws:ssm:ap-southeast-1:${ACCOUNT_ID}:parameter${n}`),
  );
  const wrap = JSON.parse(byType("aws:kms/keyPolicy:KeyPolicy").find((p) => p.name === "secrets-wrap-key-policy")!.inputs.policy);
  assert.deepEqual(wrap.Statement.find((s: any) => s.Sid === "KeyDecrypt").Principal.AWS, [CONNECT_ROLE_ARN]);
});
