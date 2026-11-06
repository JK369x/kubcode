// Styles the owner took off the site (2026-11-06: "ไม่สวย"). None of them may
// come back by accident through the shelf, the catalog, the showcase data,
// the preview images or the style list.
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { rawSkills, styles } from "../lib/catalog";
import { SHOWCASE_ALLOWLIST, SHOWCASE_STYLES } from "../lib/showcase-allowlist";

const REMOVED_SHELF_STYLES = ["soft-story", "soft-story-motion", "mystery"];
const REMOVED_SKILLS = ["jk-soft-story", "jk-soft-story-motion-v2"];
const REMOVED_CLIPS = [
  "2026-11-01_jk-soft-story-motion-v2_ep02_friends-drifting-apart",
  "jk-soft-story-still",
  "2026-10-25_us-antarctica_ep01_mystery-short",
];

test("the removed styles are not on the homepage shelf", () => {
  for (const s of REMOVED_SHELF_STYLES) assert.equal(SHOWCASE_STYLES[s], undefined, s);
  for (const e of SHOWCASE_ALLOWLIST) assert.ok(!REMOVED_SHELF_STYLES.includes(e.style), e.id);
});

test("their clips are gone from the allowlist, the showcase data and public/showcase", () => {
  const manifest = readFileSync("lib/showcase.json", "utf8");
  for (const id of REMOVED_CLIPS) {
    assert.ok(!SHOWCASE_ALLOWLIST.some((e) => e.id === id), `allowlist: ${id}`);
    assert.ok(!manifest.includes(id), `showcase.json: ${id}`);
    assert.ok(!existsSync(`public/showcase/${id}`), `public/showcase/${id}`);
  }
});

test("the Soft Story skills have no catalog entry, style record or preview", () => {
  for (const slug of REMOVED_SKILLS) {
    assert.ok(!rawSkills.some((s) => s.slug === slug), `catalog: ${slug}`);
    assert.ok(!styles.some((s) => s.id === slug), `styles.json: ${slug}`);
  }
  assert.ok(!existsSync("public/previews/jk-soft-story.png"));
  assert.ok(!readFileSync("lib/preview-provenance.json", "utf8").includes("jk-soft-story"));
});
