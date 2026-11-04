// Stack shape tests with Pulumi mocks: naming, tags/provider, the media bucket
// settings, and that the shared GitHub OIDC provider is only looked up.
import test from "node:test";
import assert from "node:assert/strict";
import * as pulumi from "@pulumi/pulumi";
import { ACCOUNT_ID, GITHUB_OIDC_PROVIDER_ARN, NAMES, REGION } from "../src/constants";

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
      return { id: `${physical}-id`, state: { ...args.inputs, arn, keyId: `${args.name}-id` } };
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

const settle = (o: pulumi.Output<unknown>) => new Promise((resolve) => o.apply(resolve));

async function build(opts: { budgetEmail?: string; secretsKeyUserArns?: pulumi.Input<string>[] } = {}) {
  resources = [];
  invokes = [];
  const { createStack } = await import("../src/stack");
  const out = createStack({
    budgetEmail: opts.budgetEmail,
    breakGlassAdminArns: [`arn:aws:iam::${ACCOUNT_ID}:user/super_admin`],
    secretsKeyUserArns: opts.secretsKeyUserArns ?? [],
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
  await build({ budgetEmail: "owner@example.com" });
  const named = resources.filter((r) => r.type.startsWith("aws:"));
  assert.ok(named.length >= 8);
  for (const r of named) {
    const physical = r.inputs.name ?? r.inputs.bucket ?? r.inputs.role;
    if (physical === undefined) continue; // sub-resources keyed by bucket/role are checked through those
    assert.match(String(physical), /^(alias\/)?kubcode-/, `${r.type} ${r.name} => ${physical}`);
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
  assert.deepEqual(sub(NAMES.deployRole), ["repo:JK369x/kubcode:ref:refs/heads/main"]);
  assert.deepEqual(sub(NAMES.previewRole), ["repo:JK369x/kubcode:pull_request"]);
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

test("secrets key: rotation on, aliased, policy hook for Lambda roles", async () => {
  const lambda = `arn:aws:iam::${ACCOUNT_ID}:role/kubcode-publisher`;
  await build({ secretsKeyUserArns: [lambda] });
  const key = one("aws:kms/key:Key").inputs;
  assert.equal(key.enableKeyRotation, true);
  assert.equal(key.deletionWindowInDays, 30);
  // The key policy is a separate resource so the boundary can name the key ARN
  // without a dependency cycle (key -> boundary -> roles -> key policy).
  const keyPolicy = one("aws:kms/keyPolicy:KeyPolicy").inputs;
  const policy = JSON.parse(keyPolicy.policy);
  assert.deepEqual(policy.Statement.find((s: any) => s.Sid === "KeyUse").Principal.AWS, [lambda]);
  assert.deepEqual(policy.Statement.find((s: any) => s.Sid === "KeyAdministration").Principal.AWS, [
    `arn:aws:iam::${ACCOUNT_ID}:role/${NAMES.deployRole}`,
    `arn:aws:iam::${ACCOUNT_ID}:user/super_admin`,
  ]);
  const boundary = JSON.parse(byType("aws:iam/policy:Policy").find((p) => p.inputs.name === NAMES.deployBoundary)!.inputs.policy);
  const ceiling = boundary.Statement.find((s: any) => s.Sid === "KubcodeKeysCeiling");
  assert.ok(ceiling.Resource.includes(`arn:aws:kms:${REGION}:${ACCOUNT_ID}:key/secrets-key-id`));
  const alias = one("aws:kms/alias:Alias").inputs;
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
