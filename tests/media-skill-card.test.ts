import test from "node:test";
import assert from "node:assert/strict";
import { createElement, isValidElement, type ReactNode } from "react";
import { renderToStaticMarkup as renderReactMarkup } from "react-dom/server";
import { approvedPackageFor } from "../lib/packages";

// Node cannot load CSS modules; stub them as identity class maps before
// requiring the component (tsx compiles this file as CommonJS).
const NodeModule = require("node:module") as {
  _extensions: Record<string, (m: { exports: unknown }) => void>;
};
NodeModule._extensions[".css"] = (m) => {
  m.exports = new Proxy(
    {},
    { get: (_t, key) => (key === "__esModule" ? false : String(key)) },
  );
};

const { MediaSkillCard } =
  require("../components/MediaSkillCard") as typeof import("../components/MediaSkillCard");
const { skills } =
  require("../lib/catalog") as typeof import("../lib/catalog");
type Skill = (typeof skills)[number];

// React 19 prepends image resource hints; assertions concern component DOM.
const render = (skill: Skill, onSelectSkill: (slug: string) => void = () => {}) =>
  renderReactMarkup(createElement(MediaSkillCard, { skill, onSelectSkill })).replace(
    /<link\b(?=[^>]*rel="preload")(?=[^>]*as="image")[^>]*\/>/g,
    "",
  );

const bySlug = (slug: string): Skill => {
  const skill = skills.find((s) => s.slug === slug);
  assert.ok(skill, `missing catalog skill ${slug}`);
  return skill;
};

const withPoster = bySlug("growkaz-stickman");
const { coverFor } = require("../lib/media-covers") as typeof import("../lib/media-covers");
const noMedia = bySlug("thai-narrator");

const tags = (html: string, name: string) =>
  html.match(new RegExp(`<${name}\\b[^>]*>`, "g")) || [];

const attr = (tag: string, name: string) =>
  tag.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1];

test("poster card: one full-card preview button wraps the real poster", () => {
  const html = render(withPoster);
  const article = tags(html, "article")[0] ?? "";
  assert.match(attr(article, "class") ?? "", /(^|\s)skill-card(\s|$)/);
  assert.equal(attr(article, "data-media"), "poster");

  const previews = tags(html, "button").filter((b) =>
    /(^|\s)card-preview(\s|$)/.test(attr(b, "class") ?? ""),
  );
  assert.equal(previews.length, 1);
  assert.equal(attr(previews[0], "type"), "button");
  assert.equal(attr(previews[0], "aria-label"), "ดูผลงาน Stickman Cinema");
  assert.doesNotMatch(attr(previews[0], "class") ?? "", /without-media/);

  // The poster is the button's only content and is cropped to cover
  // (class "poster"), not a contained thumbnail on a matte.
  const inner =
    html.match(/<button\b[^>]*card-preview[^>]*>([\s\S]*?)<\/button>/)?.[1] ??
    "";
  const img = tags(inner, "img");
  assert.equal(img.length, 1);
  // Through the image optimiser (next/image), resized and AVIF/WebP.
  assert.ok(attr(img[0], "src")?.includes(`url=${encodeURIComponent(coverFor(withPoster)!)}&`), attr(img[0], "src"));
  assert.equal(attr(img[0], "class"), "poster");
  assert.equal(attr(img[0], "alt"), "", "button label names the work");
});

test("title, authors and action overlay the media; description is not a facts slab", () => {
  const html = render(withPoster);
  // Overlays are siblings of the preview button, after it in source order.
  const afterButton = html.split("</button>").slice(1).join("</button>");
  assert.match(afterButton, /<h3\b/);
  assert.match(afterButton, /Stickman Cinema/);
  assert.match(afterButton, /ยังไม่เปิดดาวน์โหลด/);
  // One description paragraph; tool and author lists are compact, not chip
  // blocks duplicated from the featured area.
  assert.equal((html.match(/<p\b/g) || []).length, 1);
  assert.doesNotMatch(html, /class="tool-chips"/);
  assert.doesNotMatch(html, /class="card-copy"/);
});

test("navigation: real detail link and real conditions link, both named", () => {
  const html = render(withPoster);
  const links = [...html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)];
  const hrefs = links.map((m) => attr(m[0], "href"));
  assert.deepEqual(hrefs, [
    "/skills/growkaz-stickman",
    "/skills/growkaz-stickman#download",
  ]);
  assert.match(links[0][2], /Stickman Cinema/);
  assert.equal(
    attr(links[1][0], "aria-label"),
    "ดูเงื่อนไขการดาวน์โหลด Stickman Cinema",
  );
  assert.match(links[1][2], /เงื่อนไข/, "visible text is part of the name");
});

test("download renders disabled on the server with no fake success or file href", () => {
  for (const skill of skills) {
    const html = render(skill);
    const download = tags(html, "button").filter((b) => !/card-preview/.test(b));
    assert.equal(download.length, 1, skill.slug);
    assert.match(download[0], /\sdisabled(=""|\s|>)/);
    assert.match(html, /ดาวน์โหลด skill/);
    // Packaged skills check the session in the browser first (ADR 0002).
    assert.match(html, approvedPackageFor(skill.slug) ? /กำลังตรวจสอบ/ : /ยังไม่เปิดดาวน์โหลด/, skill.slug);
    assert.doesNotMatch(html, /\sdownload(=|\s|>)/);
    assert.doesNotMatch(html, /\/api\/download|\.zip/i);
    assert.doesNotMatch(html, /ดาวน์โหลดสำเร็จ|เริ่มดาวน์โหลด|กำลังดาวน์โหลด/);
  }
});

test("no interactive element is nested in another, for every skill", () => {
  const interactive = /<(a|button|input|select|textarea)\b/;
  for (const skill of skills) {
    const html = render(skill);
    for (const m of html.matchAll(/<button\b[^>]*>([\s\S]*?)<\/button>/g))
      assert.doesNotMatch(m[1], interactive, skill.slug + " button");
    for (const m of html.matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/g))
      assert.doesNotMatch(m[1], interactive, skill.slug + " link");
    assert.doesNotMatch(html, /tabindex="\d/, "no extra tab stops");
  }
});

test("tool logos: original marks, bounded size, names exposed as labels", () => {
  const html = render(withPoster);
  const list =
    html.match(/<ul\b[^>]*aria-label="เครื่องมือที่ต้องใช้"[^>]*>([\s\S]*?)<\/ul>/)?.[1] ??
    "";
  assert.ok(list, "runtime tool list is labelled");
  const named = [...list.matchAll(/role="img" aria-label="([^"]*)"/g)].map(
    (m) => m[1],
  );
  assert.deepEqual(named, ["Canvas 2D", "FFmpeg"]);
  const titles = [...list.matchAll(/<li\b[^>]*title="([^"]*)"/g)].map((m) => m[1]);
  assert.deepEqual(titles, ["Canvas 2D", "FFmpeg"]);
  const marks = [...html.matchAll(/class="tool-mark mark"[^>]*/g)];
  assert.equal(marks.length, 4, "2 runtime + 2 author marks");
  for (const m of marks) {
    const size = Number(m[0].match(/width(?:="|:)(\d+)/)?.[1]);
    assert.ok(size >= 16 && size <= 22, `mark size ${size}`);
  }

  // Author marks are the sourced files, with visible names beside them.
  const authors =
    html.match(/<ul\b[^>]*aria-label="ผู้เขียนโค้ด"[^>]*>([\s\S]*?)<\/ul>/)?.[1] ??
    "";
  assert.match(authors, /src="\/tool-icons\/claudecode\.svg"/);
  assert.match(authors, /src="\/tool-icons\/codex\.svg"/);
  assert.match(authors, /Claude Code/);
  assert.match(authors, /Codex CLI/);
});

test("no-media card is honest: no artwork, real requirements, same names", () => {
  const html = render(noMedia);
  const article = tags(html, "article")[0] ?? "";
  assert.equal(attr(article, "data-media"), "none");
  // Only tool-logo images may appear; nothing stands in for a preview.
  for (const img of tags(html, "img"))
    assert.match(attr(img, "src") ?? "", /^\/tool-icons\//);
  assert.doesNotMatch(html, /<video\b|previews\//);

  const preview = tags(html, "button").find((b) => /card-preview/.test(b)) ?? "";
  assert.match(attr(preview, "class") ?? "", /without-media/);
  assert.equal(attr(preview, "aria-label"), "ดูผลงาน Thai Calm Narrator");
  const inner =
    html.match(/<button\b[^>]*card-preview[^>]*>([\s\S]*?)<\/button>/)?.[1] ??
    "";
  assert.match(inner, /เวิร์กโฟลว์เสียงไทย/);
  assert.match(inner, /ยังไม่มีสื่อพรีวิว/);

  for (const item of noMedia.requirements) assert.ok(html.includes(item), item);
  // No examples → no invented authors.
  assert.doesNotMatch(html, /aria-label="ผู้เขียนโค้ด"/);
  assert.match(html, /href="\/skills\/thai-narrator"/);
});

test("captions no-media card names its own workflow", () => {
  const html = render(bySlug("captions-overlay"));
  assert.match(html, /เวิร์กโฟลว์ซับไตเติล/);
  assert.match(html, /ยังไม่มีสื่อพรีวิว/);
});

test("cards show the badges people care about, not the internal status (2026-11-06)", () => {
  // The catalogue status stays on the skill page.
  assert.doesNotMatch(render(withPoster), />ฉบับทดลอง</);
  assert.match(render(bySlug("freshstack-what-if")), />โหลดฟรี</);
  assert.match(render(bySlug("low-poly-urban")), />ยังไม่เปิดโหลด</);
  assert.match(render(noMedia), />ไม่ต้องใช้ API key</);
});

test("preview button calls onSelectSkill with the stable slug", () => {
  const find = (node: ReactNode): { onClick?: () => void } | undefined => {
    if (!isValidElement(node)) return undefined;
    const props = node.props as {
      onClick?: () => void;
      className?: string;
      children?: ReactNode;
    };
    if (node.type === "button" && /card-preview/.test(props.className ?? ""))
      return props;
    const kids = ([] as ReactNode[]).concat(props.children ?? []);
    for (const kid of kids) {
      const hit = find(kid);
      if (hit) return hit;
    }
    return undefined;
  };
  for (const skill of [withPoster, noMedia]) {
    const calls: string[] = [];
    const tree = MediaSkillCard({ skill, onSelectSkill: (s) => calls.push(s) });
    const button = find(tree);
    assert.ok(button?.onClick, "preview button has a click handler");
    button.onClick();
    assert.deepEqual(calls, [skill.slug]);
  }
});

test("slugs are encoded in every href", () => {
  const odd: Skill = { ...withPoster, slug: "a b/ไทย?x=1#y" };
  const html = render(odd);
  const enc = encodeURIComponent(odd.slug);
  assert.ok(html.includes(`href="/skills/${enc}"`), html);
  assert.ok(html.includes(`href="/skills/${enc}#download"`), html);
});
