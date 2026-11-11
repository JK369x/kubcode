import { test } from "node:test";
import assert from "node:assert/strict";
import { filterSkills, skills, styles } from "../lib/catalog";
test("search uses actual style and renderer metadata with use-case intersection", () => {
  assert.equal(styles.length, 6);
  assert.equal(
    styles.find((s) => s.id === "growkaz-stickman")?.status,
    "draft",
  );
  assert.equal(
    filterSkills(skills, "canvas", "story")[0]?.slug,
    "growkaz-stickman",
  );
  assert.equal(
    filterSkills(skills, "เสียง", "voice-captions")[0]?.slug,
    "thai-narrator",
  );
  assert.equal(filterSkills(skills, "canvas", "voice-captions").length, 0);
  assert.equal(filterSkills(skills, "", "no-such-use-case").length, 0);
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
