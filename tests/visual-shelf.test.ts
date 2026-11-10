// The homepage shows one card per visual style (แนวภาพ), never a run of
// episodes from one series. Visual styles come from the data, so a clip in a
// new visual style adds a card. Each card also says which story formats
// (แนวเรื่อง) its clips tell.
import test from "node:test";
import assert from "node:assert/strict";
import { skills } from "../lib/catalog";
import { SHOWCASE_ALLOWLIST, SHOWCASE_VISUALS } from "../lib/showcase-allowlist";
import { publishedShowcase, visualShelf, type ShowcaseItem } from "../lib/showcase";
import { classifySource, type StoryKey, type VisualKey } from "../lib/taxonomy";

const item = (
  id: string,
  visual: string,
  aspect: "portrait" | "landscape" = "portrait",
  cover = false,
  story = "what-if",
): ShowcaseItem => ({
  id,
  label: id,
  title: id,
  visual: visual as VisualKey,
  story: story as StoryKey,
  cover,
  aspect,
  poster: { src: `/showcase/${id}/poster.jpg`, width: aspect === "portrait" ? 480 : 854, height: aspect === "portrait" ? 854 : 480 },
  preview: null,
  link: null,
  credits: [],
  madeBy: { agent: "codex-cli", model: "gpt-6.1-sol" },
});

test("every allowlisted clip maps to a shelf visual style, and each style has exactly one cover", () => {
  for (const entry of SHOWCASE_ALLOWLIST) {
    const { visual } = classifySource(entry.source);
    assert.ok(SHOWCASE_VISUALS[visual], `${entry.id}: no shelf entry for visual style ${visual}`);
  }
  for (const key of Object.keys(SHOWCASE_VISUALS)) {
    const covers = SHOWCASE_ALLOWLIST.filter((e) => classifySource(e.source).visual === key && e.cover);
    assert.equal(covers.length, 1, `visual style ${key} needs exactly one cover clip`);
  }
});

test("a visual style that links to a skill page links to one that exists", () => {
  const slugs = new Set(skills.map((s) => s.slug));
  for (const [key, style] of Object.entries(SHOWCASE_VISUALS))
    if (style?.skill) assert.ok(slugs.has(style.skill), `${key} -> /skills/${style.skill}`);
});

test("one card per visual style, in first-seen order, with its cover clip, clip count and story formats", () => {
  const shelf = visualShelf([
    item("a1", "a", "portrait", false, "satire"),
    item("b1", "b"),
    item("a2", "a", "portrait", true, "outbreak-drama"),
    item("a3", "a", "portrait", false, "satire"),
  ]);
  assert.deepEqual(shelf.map((s) => [s.visual, s.clip.id, s.count]), [["a", "a2", 3], ["b", "b1", 1]]);
  assert.deepEqual(shelf[0].stories, ["satire", "outbreak-drama"]);
});

test("without a cover flag the first portrait clip represents the visual style", () => {
  const shelf = visualShelf([item("w1", "w", "landscape"), item("w2", "w"), item("w3", "w")]);
  assert.equal(shelf[0].clip.id, "w2");
  assert.equal(visualShelf([item("l1", "l", "landscape")])[0].clip.id, "l1");
});

test("a clip in a new visual style adds a card without code changes", () => {
  const before = visualShelf([item("a1", "a"), item("b1", "b")]);
  const after = visualShelf([item("a1", "a"), item("b1", "b"), item("c1", "brand-new-style")]);
  assert.equal(after.length, before.length + 1);
  assert.equal(after.at(-1)?.visual, "brand-new-style");
});

test("the published homepage shows each visual style once", () => {
  const clips = publishedShowcase("licensed-only");
  const shelf = visualShelf(clips);
  const visuals = new Set(clips.map((c) => c.visual));
  assert.equal(shelf.length, visuals.size);
  assert.ok(shelf.length < clips.length, "episodes of one style collapse into one card");
  assert.equal(shelf.reduce((n, s) => n + s.count, 0), clips.length);
  // low-poly carries three story formats: one look, many ways to tell.
  const lowPoly = shelf.find((s) => s.visual === "low-poly");
  assert.deepEqual(lowPoly?.stories.slice().sort(), ["behind-the-city", "outbreak-drama", "satire"]);
});

test("every visual style has Thai hover details, and its tools all have /tools pages", async () => {
  const { getContent } = await import("../lib/content");
  const toolSlugs = new Set(getContent().tools.map((t) => t.slug));
  for (const [key, style] of Object.entries(SHOWCASE_VISUALS)) {
    assert.ok(style);
    assert.match(style.detail, /^[฀-๿A-Za-z]/, `${key} needs a detail line`);
    assert.ok(style.detail.length <= 160, `${key} detail stays short`);
    for (const tool of style.tools) assert.ok(toolSlugs.has(tool), `${key}: no /tools/${tool} page`);
  }
});
