import { test } from "node:test";
import assert from "node:assert/strict";
import { filterSkills, skills, styles } from "../lib/catalog";
test("search uses actual style and renderer metadata with category intersection", () => {
  assert.equal(styles.length, 8);
  assert.equal(
    styles.find((s) => s.id === "growkaz-stickman")?.status,
    "draft",
  );
  assert.equal(
    styles.find((s) => s.id === "jk-soft-story")?.status,
    "selected",
  );
  assert.equal(
    filterSkills(skills, "canvas", "video")[0]?.slug,
    "growkaz-stickman",
  );
  assert.equal(
    filterSkills(skills, "เสียง", "audio")[0]?.slug,
    "thai-jk-voice",
  );
  assert.equal(filterSkills(skills, "canvas", "audio").length, 0);
  assert.equal(filterSkills(skills, "", "code").length, 0);
  assert.equal(filterSkills(skills, "nothing-matches", "all").length, 0);
  assert.ok(skills.every((s) => s.rights === "uncleared"));
});
test("visitor-facing imported sample approval guidance is concise Thai and preserves study-only limits", () => {
  for (const slug of ["growkaz-stickman", "thai-survival", "freshstack-what-if"]) {
    const scope = skills.find(s => s.slug === slug)!.approvalScope;
    assert.match(scope, /ศึกษา/);
    assert.match(scope, /ยังไม่/);
    assert.match(scope, /เผยแพร่/);
    assert.ok(scope.length < 180);
    assert.doesNotMatch(scope, /Imported real tested samples/);
  }
});
