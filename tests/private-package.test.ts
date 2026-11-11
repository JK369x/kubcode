import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { PRIVATE_PACKAGES } from "../lib/packages";
import {
  MEMBERS_LICENCE,
  MEMBERS_LICENCE_FILE,
  assertOutsideRepo,
  buildZip,
  collectFiles,
  headObjectArgs,
  packageEntries,
  putObjectArgs,
  sha256,
  verifyHead,
} from "../lib/private-package";
import { probeObject } from "../lib/downloads/routes";

const REPO = path.join(__dirname, "..");
const pkg = PRIVATE_PACKAGES[0];

function fixture(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "kubcode-private-"));
  fs.mkdirSync(path.join(d, "kit"));
  fs.writeFileSync(path.join(d, "SKILL.md"), "# kit\n");
  fs.writeFileSync(path.join(d, "kit/a.js"), "export const a = 1;\n");
  for (const junk of [".env", "voice.wav", "out.mp4", "token.json"]) fs.writeFileSync(path.join(d, junk), "x");
  fs.mkdirSync(path.join(d, "node_modules"));
  fs.writeFileSync(path.join(d, "node_modules/x.js"), "x");
  return d;
}

test("licence text is plain English and Thai, members only, no redistribution", () => {
  assert.match(MEMBERS_LICENCE, /may not share, upload, resell/);
  assert.match(MEMBERS_LICENCE, /ห้ามแชร์ อัปโหลด ขายต่อ/);
  assert.match(MEMBERS_LICENCE, /publish those videos/);
});

test("source must be outside the public repo", () => {
  assert.throws(() => assertOutsideRepo(path.join(REPO, "studio"), REPO), /inside the public kubcode repo/);
  assert.throws(() => assertOutsideRepo(REPO, REPO), /inside/);
  const d = fixture();
  try {
    assertOutsideRepo(d, REPO);
  } finally {
    fs.rmSync(d, { recursive: true, force: true });
  }
});

test("packing skips secrets, media and build state, adds the licence, and is deterministic", () => {
  const d = fixture();
  try {
    assert.deepEqual(collectFiles(d), ["SKILL.md", "kit/a.js"]);
    const entries = packageEntries(d, "deep-sea-docs");
    assert.deepEqual(entries.map((e) => e.name), ["deep-sea-docs/LICENSE-kubcode-members.txt", "deep-sea-docs/SKILL.md", "deep-sea-docs/kit/a.js"]);
    const a = buildZip(entries);
    const b = buildZip(packageEntries(d, "deep-sea-docs"));
    assert.equal(sha256(a), sha256(b));
    // A real unzip reads it (skip where unzip is absent).
    const zip = path.join(d, "t.zip");
    fs.writeFileSync(zip, a);
    try {
      const listed = execFileSync("unzip", ["-Z1", zip], { encoding: "utf8" });
      assert.match(listed, new RegExp(MEMBERS_LICENCE_FILE.replace(".", "\\.")));
      assert.equal(execFileSync("unzip", ["-p", zip, "deep-sea-docs/kit/a.js"], { encoding: "utf8" }), "export const a = 1;\n");
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    }
  } finally {
    fs.rmSync(d, { recursive: true, force: true });
  }
});

test("upload uses SSE-S3 with sha256 metadata on the package key; head-object verification is strict", () => {
  const put = putObjectArgs("bucket", pkg, "/tmp/x.zip", "ab".repeat(32));
  assert.deepEqual(put.slice(0, 6), ["s3api", "put-object", "--bucket", "bucket", "--key", "packages/deep-sea-docs/0.1.0.zip"]);
  assert.ok(put.includes("AES256"));
  assert.ok(put.includes(`sha256=${"ab".repeat(32)}`));
  assert.ok(!put.join(" ").match(/secret|access-key|token/i));
  assert.deepEqual(headObjectArgs("bucket", pkg).slice(0, 2), ["s3api", "head-object"]);
  const good = { ContentLength: 10, Metadata: { sha256: "h" }, ServerSideEncryption: "AES256" };
  assert.deepEqual(verifyHead(good, 10, "h"), []);
  assert.equal(verifyHead({ ...good, ContentLength: 9 }, 10, "h").length, 1);
  assert.equal(verifyHead({ ...good, Metadata: {} }, 10, "h").length, 1);
  assert.equal(verifyHead({ ...good, ServerSideEncryption: "aws:kms" }, 10, "h").length, 1);
});

test("the upload script defaults to a dry run and refuses a source inside the repo", () => {
  const src = fs.readFileSync(path.join(REPO, "scripts/upload-private-package.ts"), "utf8");
  assert.match(src, /const upload = flags\.includes\("--upload"\)/);
  assert.match(src, /if \(!upload\) \{[\s\S]*?return 0;/);
  assert.match(src, /assertOutsideRepo\(source, REPO\)/);
  assert.doesNotMatch(src, /console\.log\([^)]*(AWS_SECRET|AWS_ACCESS|SESSION_TOKEN)/);
});

test("probe: a missing object is 'missing', a present one 'present', anything else 'error'", async () => {
  const at = (status: number) => (async () => new Response(status === 206 ? "x" : null, { status })) as unknown as typeof fetch;
  assert.equal(await probeObject("https://b.s3.amazonaws.com/k", at(206)), "present");
  assert.equal(await probeObject("https://b.s3.amazonaws.com/k", at(404)), "missing");
  assert.equal(await probeObject("https://b.s3.amazonaws.com/k", at(403)), "missing");
  assert.equal(await probeObject("https://b.s3.amazonaws.com/k", at(500)), "error");
  const boom = (async () => {
    throw new Error("network");
  }) as unknown as typeof fetch;
  assert.equal(await probeObject("https://b.s3.amazonaws.com/k", boom), "error");
});
