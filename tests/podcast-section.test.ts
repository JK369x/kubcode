// Podcast shorts are their own category and homepage section, apart from every
// cartoon style (owner, 2026-11-06), and the podcast-tool-short kit is a
// downloadable package under MIT with its MIT helper skills.
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { categories, rawSkills } from "../lib/catalog";
import { SHOWCASE_ALLOWLIST, SHOWCASE_STYLES } from "../lib/showcase-allowlist";
import { cartoonShowcase, podcastShowcase, publishedShowcase } from "../lib/showcase";
import { approvedPackageFor } from "../lib/packages";

const PODCAST_CLIPS = [
  "2026-10-25_tech-podcast_ep01_cliparr",
  "2026-10-26_tech-podcast_ep02_clean-your-tv",
  "2026-10-26_tech-podcast_ep03_amazon-bee",
  "2026-10-26_tech-podcast_ep04_php-security",
];

test("podcast is its own catalog category with the podcast-tool-short skill", () => {
  assert.ok(categories.some((c) => c.id === "podcast" && c.label === "พอดแคสต์"));
  const skill = rawSkills.find((s) => s.slug === "podcast-tool-short");
  assert.ok(skill, "podcast-tool-short in the catalog");
  assert.equal(skill.category, "podcast");
  assert.ok(rawSkills.filter((s) => s.category === "podcast").every((s) => s.slug === "podcast-tool-short"));
});

test("the podcast style is marked as the podcast section and links the skill", () => {
  const style = SHOWCASE_STYLES["podcast-short"];
  assert.ok(style);
  assert.equal(style.section, "podcast");
  assert.equal(style.skill, "podcast-tool-short");
  for (const [slug, s] of Object.entries(SHOWCASE_STYLES)) if (slug !== "podcast-short") assert.notEqual(s.section, "podcast", slug);
});

test("all four podcast clips are allowlisted with the source episode and CC BY-SA credit", () => {
  for (const id of PODCAST_CLIPS) {
    const e = SHOWCASE_ALLOWLIST.find((a) => a.id === id);
    assert.ok(e, id);
    assert.equal(e.style, "podcast-short", id);
    const credits = e.credits ?? [];
    assert.ok(credits.some((c) => /jupiterbroadcasting\.com|linuxunplugged\.com/.test(c.href ?? "")), `${id}: source episode link`);
    assert.ok(credits.some((c) => c.href === "https://creativecommons.org/licenses/by-sa/4.0/"), `${id}: CC BY-SA link`);
    assert.match(e.rights, /CC BY-SA 4\.0/, id);
  }
  assert.equal(SHOWCASE_ALLOWLIST.filter((a) => a.style === "podcast-short" && a.cover).length, 1);
});

test("the homepage splits clips: cartoon shelf never shows podcast, podcast section shows only podcast", () => {
  const items = publishedShowcase("local-study");
  const cartoon = cartoonShowcase(items);
  const podcast = podcastShowcase(items);
  assert.ok(cartoon.length > 0);
  assert.ok(cartoon.every((i) => SHOWCASE_STYLES[i.style]?.section !== "podcast"));
  assert.deepEqual(podcast.map((i) => i.id).sort(), [...PODCAST_CLIPS].sort());
  assert.equal(cartoon.length + podcast.length, items.length);
});

test("podcast-tool-short is a downloadable MIT package with its MIT helpers and credits", () => {
  const pkg = approvedPackageFor("podcast-tool-short");
  assert.ok(pkg);
  assert.equal(pkg.licence, "MIT");
  assert.match(pkg.credit, /Jake Schincariol/);
  const dir = `packages/podcast-tool-short/${pkg.version}`;
  for (const f of ["SKILL.md", "LICENSE", "README.md", "KUBCODE-NOTICE.md", "helpers/yt-package/SKILL.md", "helpers/yt-package/LICENSE", "helpers/yt-seo/SKILL.md", "helpers/yt-seo/LICENSE"])
    assert.ok(existsSync(`${dir}/${f}`), f);
  assert.match(readFileSync(`${dir}/LICENSE`, "utf8"), /^MIT License/);
  assert.match(readFileSync(`${dir}/helpers/yt-seo/LICENSE`, "utf8"), /Jake Schincariol/);
  const notice = readFileSync(`${dir}/KUBCODE-NOTICE.md`, "utf8");
  assert.match(notice, /Jake Schincariol/);
  assert.match(notice, /HyperFrames/);
});
