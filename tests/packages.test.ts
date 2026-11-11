import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { ALL_PACKAGES, NEVER_DOWNLOADABLE, PACKAGES, PRIVATE_PACKAGES, approvedPackageFor, isPinned } from "../lib/packages";
import { rawSkills } from "../lib/catalog";

const root = join(__dirname, "..");
// The same patterns the signer Lambda enforces (docs/design/package-signer.md).
const KEY = /^packages\/[a-z0-9]+(-[a-z0-9]+)*\/[0-9]+\.[0-9]+\.[0-9]+\.zip$/;
const FILENAME = /^[a-z0-9]+(-[a-z0-9]+)*-[0-9]+\.[0-9]+\.[0-9]+\.zip$/;

test("packages: the approved releases are What If, Podcast Shorts, make-short and EGM", () => {
  assert.deepEqual(
    PACKAGES.map((p) => `${p.slug}@${p.version}`),
    ["freshstack-what-if@0.2.0", "podcast-tool-short@0.1.0", "make-short@0.1.0", "elephant-goldfish-model@0.1.1"],
  );
});

test("packages: skills without a licence can never be downloaded", () => {
  assert.deepEqual([...NEVER_DOWNLOADABLE].sort(), ["growkaz-stickman", "thai-survival"]);
  for (const slug of NEVER_DOWNLOADABLE) {
    assert.equal(ALL_PACKAGES.some((p) => p.slug === slug), false, slug);
    assert.equal(approvedPackageFor(slug), null, slug);
  }
});

test("packages: every entry is a catalogue skill with key, filename and approval", () => {
  for (const p of ALL_PACKAGES) {
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
    // A skill has SKILL.md at its root; a Claude Code plugin has its manifest.
    const entry = existsSync(join(dir, "SKILL.md")) || existsSync(join(dir, ".claude-plugin", "plugin.json"));
    assert.ok(entry, `${dir}: SKILL.md or .claude-plugin/plugin.json`);
  }
  const what = readFileSync(join(root, "packages/freshstack-what-if/0.2.0/LICENSE"), "utf8");
  assert.match(what, /MIT License/);
  assert.match(what, /FreshStack/);
});

test("packages: lookup by slug returns the approved entry or null", () => {
  assert.equal(approvedPackageFor("freshstack-what-if")?.version, "0.2.0");
  assert.equal(approvedPackageFor("low-poly-urban"), null);
  assert.equal(approvedPackageFor("../etc"), null);
  assert.equal(approvedPackageFor("constructor"), null);
});

test("packages: the infra stack uploads exactly the approved packages", async () => {
  // infra/src/constants.ts keeps its own list (the infra package cannot import
  // the web app); a package missing there is approved but never uploaded.
  const { PACKAGES: INFRA } = await import("../infra/src/constants");
  assert.deepEqual(
    INFRA.map((p) => `${p.slug}@${p.version}`).sort(),
    PACKAGES.map((p) => `${p.slug}@${p.version}`).sort(),
  );
  for (const p of INFRA) assert.ok(existsSync(join(root, "packages", p.slug, p.version)), `packages/${p.slug}/${p.version}`);
});

test("private packages: members-only, never in this repo, live only once their uploaded zip is pinned", () => {
  assert.deepEqual(PRIVATE_PACKAGES.map((p) => `${p.slug}@${p.version}`), ["deep-sea-docs@0.1.0"]);
  for (const p of PRIVATE_PACKAGES) {
    assert.equal(p.kind, "private");
    assert.match(p.licence, /members only/);
    assert.ok(!existsSync(join(root, "packages", p.slug)), `packages/${p.slug} must not exist in the public repo`);
    assert.ok(!existsSync(join(root, "studio/styles", p.slug)), `studio/styles/${p.slug} must not exist`);
    assert.ok(p.zip, `${p.slug} pins its zip`);
    if (p.zip!.sha256) {
      assert.match(p.zip!.sha256, /^[0-9a-f]{64}$/);
      assert.ok(p.zip!.bytes > 0 && p.maxKb > 0);
    }
    assert.equal(approvedPackageFor(p.slug) !== null, isPinned(p));
  }
  for (const p of PACKAGES) assert.equal(p.kind, "repo");
  const slugs = ALL_PACKAGES.map((p) => p.slug);
  assert.equal(new Set(slugs).size, slugs.length, "one current version per skill");
});
