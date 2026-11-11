// Skill pages and the catalog lead with real, approved clips: a skill whose
// style has showcase clips shows them, and its page speaks plain Thai with
// the rights detail folded away.
import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

// Node cannot load CSS modules; stub them before requiring components.
const NodeModule = require("node:module") as {
  _extensions: Record<string, (m: { exports: unknown }) => void>;
};
NodeModule._extensions[".css"] = (m) => {
  m.exports = new Proxy({}, { get: (_t, key) => (key === "__esModule" ? false : String(key)) });
};

const { showcaseForSkill, publishedShowcase } = require("../lib/showcase") as typeof import("../lib/showcase");
const { SHOWCASE_VISUALS } = require("../lib/showcase-allowlist") as typeof import("../lib/showcase-allowlist");
const { skills } = require("../lib/catalog") as typeof import("../lib/catalog");

const CLIPS = publishedShowcase("licensed-only");

async function renderSkillPage(slug: string) {
  const { default: Detail } = require("../app/skills/[slug]/page") as { default: (p: { params: Promise<{ slug: string }> }) => Promise<import("react").ReactElement> };
  return renderToStaticMarkup(await Detail({ params: Promise.resolve({ slug }) }));
}

test("showcaseForSkill: the clips of every style that names the skill, led by its cover", () => {
  const what = showcaseForSkill("freshstack-what-if", CLIPS)!;
  assert.ok(what);
  assert.deepEqual(
    what.clips.map((c) => c.id).sort(),
    CLIPS.filter((c) => SHOWCASE_VISUALS[c.visual]?.skill === "freshstack-what-if").map((c) => c.id).sort(),
  );
  assert.equal(what.cover.cover, true);
  assert.equal(what.detail, SHOWCASE_VISUALS["stick-svg"]!.detail);
  assert.equal(showcaseForSkill("thai-jk-voice", CLIPS), null);
  assert.equal(showcaseForSkill("no-such-skill", CLIPS), null);
});

test("a skill page with approved clips shows them, never a 'no preview' placeholder", async () => {
  const html = await renderSkillPage("freshstack-what-if");
  const what = showcaseForSkill("freshstack-what-if", CLIPS)!;
  assert.match(html, /<h2[^>]*>คลิปที่ทำด้วยสกิลนี้<\/h2>/);
  for (const clip of what.clips) assert.ok(html.includes(`url=${encodeURIComponent(clip.poster.src)}&`), clip.id);
  assert.doesNotMatch(html, /ยังไม่มีสื่อพรีวิว/);
  assert.match(html, /What If Animation ของ FreshStack/, "credit shown with the clips");
  for (const v of [...html.matchAll(/<video\b[^>]*>/g)].map((m) => m[0])) {
    assert.doesNotMatch(v, /\ssrc=|autoplay/i);
    assert.match(v, /preload="none"/);
  }
});

test("skill page reads as plain steps; internal rights wording is folded away", async () => {
  const html = await renderSkillPage("freshstack-what-if");
  for (const heading of ["สิ่งที่ต้องมี", "ใช้ยังไง"]) assert.match(html, new RegExp(`<h2[^>]*>${heading}</h2>`));
  const steps = html.match(/<ol[^>]*>([\s\S]*?)<\/ol>/)?.[1] ?? "";
  // Packaged skills get their install steps (tests/skill-page-panel.test.ts).
  assert.ok((steps.match(/<li\b/g) || []).length >= 4);
  const folded = html.match(/<details[^>]*>([\s\S]*?)<\/details>/)?.[1] ?? "";
  assert.match(folded, /<summary[^>]*>สถานะและสิทธิ์<\/summary>/);
  const outside = html.replace(/<details[\s\S]*?<\/details>/g, "");
  assert.doesNotMatch(outside, /source kit|metadata|clean clone|shared workflow/);
  assert.match(folded, /source kit/, "the honest detail is still on the page");
});

test("step 3 and the folded note promise a download only where a package exists", async () => {
  const stepsOf = (html: string) => html.match(/<ol[^>]*>([\s\S]*?)<\/ol>/)?.[1] ?? "";
  const what = await renderSkillPage("freshstack-what-if");
  assert.match(stepsOf(what), /เข้าสู่ระบบ แล้วกด “ดาวน์โหลด skill”/);
  assert.doesNotMatch(what, /ไม่ได้แนบ source kit/);
  const stick = await renderSkillPage("growkaz-stickman");
  assert.doesNotMatch(stepsOf(stick), /ดาวน์โหลด skill/);
  assert.match(stepsOf(stick), /ยังไม่มีชุดให้ดาวน์โหลด/);
  assert.match(stick, /ไม่ได้แนบ source kit/);
});

test("a packaged skill page never says it has no download package", async () => {
  const what = await renderSkillPage("freshstack-what-if");
  assert.doesNotMatch(what, /ยังไม่มีชุดดาวน์โหลด/);
  const stick = await renderSkillPage("growkaz-stickman");
  assert.match(stick, /ยังไม่มีชุดดาวน์โหลด/);
});

test("a skill without clips keeps its existing preview and gets the same plain sections", async () => {
  const html = await renderSkillPage("thai-jk-voice");
  assert.doesNotMatch(html, /คลิปที่ทำด้วยสกิลนี้/);
  assert.match(html, /<h2[^>]*>ใช้ยังไง<\/h2>/);
});

test("catalog: skills with clips first, with their real cover, linking to the skill page", () => {
  const { Library } = require("../components/Library") as typeof import("../components/Library");
  const html = renderToStaticMarkup(createElement(Library, { articles: [] }));
  assert.doesNotMatch(html, /local-notice/, "no rights-pending banner under the hero");
  const catalog = html.slice(html.indexOf('id="skill-index"'));
  const order = [...catalog.matchAll(/data-skill="([^"]+)"/g)].map((m) => m[1]);
  const withClips = skills.filter((s) => showcaseForSkill(s.slug, CLIPS)).map((s) => s.slug);
  assert.ok(withClips.length > 0);
  assert.deepEqual(order.slice(0, withClips.length).sort(), [...withClips].sort(), "skills with clips lead");
  for (const slug of withClips) {
    const card = catalog.match(new RegExp(`<article[^>]*data-skill="${slug}"[\\s\\S]*?</article>`))?.[0] ?? "";
    const cover = showcaseForSkill(slug, CLIPS)!.cover;
    assert.ok(card.includes(`url=${encodeURIComponent(cover.poster.src)}&`), `${slug} uses its approved cover`);
    const hit = [...card.matchAll(/<a\b[^>]*>/g)].map((m) => m[0]).find((t) => /card-preview/.test(t)) ?? "";
    assert.match(hit, new RegExp(`href="/skills/${slug}"`), `${slug} cover opens the skill page`);
    assert.doesNotMatch(card, /รอยืนยันสิทธิ์/);
  }
});
