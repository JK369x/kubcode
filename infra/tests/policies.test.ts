// Unit tests for the IAM / KMS policy documents. Pure functions: no AWS calls.
import test from "node:test";
import assert from "node:assert/strict";
import {
  deployBoundaryPolicy,
  deployPolicy,
  githubTrustPolicy,
  previewPolicy,
  secretsKeyPolicy,
  type PolicyDocument,
  type Statement,
} from "../src/policies";
import { ACCOUNT_ID, GITHUB_OIDC_PROVIDER_ARN, NAMES } from "../src/constants";

const STATE_KEY_ARN = `arn:aws:kms:ap-southeast-1:${ACCOUNT_ID}:key/state-key-id`;
const SECRETS_KEY_ARN = `arn:aws:kms:ap-southeast-1:${ACCOUNT_ID}:key/secrets-key-id`;
const BOUNDARY_ARN = `arn:aws:iam::${ACCOUNT_ID}:policy/${NAMES.deployBoundary}`;
const DEPLOY_ROLE = `arn:aws:iam::${ACCOUNT_ID}:role/${NAMES.deployRole}`;
const PREVIEW_ROLE = `arn:aws:iam::${ACCOUNT_ID}:role/${NAMES.previewRole}`;
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
  const doc = githubTrustPolicy(GITHUB_OIDC_PROVIDER_ARN, ["repo:JK369x/kubcode:ref:refs/heads/main"]);
  assert.equal(doc.Statement.length, 1);
  const [s] = doc.Statement;
  assert.equal(s.Effect, "Allow");
  assert.equal(s.Action, "sts:AssumeRoleWithWebIdentity");
  assert.deepEqual(s.Principal, { Federated: GITHUB_OIDC_PROVIDER_ARN });
  assert.deepEqual(s.Condition, {
    StringEquals: {
      "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
      "token.actions.githubusercontent.com:sub": ["repo:JK369x/kubcode:ref:refs/heads/main"],
    },
  });
});

test("GitHub trust rejects wildcards and other repositories", () => {
  assert.throws(() => githubTrustPolicy(GITHUB_OIDC_PROVIDER_ARN, ["repo:JK369x/kubcode:*"]), /wildcard/);
  assert.throws(() => githubTrustPolicy(GITHUB_OIDC_PROVIDER_ARN, ["repo:other/repo:ref:refs/heads/main"]), /JK369x\/kubcode/);
  assert.throws(() => githubTrustPolicy(GITHUB_OIDC_PROVIDER_ARN, []), /subject/);
});

const boundary = () => deployBoundaryPolicy({ stateKeyArn: STATE_KEY_ARN, secretsKeyArn: SECRETS_KEY_ARN, boundaryArn: BOUNDARY_ARN });
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
        r === STATE_KEY_ARN ||
        r === SECRETS_KEY_ARN ||
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
  assert.deepEqual([...new Set(keyResources(boundary()))].sort(), [SECRETS_KEY_ARN, STATE_KEY_ARN].sort());
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
  for (const s of allows(doc)) {
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
