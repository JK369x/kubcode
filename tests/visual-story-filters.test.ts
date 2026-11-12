// Visual style (แนวภาพ: how a clip looks) and story format (แนวเรื่อง: how
// the story is told) are separate, and the homepage filters each one on its
// own (owner decision 2026-11-10). They combine with the use-case row (AND).
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const NodeModule = require("node:module") as {
  _extensions: Record<string, (m: { exports: unknown }) => void>;
};
NodeModule._extensions[".css"] = (m) => {
  m.exports = new Proxy({}, { get: (_t, key) => (key === "__esModule" ? false : String(key)) });
};

const taxonomy = require("../lib/taxonomy") as typeof import("../lib/taxonomy");
const { VISUAL_STYLES, STORY_FORMATS, SERIES_MAP, SITE_ONLY_KEYS, classifySource, seriesOf } = taxonomy;
const { rawSkills, skills } = require("../lib/catalog") as typeof import("../lib/catalog");
const { SHOWCASE_ALLOWLIST } = require("../lib/showcase-allowlist") as typeof import("../lib/showcase-allowlist");
const { SHOWCASE_MANIFEST } = require("../lib/showcase-manifest") as typeof import("../lib/showcase-manifest");
const { publishedShowcase, cartoonShowcase } = require("../lib/showcase") as typeof import("../lib/showcase");
const facets = require("../lib/facets") as typeof import("../lib/facets");
const { filterHomeSkills, filterHomeClips, facetOptions, filterFromSearch, searchFromFilter, NO_FILTER } = facets;
const { ClipResults } = require("../components/ClipResults") as typeof import("../components/ClipResults");

const PUBLISHED = publishedShowcase("local-study");
const HOME = { skills, clips: cartoonShowcase(PUBLISHED), published: PUBLISHED };
const slugs = (f: Partial<typeof NO_FILTER>) => filterHomeSkills(HOME, { ...NO_FILTER, ...f }).map((s) => s.slug).sort();
const clipIds = (f: Partial<typeof NO_FILTER>) => filterHomeClips(HOME.clips, { ...NO_FILTER, ...f }).map((c) => c.id);

/* ---------------------------------------------------------- taxonomy */

test("lib/taxonomy.json is the studio's file (when the studio is on this machine)", () => {
  const studio = path.join(os.homedir(), "Studio/taxonomy.json");
  if (!existsSync(studio)) return;
  assert.deepEqual(JSON.parse(readFileSync("lib/taxonomy.json", "utf8")), JSON.parse(readFileSync(studio, "utf8")));
});

test("make-short's keys come from the studio file, with Thai labels; no site-only keys left", () => {
  assert.deepEqual(SITE_ONLY_KEYS, { visual: [], story: [] });
  assert.equal(VISUAL_STYLES["blender-3d"].th, "3D Blender");
  assert.equal(STORY_FORMATS["paradox-fact"].th, "ข้อเท็จจริงย้อนแย้ง");
});

test("series map as the owner set it", () => {
  const want: Record<string, [string, string]> = {
    "zombie-condo": ["sitcom-toon", "zombie-sitcom"],
    "mall-infection": ["low-poly", "outbreak-drama"],
    "satire-stories": ["low-poly", "satire"],
    "freshstack-what-if": ["stick-svg", "what-if"],
    "what-if-studio": ["stick-svg", "what-if"],
    "low-poly-urban": ["low-poly", "behind-the-city"],
    "tech-podcast": ["footage-reframe", "tool-from-podcast"],
  };
  for (const [series, [visual, story]] of Object.entries(want)) assert.deepEqual(SERIES_MAP[series], { visual, story }, series);
  assert.equal(seriesOf("studio:2026-10-25_zombie-condo_ep01_tomorrow-invasion"), "zombie-condo");
  assert.equal(seriesOf("style:low-poly-urban/examples/city/demo.mp4"), "low-poly-urban");
  assert.throws(() => classifySource("studio:2026-01-01_unknown_ep01_x"), /map_from_series/);
});

/* ---------------------------------------------------- showcase clips */

test("every showcase clip carries the visual style and story format of its series", () => {
  for (const e of SHOWCASE_ALLOWLIST) {
    const m = SHOWCASE_MANIFEST.find((x) => x.id === e.id)!;
    assert.deepEqual({ visual: m.visual, story: m.story }, classifySource(e.source), e.id);
  }
  for (const c of PUBLISHED) {
    assert.ok(VISUAL_STYLES[c.visual], c.id);
    assert.ok(STORY_FORMATS[c.story], c.id);
  }
});

test("clip.json agrees with the series map (when the studio is on this machine)", () => {
  for (const e of SHOWCASE_ALLOWLIST) {
    if (!e.source.startsWith("studio:")) continue;
    const file = path.join(os.homedir(), "Studio/clips", e.source.slice(7), "clip.json");
    if (!existsSync(file)) continue;
    const clip = JSON.parse(readFileSync(file, "utf8"));
    assert.deepEqual({ visual: clip.visual_style, story: clip.story_format }, classifySource(e.source), e.id);
  }
});

test("the published set did not change, and nothing from thai-survival or growkaz is shown", () => {
  assert.equal(SHOWCASE_ALLOWLIST.length, 18);
  const text = JSON.stringify(SHOWCASE_ALLOWLIST) + readFileSync("lib/showcase.json", "utf8");
  assert.doesNotMatch(text, /thai-survival|growkaz/);
  for (const c of PUBLISHED) assert.ok(!["flat-room", "stickman-canvas"].includes(c.visual), c.id);
});

/* ------------------------------------------------------ catalogue skills */

test("style skills carry visual/story; tools carry neither", () => {
  const pair = (slug: string) => {
    const s = rawSkills.find((x) => x.slug === slug)!;
    return [s.visual, s.story];
  };
  assert.deepEqual(pair("make-short"), ["blender-3d", "paradox-fact"]);
  assert.deepEqual(pair("freshstack-what-if"), ["stick-svg", "what-if"]);
  assert.deepEqual(pair("low-poly-urban"), ["low-poly", "behind-the-city"]);
  for (const slug of ["elephant-goldfish-model", "thai-narrator", "captions-overlay", "podcast-tool-short"])
    assert.deepEqual(pair(slug), [undefined, undefined], slug);
  for (const s of rawSkills) {
    if (s.visual) assert.ok(VISUAL_STYLES[s.visual], s.slug);
    if (s.story) assert.ok(STORY_FORMATS[s.story], s.slug);
  }
});

/* --------------------------------------------------------------- filters */

test("แนวภาพ alone: skills and clips of that look, whatever their story", () => {
  assert.deepEqual(slugs({ visual: "low-poly" }), ["low-poly-urban"]);
  const ids = clipIds({ visual: "low-poly" });
  assert.ok(ids.some((id) => id.includes("mall-infection")) && ids.some((id) => id.includes("satire-stories")));
  assert.deepEqual(slugs({ visual: "blender-3d" }), ["make-short"]);
  assert.deepEqual(clipIds({ visual: "blender-3d" }), []);
});

test("แนวเรื่อง alone: skills and clips told that way, whatever their look", () => {
  assert.deepEqual(slugs({ story: "what-if" }), ["freshstack-what-if"]);
  assert.equal(clipIds({ story: "what-if" }).length, 3);
  assert.deepEqual(slugs({ story: "paradox-fact" }), ["make-short"]);
  // low-poly-urban is found by its clips' formats too, not only its own.
  assert.deepEqual(slugs({ story: "satire" }), ["low-poly-urban"]);
});

test("the two rows combine (AND), and with the use case", () => {
  assert.deepEqual(clipIds({ visual: "low-poly", story: "satire" }), ["2026-10-28_satire-stories_ep01_elon-dream-low-poly"]);
  assert.deepEqual(clipIds({ visual: "sitcom-toon", story: "satire" }), []);
  assert.deepEqual(slugs({ visual: "stick-svg", story: "behind-the-city" }), []);
  assert.deepEqual(slugs({ visual: "low-poly", useCase: "voice-captions" }), []);
  assert.deepEqual(clipIds({ visual: "low-poly", useCase: "code" }), []);
  assert.deepEqual(slugs({ visual: "stick-svg", useCase: "story" }), ["freshstack-what-if"]);
});

test("tools stay reachable through their use case only", () => {
  assert.deepEqual(slugs({ useCase: "code" }), ["elephant-goldfish-model"]);
  assert.deepEqual(slugs({ useCase: "voice-captions" }), ["captions-overlay", "thai-narrator"]);
  assert.deepEqual(slugs({ useCase: "podcast" }), ["podcast-tool-short"]);
  assert.equal(slugs({}).length, skills.length);
});

test("each row lists ทั้งหมด then only keys that have a skill or clip, with Thai labels", () => {
  const visual = facetOptions("visual", HOME, NO_FILTER);
  const story = facetOptions("story", HOME, NO_FILTER);
  assert.equal(visual[0].label, "ทั้งหมด");
  assert.equal(story[0].label, "ทั้งหมด");
  assert.deepEqual(visual.slice(1).map((o) => o.id).sort(), ["blender-3d", "deep-sea", "flat-room", "low-poly", "sitcom-toon", "stick-svg", "stickman-canvas"].sort());
  assert.deepEqual(story.slice(1).map((o) => o.id).sort(), ["behind-the-city", "deep-dive-doc", "money-tip", "outbreak-drama", "paradox-fact", "satire", "what-if", "zombie-sitcom"].sort());
  for (const o of [...visual, ...story].slice(1)) assert.ok(o.count > 0, o.id);
  // Not shown anywhere on the homepage: no chip.
  assert.ok(!visual.some((o) => o.id === "footage-reframe" || o.id === "soft-2d"));
  assert.ok(!story.some((o) => o.id === "tool-from-podcast" || o.id === "ghost-story"));
  assert.equal(visual.find((o) => o.id === "low-poly")!.label, "3D โลว์โพลี");
  assert.equal(story.find((o) => o.id === "what-if")!.label, "ถ้าเกิดว่า…");
  // Counts follow the other rows.
  const lowPolySatire = facetOptions("story", HOME, { ...NO_FILTER, visual: "low-poly" }).find((o) => o.id === "satire")!;
  assert.equal(lowPolySatire.count, 2, "low-poly-urban skill + one satire clip");
});

test("filters round-trip through the address; unknown values are ignored", () => {
  const f = { ...NO_FILTER, useCase: "story", visual: "low-poly", story: "satire" };
  assert.equal(searchFromFilter(f), "?use=story&visual=low-poly&story=satire");
  assert.deepEqual(filterFromSearch(searchFromFilter(f), { useCases: ["all", "story"] }), f);
  assert.deepEqual(filterFromSearch("?visual=nope&story=what-if", { useCases: ["all"] }), { ...NO_FILTER, story: "what-if" });
  assert.equal(searchFromFilter(NO_FILTER), "");
});

/* ------------------------------------------------------------- homepage */

test("homepage: three labelled rows (use case, แนวภาพ, แนวเรื่อง), each starting with ทั้งหมด", () => {
  const { Library } = require("../components/Library") as typeof import("../components/Library");
  const html = renderToStaticMarkup(createElement(Library, { articles: [] }));
  // Each row is a shadcn ToggleGroup (type="single"): a radio group whose
  // checked chip is the row's value; arrow keys move between chips.
  const row = (label: string) =>
    html.match(new RegExp(`<div[^>]*role="radiogroup"[^>]*aria-label="${label}"[^>]*>([\\s\\S]*?)</div>`))?.[1];
  for (const label of ["อยากทำอะไร", "แนวภาพ", "แนวเรื่อง"]) {
    const nav = row(label);
    assert.ok(nav, label);
    assert.match(nav, /^<button[^>]*role="radio"[^>]*aria-checked="true"[^>]*>ทั้งหมด/, `${label} starts with ทั้งหมด, checked`);
    assert.equal((nav.match(/aria-checked="true"/g) ?? []).length, 1, `${label}: exactly one checked`);
  }
  assert.match(row("แนวภาพ")!, /data-value="blender-3d"[^>]*>3D Blender/);
  assert.match(row("แนวเรื่อง")!, /data-value="paradox-fact"[^>]*>ข้อเท็จจริงย้อนแย้ง/);
});

test("filtered clips carry their story format on the poster and their visual style under it", () => {
  const clips = filterHomeClips(HOME.clips, { ...NO_FILTER, visual: "low-poly" });
  const html = renderToStaticMarkup(createElement(ClipResults, { clips }));
  for (const c of clips) {
    const li = html.match(new RegExp(`<li[^>]*data-visual="${c.visual}" data-story="${c.story}"[^>]*>[\\s\\S]*?${c.label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[\\s\\S]*?</li>`));
    assert.ok(li, c.id);
    assert.ok(li[0].includes(STORY_FORMATS[c.story].th), `${c.id}: story label`);
    assert.ok(li[0].includes(VISUAL_STYLES[c.visual].th), `${c.id}: visual label`);
  }
  for (const v of [...html.matchAll(/<video\b[^>]*>/g)].map((m) => m[0])) assert.doesNotMatch(v, /\ssrc=|autoplay/);
});
