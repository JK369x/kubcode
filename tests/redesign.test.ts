import { test } from "node:test";
import assert from "node:assert/strict";

import { createElement } from "react";
import { renderToStaticMarkup as renderReactMarkup } from "react-dom/server";
// React 19 prepends image resource hints; assertions below concern component DOM.
const renderToStaticMarkup = (node: Parameters<typeof renderReactMarkup>[0]) =>
  renderReactMarkup(node).replace(/<link\b(?=[^>]*rel="preload")(?=[^>]*as="image")[^>]*\/>/g, "");
import { skills, type Skill } from "../lib/catalog";
import { Preview, shapeOf } from "../components/Preview";

const bySlug = (slug: string): Skill => {
  const skill = skills.find((s) => s.slug === slug);
  assert.ok(skill, `missing catalog skill ${slug}`);
  return skill;
};

const featured = (skill: Skill) =>
  renderToStaticMarkup(
    createElement(
      Preview,
      { skill, compact: true },
      createElement(
        "div",
        { className: "featured-copy" },
        createElement("h2", null, skill.name),
      ),
    ),
  );

test("catalog media references and distribution boundaries are explicit", () => {
  for (const skill of skills) {
    for (const example of skill.examples) {
      for (const asset of [example.poster, example.video].filter(Boolean)) {
        assert.ok(asset!.startsWith("/previews/"));
        assert.ok(!asset!.includes(".."), "media paths must stay inside the preview namespace");
      }
    }
    assert.equal(skill.rights, "uncleared");
  }
  // Voice, captions, podcast shorts (whose clips come from the showcase) and
  // make-short (its test render is shown in its article, not as a preview)
  // and EGM (a coding plugin, no clip), and Deep Sea Docs (members-only kit;
  // its clips are on the owner's channel, not bundled as a preview).
  assert.equal(skills.filter((skill) => !skill.examples.length).length, 6);
});

test("featured author switches have distinct real sources, not runtime labels", () => {
  for (const slug of ["growkaz-stickman", "thai-survival"]) {
    const examples = skills.find((skill) => skill.slug === slug)!.examples;
    assert.deepEqual(
      examples.map((example) => example.id),
      ["claude", "codex"],
    );
    assert.deepEqual(
      examples.map((example) => example.author),
      ["Claude Code", "Codex CLI"],
    );
    assert.equal(new Set(examples.map((example) => example.video)).size, 2);
    assert.ok(
      examples.every(
        (example) => example.renderer && example.notes && example.voice,
      ),
    );
  }
});

test("media shape is derived from intrinsic size, never guessed", () => {
  assert.equal(shapeOf(1080, 1920), "portrait");
  assert.equal(shapeOf(1920, 1080), "landscape");
  assert.equal(shapeOf(1000, 1000), "square");
  assert.equal(shapeOf(0, 0), "pending");
});

test("featured card: player well, then context/action, then provenance", () => {
  const html = featured(bySlug("growkaz-stickman"));
  assert.match(
    html,
    /^<section class="exhibit compact-preview" id="selected-example" tabindex="-1"/,
  );
  // No size until real metadata arrives; no fake inline dimensions.
  assert.match(html, /data-shape="pending"/);
  assert.ok(!/class="media-stage" style=/.test(html));
  // Real controls, no autoplay audio.
  assert.match(html, /<video[^>]*controls=""/);
  assert.ok(!/autoplay/i.test(html));
  const media = html.indexOf('class="exhibit-media"');
  const variants = html.indexOf('class="variants"');
  const copy = html.indexOf('class="featured-copy"');
  const credits = html.indexOf('class="credits"');
  assert.ok(media >= 0 && media < variants, "author switch sits with player");
  assert.ok(variants < copy, "copy follows the player");
  assert.ok(copy < credits, "title/action come before full credits");
  // Full credits stay in an accessible disclosure.
  assert.match(html, /<details class="credits"><summary>/);
});

test("author switch shows real brand marks but keeps names Claude / Codex", () => {
  for (const slug of ["growkaz-stickman", "thai-survival"]) {
    const html = featured(bySlug(slug));
    assert.match(
      html,
      /<div class="variants" role="group" aria-label="เลือกผู้เขียนตัวอย่าง">/,
    );
    const buttons = [...html.matchAll(/<button([^>]*)>([\s\S]*?)<\/button>/g)];
    assert.equal(buttons.length, 2, slug);
    const names = buttons.map((b) => b[2].replace(/<[^>]+>/g, "").trim());
    assert.deepEqual(names, ["Claude", "Codex"], slug);
    assert.match(buttons[0][1], /aria-pressed="true"/);
    assert.match(buttons[1][1], /aria-pressed="false"/);
    assert.match(
      buttons[0][2],
      /<img[^>]*src="\/tool-icons\/claudecode\.svg"[^>]*alt=""[^>]*aria-hidden="true"/,
    );
    assert.match(
      buttons[1][2],
      /<img[^>]*src="\/tool-icons\/codex\.svg"[^>]*alt=""[^>]*aria-hidden="true"/,
    );
  }
});

test("no-media featured entry stays honest and does not repeat its title", () => {
  const skill = bySlug("thai-narrator");
  const html = featured(skill);
  assert.match(html, /data-shape="none"/);
  assert.match(html, /ยังไม่มีสื่อพรีวิว/);
  assert.equal((html.match(/<h2>/g) || []).length, 1);
  assert.ok(!html.includes("<video"));
});

test("detail-page Preview keeps its original flat structure and notice", () => {
  const html = renderToStaticMarkup(
    createElement(Preview, { skill: bySlug("growkaz-stickman") }),
  );
  assert.match(html, /^<section class="exhibit" id="selected-example"/);
  assert.ok(!html.includes("exhibit-media"));
  assert.ok(!html.includes("data-shape"));
  assert.match(html, /สิทธิ์เผยแพร่ยังไม่ยืนยัน/);
  const none = renderToStaticMarkup(
    createElement(Preview, { skill: bySlug("thai-narrator") }),
  );
  assert.match(none, /<h2>/);
});
