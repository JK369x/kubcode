// Unit tests for the IAM / KMS policy documents. Pure functions: no AWS calls.
import test from "node:test";
import assert from "node:assert/strict";
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
  type PolicyDocument,
  type Statement,
} from "../src/policies";
import { ACCOUNT_ID, GITHUB_OIDC_PROVIDER_ARN, NAMES, REGION } from "../src/constants";

const STATE_KEY_ARN = `arn:aws:kms:ap-southeast-1:${ACCOUNT_ID}:key/state-key-id`;
const SECRETS_KEY_ARN = `arn:aws:kms:ap-southeast-1:${ACCOUNT_ID}:key/secrets-key-id`;
const WRAP_KEY_ARN = `arn:aws:kms:ap-southeast-1:${ACCOUNT_ID}:key/wrap-key-id`;
const KUBCODE_PARAMETERS = `arn:aws:ssm:${REGION}:${ACCOUNT_ID}:parameter/kubcode/*`;
const LAMBDA_ROLE = `arn:aws:iam::${ACCOUNT_ID}:role/kubcode-lambda-oauth-connect`;
const BOUNDARY_ARN = `arn:aws:iam::${ACCOUNT_ID}:policy/${NAMES.deployBoundary}`;
const DEPLOY_ROLE = `arn:aws:iam::${ACCOUNT_ID}:role/${NAMES.deployRole}`;
const PREVIEW_ROLE = `arn:aws:iam::${ACCOUNT_ID}:role/${NAMES.previewRole}`;
const FUNCTIONS = `arn:aws:lambda:${REGION}:${ACCOUNT_ID}:function:kubcode-*`;
const LOG_GROUPS = `arn:aws:logs:${REGION}:${ACCOUNT_ID}:log-group:/aws/lambda/kubcode-*`;
// DescribeLogGroups is authorized against this ARN, not the group's own ARN.
const LOG_GROUPS_DESCRIBE_ARN = `arn:aws:logs:${REGION}:${ACCOUNT_ID}:log-group::log-stream:`;
const BREAK_GLASS = `arn:aws:iam::${ACCOUNT_ID}:user/super_admin`;

const asList = <T>(v: T | T[] | undefined): T[] => (v === undefined ? [] : Array.isArray(v) ? v : [v]);
const allows = (doc: PolicyDocument) => doc.Statement.filter((s) => s.Effect === "Allow");
const resourcesOf = (s: Statement) => asList(s.Resource);
const actionsOf = (s: Statement) => asList(s.Action);
const principalsOf = (s: Statement) => asList(s.Principal?.AWS);

// Matches an IAM action pattern ("kms:Create*") against a concrete action.
function actionMatches(pattern: string, action: string): boolean {
  if (pattern === "*") return true;
  const re = new RegExp(`^${pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*")}$`, "i");
  return re.test(action);
}
const grants = (s: Statement, action: string) => actionsOf(s).some((p) => actionMatches(p, action));

test("GitHub trust: only the kubcode repo subjects, STS audience, the existing OIDC provider", () => {
  const doc = githubTrustPolicy(GITHUB_OIDC_PROVIDER_ARN, ["repo:JK369x@104179568/kubcode@1444458364:ref:refs/heads/main"]);
  assert.equal(doc.Statement.length, 1);
  const [s] = doc.Statement;
  assert.equal(s.Effect, "Allow");
  assert.equal(s.Action, "sts:AssumeRoleWithWebIdentity");
  assert.deepEqual(s.Principal, { Federated: GITHUB_OIDC_PROVIDER_ARN });
  assert.deepEqual(s.Condition, {
    StringEquals: {
      "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
      "token.actions.githubusercontent.com:sub": ["repo:JK369x@104179568/kubcode@1444458364:ref:refs/heads/main"],
    },
  });
});

test("GitHub trust rejects wildcards, other repositories and the legacy (mutable) subject", () => {
  assert.throws(() => githubTrustPolicy(GITHUB_OIDC_PROVIDER_ARN, ["repo:JK369x@104179568/kubcode@1444458364:*"]), /wildcard/);
  // The repo uses GitHub's immutable subject (owner/repo IDs); the name-only
  // form never appears in its tokens and could match a re-created namesake.
  assert.throws(() => githubTrustPolicy(GITHUB_OIDC_PROVIDER_ARN, ["repo:JK369x/kubcode:ref:refs/heads/main"]), /JK369x/);
  assert.throws(() => githubTrustPolicy(GITHUB_OIDC_PROVIDER_ARN, ["repo:other/repo:ref:refs/heads/main"]), /JK369x/);
  assert.throws(() => githubTrustPolicy(GITHUB_OIDC_PROVIDER_ARN, []), /subject/);
});

const boundary = () =>
  deployBoundaryPolicy({ stateKeyArn: STATE_KEY_ARN, secretsKeyArn: SECRETS_KEY_ARN, wrapKeyArn: WRAP_KEY_ARN, boundaryArn: BOUNDARY_ARN });
const deploy = () => deployPolicy({ stateKeyArn: STATE_KEY_ARN, boundaryArn: BOUNDARY_ARN });

for (const [label, build] of [["boundary", boundary], ["deploy policy", deploy]] as const)
test(`${label}: every Allow is scoped to kubcode-* ARNs (or is a read-only list)`, () => {
  const doc = build();
  for (const s of allows(doc)) {
    for (const r of resourcesOf(s)) {
      if (r === "*") {
        // Unscoped resources are allowed only for read-only list calls.
        assert.ok(actionsOf(s).every((a) => /^[a-z0-9-]+:(List|Describe|Get)/.test(a)), `unscoped statement ${s.Sid} must be read-only`);
        continue;
      }
      const scoped =
        /:(role|policy)\/kubcode-/.test(r) ||
        /^arn:aws:s3:::kubcode-/.test(r) ||
        /:alias\/kubcode-/.test(r) ||
        /:budget\/kubcode-/.test(r) ||
        r.startsWith(`arn:aws:lambda:${REGION}:${ACCOUNT_ID}:function:kubcode-`) ||
        r.startsWith(`arn:aws:logs:${REGION}:${ACCOUNT_ID}:log-group:/aws/lambda/kubcode-`) ||
        r === LOG_GROUPS_DESCRIBE_ARN ||
        r === STATE_KEY_ARN ||
        r === SECRETS_KEY_ARN ||
        r === WRAP_KEY_ARN ||
        r === KUBCODE_PARAMETERS ||
        r === GITHUB_OIDC_PROVIDER_ARN;
      assert.ok(scoped, `statement ${s.Sid} resource ${r} is not kubcode-scoped`);
    }
  }
});

test("KMS: CI cannot create keys; the deploy identity reaches only the state key", () => {
  // kms:CreateKey is only authorized on Resource "*"; key-ARN statements cannot create keys.
  for (const doc of [boundary(), deploy()])
    assert.ok(!allows(doc).some((s) => resourcesOf(s).includes("*") && (grants(s, "kms:CreateKey") || grants(s, "kms:TagResource"))));
  const keyResources = (doc: PolicyDocument) => allows(doc).flatMap(resourcesOf).filter((r) => r.includes(":key/"));
  assert.deepEqual([...new Set(keyResources(deploy()))], [STATE_KEY_ARN]);
  assert.deepEqual([...new Set(keyResources(boundary()))].sort(), [SECRETS_KEY_ARN, STATE_KEY_ARN, WRAP_KEY_ARN].sort());
});

test("deploy policy fits inside the boundary (every deploy statement is in the boundary)", () => {
  const b = JSON.stringify(boundary().Statement);
  for (const s of deploy().Statement.filter((s) => s.Sid !== "StateKey")) assert.ok(b.includes(JSON.stringify(s)), s.Sid);
  assert.ok(allows(boundary()).some((s) => grants(s, "kms:Decrypt") && resourcesOf(s).includes(STATE_KEY_ARN)));
});

test("deploy boundary: roles can only be created/changed when they carry the boundary", () => {
  const doc = boundary();
  for (const action of ["iam:CreateRole", "iam:PutRolePolicy", "iam:AttachRolePolicy", "iam:PutRolePermissionsBoundary"]) {
    const granting = allows(doc).filter((s) => grants(s, action));
    assert.ok(granting.length > 0, `${action} must be granted`);
    for (const s of granting) {
      assert.deepEqual(s.Condition, { StringEquals: { "iam:PermissionsBoundary": BOUNDARY_ARN } }, action);
    }
  }
});

test("deploy boundary: the boundary itself, the OIDC provider and the igtest spike are denied", () => {
  const doc = boundary();
  const denies = doc.Statement.filter((s) => s.Effect === "Deny");
  const denied = (action: string, resource: string) =>
    denies.some((s) => grants(s, action) && resourcesOf(s).some((r) => r === resource || (r.endsWith("*") && resource.startsWith(r.slice(0, -1)))));

  for (const a of ["iam:CreatePolicyVersion", "iam:DeletePolicy", "iam:DeletePolicyVersion", "iam:SetDefaultPolicyVersion"])
    assert.ok(denied(a, BOUNDARY_ARN), `${a} on the boundary must be denied`);
  assert.ok(denied("iam:DeleteRolePermissionsBoundary", DEPLOY_ROLE));
  for (const a of ["iam:DeleteOpenIDConnectProvider", "iam:UpdateOpenIDConnectProviderThumbprint", "iam:TagOpenIDConnectProvider"])
    assert.ok(denied(a, GITHUB_OIDC_PROVIDER_ARN), `${a} on the shared OIDC provider must be denied`);
  assert.ok(denied("iam:DeleteRole", `arn:aws:iam::${ACCOUNT_ID}:role/kubcode-igtest-receiver-role`));
  assert.ok(denied("s3:DeleteBucket", `arn:aws:s3:::${NAMES.stateBucket}`));
  // CI must not rewrite who can assume (or delete) its own GitHub roles.
  for (const role of [DEPLOY_ROLE, PREVIEW_ROLE])
    for (const a of ["iam:UpdateAssumeRolePolicy", "iam:DeleteRole"]) assert.ok(denied(a, role), `${a} on ${role}`);
  assert.ok(denied("s3:DeleteObjectVersion", `arn:aws:s3:::${NAMES.stateBucket}/x`));
});

test("deploy boundary: the shared OIDC provider is read-only (Get only)", () => {
  const doc = boundary();
  const onProvider = allows(doc).filter((s) => resourcesOf(s).includes(GITHUB_OIDC_PROVIDER_ARN));
  assert.ok(onProvider.length > 0);
  for (const s of onProvider) assert.deepEqual(actionsOf(s), ["iam:GetOpenIDConnectProvider"]);
});

test("preview policy is read-only except Pulumi lock objects", () => {
  const doc = previewPolicy({ stateKeyArn: STATE_KEY_ARN });
  const writeVerbs = /:(Create|Put|Delete|Update|Attach|Detach|Tag|Untag|Modify|Schedule|Enable|Disable|Encrypt|GenerateDataKey|PassRole)/;
  for (const s of allows(doc)) {
    for (const a of actionsOf(s)) {
      if (!writeVerbs.test(a)) continue;
      assert.ok(["s3:PutObject", "s3:DeleteObject"].includes(a), `preview must not get ${a}`);
      assert.deepEqual(resourcesOf(s), [`arn:aws:s3:::${NAMES.stateBucket}/.pulumi/locks/*`]);
    }
  }
  // It can still decrypt the stack's data key to load config.
  assert.ok(allows(doc).some((s) => grants(s, "kms:Decrypt") && resourcesOf(s).includes(STATE_KEY_ARN)));
});

test("secrets key: admins manage but cannot use; only listed users can encrypt/decrypt", () => {
  const lambda = `arn:aws:iam::${ACCOUNT_ID}:role/kubcode-publisher`;
  const doc = secretsKeyPolicy({ adminArns: [DEPLOY_ROLE, BREAK_GLASS], readerArns: [PREVIEW_ROLE], userArns: [lambda] });
  const crypto = ["kms:Decrypt", "kms:Encrypt", "kms:GenerateDataKey", "kms:ReEncryptFrom"];
  for (const s of allows(doc).filter((s) => s.Sid !== "SsmParameterWrite")) {
    const who = principalsOf(s);
    if (crypto.some((a) => grants(s, a))) assert.deepEqual(who, [lambda], `crypto statement ${s.Sid}`);
    assert.ok(!grants(s, "kms:CreateGrant"), `${s.Sid} must not allow grants`);
  }
  const admin = doc.Statement.find((s) => s.Sid === "KeyAdministration")!;
  assert.deepEqual(principalsOf(admin), [DEPLOY_ROLE, BREAK_GLASS]);
  assert.ok(grants(admin, "kms:PutKeyPolicy"), "admins must be able to update the policy (lockout safety check)");
  const reader = doc.Statement.find((s) => s.Sid === "KeyRead")!;
  assert.deepEqual(principalsOf(reader), [PREVIEW_ROLE]);
});

test("secrets key: account root only as the root USER for recovery, never IAM delegation", () => {
  const doc = secretsKeyPolicy({ adminArns: [DEPLOY_ROLE], readerArns: [], userArns: [] });
  const root = `arn:aws:iam::${ACCOUNT_ID}:root`;
  const rootStatements = doc.Statement.filter((s) => principalsOf(s).includes(root));
  assert.equal(rootStatements.length, 1);
  const [r] = rootStatements;
  assert.equal(r.Sid, "RootUserRecovery");
  assert.deepEqual(principalsOf(r), [root]);
  // Without this condition every IAM principal with kms:PutKeyPolicy in the
  // account (client roles included) could take over the key.
  assert.deepEqual(r.Condition, { StringEquals: { "aws:PrincipalArn": root } });
  assert.ok(grants(r, "kms:PutKeyPolicy"));
  for (const a of ["kms:Decrypt", "kms:Encrypt", "kms:GenerateDataKey", "kms:ReEncryptFrom", "kms:CreateGrant"]) assert.ok(!grants(r, a), a);
});

test("secrets key: no usage statement until a Lambda role is added", () => {
  const doc = secretsKeyPolicy({ adminArns: [DEPLOY_ROLE], readerArns: [PREVIEW_ROLE], userArns: [] });
  assert.equal(doc.Statement.find((s) => s.Sid === "KeyUse"), undefined);
  assert.throws(() => secretsKeyPolicy({ adminArns: [], readerArns: [], userArns: [] }), /admin/);
});

const preview = () => previewPolicy({ stateKeyArn: STATE_KEY_ARN });
const onResource = (doc: PolicyDocument, resource: string) => allows(doc).filter((s) => resourcesOf(s).includes(resource));
const grantedOn = (doc: PolicyDocument, action: string, resource: string) => onResource(doc, resource).some((s) => grants(s, action));

test("lambda: the boundary and the deploy policy manage functions only on kubcode-* functions", () => {
  const actions = [
    "lambda:CreateFunction",
    "lambda:DeleteFunction",
    "lambda:GetFunction",
    "lambda:GetFunctionCodeSigningConfig",
    "lambda:GetRuntimeManagementConfig",
    "lambda:ListVersionsByFunction",
    "lambda:UpdateFunctionCode",
    "lambda:UpdateFunctionConfiguration",
    "lambda:TagResource",
    "lambda:UntagResource",
    "lambda:ListTags",
    "lambda:CreateFunctionUrlConfig",
    "lambda:GetFunctionUrlConfig",
    "lambda:UpdateFunctionUrlConfig",
    "lambda:DeleteFunctionUrlConfig",
    "lambda:AddPermission",
    "lambda:RemovePermission",
    "lambda:GetPolicy",
  ];
  for (const doc of [boundary(), deploy()]) {
    for (const a of actions) assert.ok(grantedOn(doc, a, FUNCTIONS), `${a} on kubcode-* functions`);
    // No lambda action is ever granted outside kubcode-* functions.
    for (const s of allows(doc).filter((s) => actionsOf(s).some((a) => a.startsWith("lambda:"))))
      assert.deepEqual(resourcesOf(s), [FUNCTIONS], s.Sid);
  }
});

test("lambda: the permission model stays closed (no invoke, no layers, no event sources, no concurrency)", () => {
  for (const doc of [boundary(), deploy()])
    for (const a of ["lambda:InvokeFunction", "lambda:InvokeFunctionUrl", "lambda:CreateEventSourceMapping", "lambda:PublishLayerVersion", "lambda:PutFunctionConcurrency", "lambda:*"])
      assert.ok(!allows(doc).some((s) => grants(s, a)), a);
});

test("logs: log groups are managed only under /aws/lambda/kubcode-*", () => {
  for (const doc of [boundary(), deploy()]) {
    for (const a of [
      "logs:CreateLogGroup",
      "logs:DeleteLogGroup",
      "logs:PutRetentionPolicy",
      "logs:DeleteRetentionPolicy",
      "logs:TagResource",
      "logs:UntagResource",
      "logs:ListTagsForResource",
      "logs:ListTagsLogGroup",
      "logs:TagLogGroup",
      "logs:UntagLogGroup",
      "logs:CreateLogStream",
      "logs:PutLogEvents",
    ])
      assert.ok(grantedOn(doc, a, LOG_GROUPS), `${a} on kubcode lambda log groups`);
    assert.ok(grantedOn(doc, "logs:DescribeLogGroups", LOG_GROUPS_DESCRIBE_ARN));
    for (const s of allows(doc).filter((s) => actionsOf(s).some((a) => a.startsWith("logs:")))) {
      assert.ok(!actionsOf(s).some((a) => a === "logs:*" || a === "*"), s.Sid);
      for (const r of resourcesOf(s)) assert.ok(r === LOG_GROUPS || r === LOG_GROUPS_DESCRIBE_ARN, `${s.Sid}: ${r}`);
      // The only unscoped-by-name logs statement is the read-only describe.
      if (resourcesOf(s).includes(LOG_GROUPS_DESCRIBE_ARN)) assert.deepEqual(actionsOf(s), ["logs:DescribeLogGroups"]);
    }
  }
});

test("iam:PassRole: only kubcode-* roles, only to lambda.amazonaws.com", () => {
  for (const doc of [boundary(), deploy()]) {
    const pass = allows(doc).filter((s) => actionsOf(s).some((a) => a.toLowerCase() === "iam:passrole" || a === "iam:*" || a === "*"));
    assert.equal(pass.length, 1);
    assert.deepEqual(actionsOf(pass[0]), ["iam:PassRole"]);
    assert.deepEqual(resourcesOf(pass[0]), [`arn:aws:iam::${ACCOUNT_ID}:role/kubcode-*`]);
    assert.deepEqual(pass[0].Condition, { StringEquals: { "iam:PassedToService": "lambda.amazonaws.com" } });
  }
});

test("preview policy gets read-only Lambda, Logs and package-object equivalents", () => {
  const doc = preview();
  for (const a of ["lambda:GetFunction", "lambda:GetFunctionCodeSigningConfig", "lambda:GetRuntimeManagementConfig", "lambda:ListVersionsByFunction", "lambda:GetFunctionUrlConfig", "lambda:GetPolicy", "lambda:ListTags"])
    assert.ok(grantedOn(doc, a, FUNCTIONS), a);
  for (const a of ["logs:ListTagsForResource", "logs:ListTagsLogGroup"]) assert.ok(grantedOn(doc, a, LOG_GROUPS), a);
  assert.ok(grantedOn(doc, "logs:DescribeLogGroups", LOG_GROUPS_DESCRIBE_ARN));
  const media = `arn:aws:s3:::${NAMES.mediaBucket}`;
  for (const a of ["s3:GetObject", "s3:GetObjectTagging"]) assert.ok(grantedOn(doc, a, `${media}/packages/*`), a);
  // Listing is limited to packages/: other keys name private originals. (A
  // refresh of a package deleted by hand then sees 403, not 404; an admin fixes it.)
  const list = allows(doc).filter((s) => grants(s, "s3:ListBucket") && [s.Resource].flat().some((r) => r === media || r === "*"));
  assert.equal(list.length, 1);
  assert.deepEqual(list[0].Condition, { StringLike: { "s3:prefix": ["packages/*"] } });
  // Nothing in Lambda or Logs is writable by the preview role.
  for (const s of allows(doc))
    for (const a of actionsOf(s).filter((a) => /^(lambda|logs):/.test(a))) assert.match(a, /^(lambda|logs):(Get|List|Describe)/, a);
  assert.ok(!allows(doc).some((s) => grants(s, "iam:PassRole")));
});

// True when some boundary Allow covers (action, resource), with IAM wildcards.
const globToRegExp = (g: string) => new RegExp(`^${g.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*")}$`);
const coveredByBoundary = (action: string, resource: string) =>
  allows(boundary()).some((bs) => grants(bs, action) && resourcesOf(bs).some((br) => globToRegExp(br).test(resource)));

test("preview policy fits inside the boundary (Lambda, Logs and object reads)", () => {
  for (const s of preview().Statement.filter((s) => actionsOf(s).some((a) => /^(lambda|logs):/.test(a)) || resourcesOf(s).some((r) => r.includes("/packages/"))))
    for (const a of actionsOf(s)) for (const r of resourcesOf(s)) assert.ok(coveredByBoundary(a, r), `${s.Sid}: ${a} on ${r}`);
});

test("lambda trust policy: lambda.amazonaws.com only", () => {
  const doc = lambdaTrustPolicy();
  assert.equal(doc.Statement.length, 1);
  const [s] = doc.Statement;
  assert.equal(s.Effect, "Allow");
  assert.equal(s.Action, "sts:AssumeRole");
  assert.deepEqual(s.Principal, { Service: "lambda.amazonaws.com" });
  assert.equal(s.Condition, undefined);
});

test("package signer role: GetObject on packages/* and its own log streams, nothing else", () => {
  const doc = packageSignerPolicy({ bucket: NAMES.mediaBucket, logGroupName: NAMES.packageSignerLogGroup });
  assert.ok(doc.Statement.every((s) => s.Effect === "Allow"));
  const flat = doc.Statement.map((s) => ({ actions: actionsOf(s).sort(), resources: resourcesOf(s).sort() }));
  assert.deepEqual(flat, [
    { actions: ["s3:GetObject"], resources: [`arn:aws:s3:::${NAMES.mediaBucket}/packages/*`] },
    {
      actions: ["logs:CreateLogStream", "logs:PutLogEvents"],
      resources: [`arn:aws:logs:${REGION}:${ACCOUNT_ID}:log-group:/aws/lambda/kubcode-package-signer:*`],
    },
  ]);
  const text = JSON.stringify(doc);
  assert.ok(!/kms:|s3:List|s3:Put|s3:Delete|"\*"|iam:|logs:CreateLogGroup/.test(text), "no KMS, no list, no writes, no wildcard resource");
  assert.ok(!text.includes(NAMES.stateBucket));
});

test("package signer role fits inside the boundary", () => {
  const doc = packageSignerPolicy({ bucket: NAMES.mediaBucket, logGroupName: NAMES.packageSignerLogGroup });
  for (const s of doc.Statement)
    for (const a of actionsOf(s)) for (const r of resourcesOf(s)) assert.ok(coveredByBoundary(a, r), `${a} on ${r} must be allowed by the boundary`);
});

test("package signer role rejects a log group outside /aws/lambda/kubcode-*", () => {
  assert.throws(() => packageSignerPolicy({ bucket: NAMES.mediaBucket, logGroupName: "/aws/lambda/other" }), /log group/);
  assert.throws(() => packageSignerPolicy({ bucket: "client-bucket", logGroupName: NAMES.packageSignerLogGroup }), /bucket/);
});

// ------------------------------------------------ settings keys (design §1, §5)

test("wrap key boundary: plaintext-producing calls are denied to every principal but kubcode-lambda-* roles", () => {
  const deny = boundary().Statement.find((s) => s.Sid === "DenyWrapKeyDecryptOutsideLambdaRoles")!;
  assert.deepEqual(resourcesOf(deny), [WRAP_KEY_ARN]);
  assert.equal(deny.Effect, "Deny");
  // ReEncrypt decrypts inside KMS and re-encrypts under a key the caller may
  // be able to decrypt (the state key), so it must be denied like Decrypt.
  for (const a of ["kms:Decrypt", "kms:ReEncryptFrom", "kms:ReEncryptTo"]) assert.ok(grants(deny, a), a);
  assert.deepEqual(deny.Condition, { ArnNotLike: { "aws:PrincipalArn": `arn:aws:iam::${ACCOUNT_ID}:role/kubcode-lambda-*` } });
  // Ceiling only: the boundary allows kms on the key so a key-policy grant can apply.
  assert.ok(allows(boundary()).some((s) => s.Sid === "KubcodeKeysCeiling" && resourcesOf(s).includes(WRAP_KEY_ARN)));
  // The deploy role itself never reaches the wrap key through IAM.
  assert.ok(!allows(deploy()).some((s) => resourcesOf(s).includes(WRAP_KEY_ARN)));
});

test("SSM: the boundary lets kubcode roles read /kubcode/* parameters; nothing CI runs can write them", () => {
  const ssm = (doc: PolicyDocument) => allows(doc).filter((s) => actionsOf(s).some((a) => a.startsWith("ssm:") || a === "*"));
  const [read, ...rest] = ssm(boundary());
  assert.equal(rest.length, 0);
  assert.deepEqual(actionsOf(read).sort(), ["ssm:GetParameter", "ssm:GetParameters"]);
  assert.deepEqual(resourcesOf(read), [KUBCODE_PARAMETERS]);
  assert.deepEqual(ssm(deploy()), [], "the deploy role needs no SSM: the stack does not manage parameters");
});

test("wrap key policy: admins manage and read the public key, never crypto or grants", () => {
  const doc = wrapKeyPolicy({ adminArns: [DEPLOY_ROLE, BREAK_GLASS], readerArns: [PREVIEW_ROLE], decryptArns: [] });
  for (const s of allows(doc)) {
    for (const a of ["kms:Decrypt", "kms:Encrypt", "kms:GenerateDataKey", "kms:ReEncryptFrom", "kms:Sign", "kms:CreateGrant"])
      assert.ok(!grants(s, a), `${s.Sid} must not allow ${a}`);
  }
  const admin = doc.Statement.find((s) => s.Sid === "KeyAdministration")!;
  assert.deepEqual(principalsOf(admin), [DEPLOY_ROLE, BREAK_GLASS]);
  assert.ok(grants(admin, "kms:PutKeyPolicy"));
  const pub = doc.Statement.find((s) => s.Sid === "PublicKeyRead")!;
  assert.deepEqual(principalsOf(pub).sort(), [BREAK_GLASS, DEPLOY_ROLE, PREVIEW_ROLE].sort());
  assert.ok(grants(pub, "kms:GetPublicKey") && grants(pub, "kms:DescribeKey"));
  const root = `arn:aws:iam::${ACCOUNT_ID}:root`;
  const recovery = doc.Statement.find((s) => principalsOf(s).includes(root))!;
  assert.deepEqual(recovery.Condition, { StringEquals: { "aws:PrincipalArn": root } });
  assert.equal(doc.Statement.find((s) => s.Sid === "KeyDecrypt"), undefined, "no Decrypt until step 5 adds Lambda roles");
});

test("wrap key policy: Decrypt only for named kubcode-lambda-* roles and only RSAES_OAEP_SHA_256", () => {
  const doc = wrapKeyPolicy({ adminArns: [DEPLOY_ROLE], readerArns: [], decryptArns: [LAMBDA_ROLE] });
  const dec = doc.Statement.find((s) => s.Sid === "KeyDecrypt")!;
  assert.deepEqual(principalsOf(dec), [LAMBDA_ROLE]);
  assert.deepEqual(actionsOf(dec), ["kms:Decrypt"]);
  assert.deepEqual(dec.Condition, { StringEquals: { "kms:EncryptionAlgorithm": "RSAES_OAEP_SHA_256" } });
  assert.throws(() => wrapKeyPolicy({ adminArns: [DEPLOY_ROLE], readerArns: [], decryptArns: [DEPLOY_ROLE] }), /kubcode-lambda-/);
  assert.throws(() => wrapKeyPolicy({ adminArns: [DEPLOY_ROLE], readerArns: [], decryptArns: ["*"] }), /kubcode-lambda-/);
  assert.throws(() => wrapKeyPolicy({ adminArns: [], readerArns: [], decryptArns: [] }), /admin/);
});

test("secrets key: SSM SecureString writes for the listed writers, only via SSM and only /kubcode/* parameters", () => {
  const doc = secretsKeyPolicy({ adminArns: [DEPLOY_ROLE, BREAK_GLASS], readerArns: [PREVIEW_ROLE], userArns: [], ssmWriterArns: [BREAK_GLASS] });
  const w = doc.Statement.find((s) => s.Sid === "SsmParameterWrite")!;
  assert.deepEqual(principalsOf(w), [BREAK_GLASS]);
  assert.deepEqual(actionsOf(w).sort(), ["kms:Encrypt", "kms:GenerateDataKey"]);
  assert.deepEqual(w.Condition, {
    StringEquals: { "kms:ViaService": `ssm.${REGION}.amazonaws.com` },
    StringLike: { "kms:EncryptionContext:PARAMETER_ARN": KUBCODE_PARAMETERS },
  });
  assert.ok(!grants(w, "kms:Decrypt"), "writing a parameter never needs Decrypt");
  const none = secretsKeyPolicy({ adminArns: [DEPLOY_ROLE], readerArns: [], userArns: [] });
  assert.equal(none.Statement.find((s) => s.Sid === "SsmParameterWrite"), undefined);
});

test("wrap key boundary: no kubcode role can rewrite the wrap key policy or create grants (admin-only)", () => {
  // Otherwise CI could name a principal outside the boundary (another account,
  // a client role) in the key policy or a grant and decrypt from there.
  const deny = boundary().Statement.find((s) => s.Sid === "DenyWrapKeyPolicyAndGrants")!;
  assert.equal(deny.Effect, "Deny");
  assert.deepEqual(resourcesOf(deny), [WRAP_KEY_ARN]);
  for (const a of ["kms:PutKeyPolicy", "kms:CreateGrant"]) assert.ok(grants(deny, a), a);
  assert.equal(deny.Condition, undefined, "applies to every kubcode role, Lambda roles included");
});

test("wrap key policy: its own Deny covers every principal (admins, root, other accounts)", () => {
  const doc = wrapKeyPolicy({ adminArns: [DEPLOY_ROLE, BREAK_GLASS], readerArns: [PREVIEW_ROLE], decryptArns: [LAMBDA_ROLE] });
  const deny = doc.Statement.find((s) => s.Sid === "DenyDecryptOutsideLambdaRoles")!;
  assert.equal(deny.Effect, "Deny");
  assert.deepEqual(deny.Principal, { AWS: "*" });
  for (const a of ["kms:Decrypt", "kms:ReEncryptFrom"]) assert.ok(grants(deny, a), a);
  assert.deepEqual(deny.Condition, { ArnNotLike: { "aws:PrincipalArn": `arn:aws:iam::${ACCOUNT_ID}:role/kubcode-lambda-*` } });
  const grantsDeny = doc.Statement.find((s) => s.Sid === "DenyGrants")!;
  assert.equal(grantsDeny.Effect, "Deny");
  assert.deepEqual(grantsDeny.Principal, { AWS: "*" });
  assert.ok(grants(grantsDeny, "kms:CreateGrant"));
});

test("oauth connect role: writes its own log streams and reads exactly its three SSM parameters", () => {
  const doc = oauthConnectPolicy({ logGroupName: "/aws/lambda/kubcode-oauth-connect" });
  const [logs, ssm, ...rest] = doc.Statement;
  assert.equal(rest.length, 0);
  assert.deepEqual(actionsOf(logs).sort(), ["logs:CreateLogStream", "logs:PutLogEvents"]);
  assert.deepEqual(resourcesOf(logs), [`arn:aws:logs:${REGION}:${ACCOUNT_ID}:log-group:/aws/lambda/kubcode-oauth-connect:*`]);
  assert.deepEqual(actionsOf(ssm), ["ssm:GetParameters"]);
  assert.deepEqual(resourcesOf(ssm).sort(), [
    `arn:aws:ssm:${REGION}:${ACCOUNT_ID}:parameter/kubcode/prod/connect-hmac-key`,
    `arn:aws:ssm:${REGION}:${ACCOUNT_ID}:parameter/kubcode/prod/google-connect-client`,
    `arn:aws:ssm:${REGION}:${ACCOUNT_ID}:parameter/kubcode/prod/worker-db-url`,
  ]);
  // KMS comes only from the key policies (KeyUse / KeyDecrypt hooks), never IAM.
  assert.ok(!doc.Statement.some((s) => actionsOf(s).some((a) => a.startsWith("kms:"))));
  assert.throws(() => oauthConnectPolicy({ logGroupName: "/aws/lambda/other" }), /kubcode-/);
});

test("oauth connect role fits inside the boundary", () => {
  const b = boundary();
  const doc = oauthConnectPolicy({ logGroupName: "/aws/lambda/kubcode-oauth-connect" });
  for (const s of doc.Statement)
    for (const a of actionsOf(s))
      for (const r of resourcesOf(s)) {
        const covered = allows(b).some((bs) => grants(bs, a) && resourcesOf(bs).some((br) => br === r || (br.endsWith("*") && r.startsWith(br.slice(0, -1)))));
        assert.ok(covered, `${a} on ${r}`);
      }
});

test("deploy boundary: CI cannot change who may assume a kubcode-lambda-* role (the roles that can decrypt)", () => {
  const deny = boundary().Statement.find((s) => s.Sid === "DenyLambdaRoleTrustChanges")!;
  assert.ok(deny, "statement exists");
  assert.equal(deny.Effect, "Deny");
  assert.ok(grants(deny, "iam:UpdateAssumeRolePolicy"));
  assert.deepEqual(resourcesOf(deny), [`arn:aws:iam::${ACCOUNT_ID}:role/kubcode-lambda-*`]);
  assert.equal(deny.Condition, undefined);
});
