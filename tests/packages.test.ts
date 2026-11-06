import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { NEVER_DOWNLOADABLE, PACKAGES, approvedPackageFor } from "../lib/packages";
import { rawSkills } from "../lib/catalog";

const root = join(__dirname, "..");
// The same patterns the signer Lambda enforces (docs/design/package-signer.md).
const KEY = /^packages\/[a-z0-9]+(-[a-z0-9]+)*\/[0-9]+\.[0-9]+\.[0-9]+\.zip$/;
const FILENAME = /^[a-z0-9]+(-[a-z0-9]+)*-[0-9]+\.[0-9]+\.[0-9]+\.zip$/;

test("packages: the approved releases are What If 0.1.0 and Podcast Shorts 0.1.0", () => {
  assert.deepEqual(
    PACKAGES.map((p) => `${p.slug}@${p.version}`),
    ["freshstack-what-if@0.1.0", "podcast-tool-short@0.1.0"],
  );
});

test("packages: skills without a licence can never be downloaded", () => {
  assert.deepEqual([...NEVER_DOWNLOADABLE].sort(), ["growkaz-stickman", "thai-survival"]);
  for (const slug of NEVER_DOWNLOADABLE) {
    assert.equal(PACKAGES.some((p) => p.slug === slug), false, slug);
    assert.equal(approvedPackageFor(slug), null, slug);
  }
});

test("packages: every entry is a catalogue skill with key, filename and approval", () => {
  for (const p of PACKAGES) {
    assert.ok(rawSkills.some((s) => s.slug === p.slug), `${p.slug} is in the catalogue`);
    assert.equal(p.key, `packages/${p.slug}/${p.version}.zip`);
    assert.match(p.key, KEY);
    assert.equal(p.filename, `${p.slug}-${p.version}.zip`);
    assert.match(p.filename, FILENAME);
    assert.match(p.approval.date, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(p.approval.by.length > 0);
    assert.ok(p.licence.length > 0 && p.credit.length > 0);
  }
});

test("packages: each package's files are in the repo with its licence", () => {
  for (const p of PACKAGES) {
    const dir = join(root, "packages", p.slug, p.version);
    assert.ok(existsSync(join(dir, "LICENSE")), `${dir}/LICENSE`);
    assert.ok(existsSync(join(dir, "SKILL.md")), `${dir}/SKILL.md`);
  }
  const what = readFileSync(join(root, "packages/freshstack-what-if/0.1.0/LICENSE"), "utf8");
  assert.match(what, /MIT License/);
  assert.match(what, /FreshStack/);
});

test("packages: lookup by slug returns the approved entry or null", () => {
  assert.equal(approvedPackageFor("freshstack-what-if")?.version, "0.1.0");
  assert.equal(approvedPackageFor("low-poly-urban"), null);
  assert.equal(approvedPackageFor("../etc"), null);
  assert.equal(approvedPackageFor("constructor"), null);
});
