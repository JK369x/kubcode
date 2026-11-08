// The homepage shows one card per style, never a run of episodes from one
// series. Styles come from the data, so a clip in a new style adds a card.
import test from "node:test";
import assert from "node:assert/strict";
import { skills } from "../lib/catalog";
import { SHOWCASE_ALLOWLIST, SHOWCASE_STYLES } from "../lib/showcase-allowlist";
import { publishedShowcase, styleShelf, type ShowcaseItem } from "../lib/showcase";

const item = (id: string, style: string, aspect: "portrait" | "landscape" = "portrait", cover = false): ShowcaseItem => ({
  id,
  label: id,
  title: id,
  style,
  cover,
  aspect,
  poster: { src: `/showcase/${id}/poster.jpg`, width: aspect === "portrait" ? 480 : 854, height: aspect === "portrait" ? 854 : 480 },
  preview: null,
  link: null,
  credits: [],
  madeBy: { agent: "codex-cli", model: "gpt-6.1-sol" },
});

test("every allowlisted clip names a known style, and each style has exactly one cover", () => {
  for (const entry of SHOWCASE_ALLOWLIST) assert.ok(SHOWCASE_STYLES[entry.style], `${entry.id}: unknown style ${entry.style}`);
  for (const slug of Object.keys(SHOWCASE_STYLES)) {
    const covers = SHOWCASE_ALLOWLIST.filter((e) => e.style === slug && e.cover);
    assert.equal(covers.length, 1, `style ${slug} needs exactly one cover clip`);
  }
});

test("a style that links to a skill page links to one that exists", () => {
  const slugs = new Set(skills.map((s) => s.slug));
  for (const [slug, style] of Object.entries(SHOWCASE_STYLES))
    if (style.skill) assert.ok(slugs.has(style.skill), `${slug} -> /skills/${style.skill}`);
});

test("one card per style, in first-seen order, with its cover clip and clip count", () => {
  const shelf = styleShelf([
    item("a1", "a"),
    item("b1", "b"),
    item("a2", "a", "portrait", true),
    item("a3", "a"),
  ]);
  assert.deepEqual(shelf.map((s) => [s.style, s.clip.id, s.count]), [["a", "a2", 3], ["b", "b1", 1]]);
});

test("without a cover flag the first portrait clip represents the style", () => {
  const shelf = styleShelf([item("w1", "w", "landscape"), item("w2", "w"), item("w3", "w")]);
  assert.equal(shelf[0].clip.id, "w2");
  assert.equal(styleShelf([item("l1", "l", "landscape")])[0].clip.id, "l1");
});

test("a clip in a new style adds a card without code changes", () => {
  const before = styleShelf([item("a1", "a"), item("b1", "b")]);
  const after = styleShelf([item("a1", "a"), item("b1", "b"), item("c1", "brand-new-style")]);
  assert.equal(after.length, before.length + 1);
  assert.equal(after.at(-1)?.style, "brand-new-style");
});

test("the published homepage shows each style once", () => {
  const clips = publishedShowcase("licensed-only");
  const shelf = styleShelf(clips);
  const styles = new Set(clips.map((c) => c.style));
  assert.equal(shelf.length, styles.size);
  assert.ok(shelf.length < clips.length, "episodes of one style collapse into one card");
  assert.equal(shelf.reduce((n, s) => n + s.count, 0), clips.length);
});

test("every style has Thai hover details, and its tools all have /tools pages", async () => {
  const { getContent } = await import("../lib/content");
  const toolSlugs = new Set(getContent().tools.map((t) => t.slug));
  for (const [slug, style] of Object.entries(SHOWCASE_STYLES)) {
    assert.match(style.detail, /^[฀-๿A-Za-z]/, `${slug} needs a detail line`);
    assert.ok(style.detail.length <= 160, `${slug} detail stays short`);
    for (const tool of style.tools) assert.ok(toolSlugs.has(tool), `${slug}: no /tools/${tool} page`);
  }
});
