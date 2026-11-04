// Unit tests for the infra CI gate: parses `pulumi preview --json` and decides
// whether `pulumi up` may run. Deletes/replaces need the owner's exact phrase.
import test from "node:test";
import assert from "node:assert/strict";
import { approvalPhrase, decideInfra, parsePreview, summarize } from "../src/preview-gate";

const step = (op: string, type: string, name: string) => ({
  op,
  urn: `urn:pulumi:prod::kubcode-infra::${type}::${name}`,
});
const preview = (steps: object[]) => JSON.stringify({ steps, changeSummary: {} });

const owner = { event: "push", actor: "JK369x", owner: "JK369x", approval: "" };

test("creates and updates apply automatically", () => {
  const report = parsePreview(
    preview([step("create", "aws:s3/bucket:Bucket", "media"), step("update", "aws:iam/role:Role", "deploy"), step("same", "pulumi:pulumi:Stack", "kubcode-infra-prod")]),
  );
  assert.deepEqual(report.destructive, []);
  assert.equal(decideInfra(report, owner).apply, true);
});

test("deletes and replaces block a push run and print the approval phrase", () => {
  const report = parsePreview(
    preview([step("delete", "aws:s3/bucket:Bucket", "old"), step("replace", "aws:kms/key:Key", "secrets"), step("create-replacement", "aws:kms/key:Key", "secrets")]),
  );
  assert.equal(report.destructive.length, 3);
  const d = decideInfra(report, owner);
  assert.equal(d.apply, false);
  assert.match(d.reason, /approve infra [0-9a-f]{12}/);
  assert.ok(d.reason.includes(approvalPhrase(report)));
});

test("the phrase is bound to the exact destructive set (order-independent)", () => {
  const a = parsePreview(preview([step("delete", "aws:s3/bucket:Bucket", "a"), step("delete", "aws:s3/bucket:Bucket", "b")]));
  const b = parsePreview(preview([step("delete", "aws:s3/bucket:Bucket", "b"), step("delete", "aws:s3/bucket:Bucket", "a")]));
  const c = parsePreview(preview([step("delete", "aws:s3/bucket:Bucket", "a")]));
  assert.equal(approvalPhrase(a), approvalPhrase(b));
  assert.notEqual(approvalPhrase(a), approvalPhrase(c));
});

test("only the owner's manual run with the exact phrase approves", () => {
  const report = parsePreview(preview([step("delete", "aws:s3/bucket:Bucket", "old")]));
  const phrase = approvalPhrase(report);
  const dispatch = { event: "workflow_dispatch", actor: "JK369x", owner: "JK369x", approval: phrase };
  assert.equal(decideInfra(report, dispatch).apply, true);
  assert.equal(decideInfra(report, { ...dispatch, actor: "someone-else" }).apply, false);
  assert.equal(decideInfra(report, { ...dispatch, approval: `${phrase} ` }).apply, false);
  assert.equal(decideInfra(report, { ...dispatch, event: "push" }).apply, false);
});

test("a preview that failed or has no steps never applies", () => {
  assert.throws(() => parsePreview("not json"), /preview/);
  assert.throws(() => parsePreview(JSON.stringify({ diagnostics: [{ severity: "error", message: "boom" }] })), /steps/);
});

test("summary counts operations and lists every change", () => {
  const report = parsePreview(
    preview([step("create", "aws:s3/bucket:Bucket", "media"), step("create", "aws:kms/key:Key", "secrets"), step("same", "pulumi:pulumi:Stack", "s"), step("delete", "aws:iam/role:Role", "x")]),
  );
  const md = summarize(report);
  assert.match(md, /create: 2/);
  assert.match(md, /delete: 1/);
  assert.match(md, /\| delete \| aws:iam\/role:Role \| x \|/);
  assert.doesNotMatch(md, /\| same \|/);
  assert.match(md, /approve infra [0-9a-f]{12}/);
});
