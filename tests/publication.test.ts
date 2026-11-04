import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createElement } from "react";
import { renderToStaticMarkup as renderReactMarkup } from "react-dom/server";

// Node cannot load CSS modules; stub them as identity class maps before
// requiring components (tsx compiles this file as CommonJS).
const NodeModule = require("node:module") as {
  _extensions: Record<string, (m: { exports: unknown }) => void>;
};
NodeModule._extensions[".css"] = (m) => {
  m.exports = new Proxy(
    {},
    { get: (_t, key) => (key === "__esModule" ? false : String(key)) },
  );
};

const render = (node: Parameters<typeof renderReactMarkup>[0]) =>
  renderReactMarkup(node).replace(
    /<link\b(?=[^>]*rel="preload")(?=[^>]*as="image")[^>]*\/>/g,
    "",
  );

const { skills } = require("../lib/catalog") as typeof import("../lib/catalog");
const { MediaSkillCard } =
  require("../components/MediaSkillCard") as typeof import("../components/MediaSkillCard");
const { KineticHero } =
  require("../components/KineticHero") as typeof import("../components/KineticHero");
type Skill = (typeof skills)[number];

/* ------------------------------------------------ build-context probe */

/**
 * Loads the real catalog in a fresh process with the given build env, the
 * same values Next inlines at build time, and reports every media URL that
 * the exported catalog (and its derived covers) would put on the page.
 */
function exportedMedia(env: { NODE_ENV?: string; NEXT_PUBLIC_MEDIA_MODE?: string }) {
  const inherited = Object.entries(process.env).filter(
    ([key]) => key !== "NODE_ENV" && key !== "NEXT_PUBLIC_MEDIA_MODE",
  );
  // Test-only probe values (e.g. an unknown NODE_ENV) are deliberately
  // outside Next's NODE_ENV union, so widen the type for the child process.
  const childEnv = {
    ...Object.fromEntries(inherited),
    ...env,
  } as unknown as NodeJS.ProcessEnv;
  const script = [
    'import { skills, PREVIEW_NOTICE } from "./lib/catalog";',
    'import { coverFor } from "./lib/media-covers";',
    "const urls = skills.flatMap((s) => [",
    "  ...s.examples.flatMap((e) => [e.video, e.poster]),",
    "  coverFor(s),",
    "]).filter(Boolean);",
    "console.log(JSON.stringify({ urls, slugs: skills.map((s) => s.slug), notice: PREVIEW_NOTICE }));",
  ].join("\n");
  const out = execFileSync("./node_modules/.bin/tsx", ["-e", script], {
    encoding: "utf8",
    env: childEnv,
  });
  return JSON.parse(out.trim().split("\n").pop()!) as { urls: string[]; slugs: string[]; notice: string };
}

const LOCAL_SLUGS = skills.map((s) => s.slug);

test("public release identifies withheld public media rather than claiming a local-only deployment", () => {
  const published = exportedMedia({ NODE_ENV: "production", NEXT_PUBLIC_MEDIA_MODE: "licensed-only" });
  assert.equal(published.notice, "PUBLIC_PREVIEW_MEDIA_WITHHELD_PENDING_RIGHTS");
  const local = exportedMedia({ NODE_ENV: "production", NEXT_PUBLIC_MEDIA_MODE: "local-study" });
  assert.equal(local.notice, "LOCAL_PREVIEW_NOT_CLEARED_FOR_DISTRIBUTION");
});

test("production build with no media mode publishes no preview media (fail closed)", () => {
  const { urls, slugs } = exportedMedia({ NODE_ENV: "production" });
  assert.deepEqual(urls, [], "production default must not expose uncleared media");
  assert.deepEqual(slugs, LOCAL_SLUGS, "ids/order stay stable");
});

test("explicit licensed-only mode publishes no media even outside production", () => {
  for (const NODE_ENV of ["production", "development", "test"]) {
    const { urls } = exportedMedia({ NODE_ENV, NEXT_PUBLIC_MEDIA_MODE: "licensed-only" });
    assert.deepEqual(urls, [], NODE_ENV);
  }
});

test("unknown media mode in production fails closed", () => {
  for (const mode of ["public", "LOCAL-STUDY", "local-study ", "true", "1"]) {
    const { urls } = exportedMedia({ NODE_ENV: "production", NEXT_PUBLIC_MEDIA_MODE: mode });
    assert.deepEqual(urls, [], JSON.stringify(mode));
  }
});

test("explicit local-study production build keeps every local preview", () => {
  const local = exportedMedia({ NODE_ENV: "production", NEXT_PUBLIC_MEDIA_MODE: "local-study" });
  const dev = exportedMedia({ NODE_ENV: "development" });
  assert.ok(local.urls.length >= 9, String(local.urls.length));
  assert.deepEqual(local.urls, dev.urls);
});

/* ------------------------------------------------ no-media presentation */

/** The shape a public build exports: examples present, media withheld. */
const withheld = (skill: Skill): Skill => ({
  ...skill,
  examples: skill.examples.map(({ video: _v, poster: _p, ...rest }) => ({
    ...rest,
    mediaWithheld: "rights-pending" as const,
  })),
});

test("no-media card names the skill's real category, not captions", () => {
  const html = render(
    createElement(MediaSkillCard, {
      skill: withheld(skills.find((s) => s.slug === "growkaz-stickman")!),
      onSelectSkill: () => {},
    }),
  );
  assert.match(html, /data-media="none"/);
  assert.doesNotMatch(html, /ซับไตเติล/);
  assert.match(html, /วิดีโอ \/ ภาพ/);
  assert.match(html, /รอยืนยันสิทธิ์/);
  assert.doesNotMatch(html, /<video\b|previews\//);
});

test("hero without publishable works shows a rights-pending notice, no dead stage controls", () => {
  const html = render(
    createElement(
      KineticHero,
      { skills: skills.map(withheld), activeSlug: "", onSelectSkill: () => {} },
      createElement("span", { className: "slot" }, "SEARCH"),
    ),
  );
  assert.match(html, /SEARCH/, "browse/search actions stay");
  assert.match(html, /รอยืนยันสิทธิ์เผยแพร่/);
  assert.doesNotMatch(html, /aria-label="ผลงานจริงในคลัง"/);
  assert.doesNotMatch(html, /เลื่อนไปงาน|data-motion-toggle|ปัดเพื่อดูงานอื่น/);
  assert.doesNotMatch(html, /ดูงานจริง|ผลงานจริง/, "no claim of visible real work");
  assert.doesNotMatch(html, /<img\b|<video\b/);
});

/* ------------------------------------------------ pure policy helpers */

const pub = require("../lib/publication") as typeof import("../lib/publication");
const { rawSkills } = require("../lib/catalog") as typeof import("../lib/catalog");
const { coverFor, MEDIA_COVERS } =
  require("../lib/media-covers") as typeof import("../lib/media-covers");

const ALL_RAW_MEDIA = rawSkills
  .flatMap((s) => [
    ...s.examples.flatMap((e) => [e.video, e.poster]),
    MEDIA_COVERS[s.slug]?.poster,
  ])
  .filter((u): u is string => typeof u === "string");

const mediaOf = (list: readonly Skill[]) =>
  list.flatMap((s) => s.examples.flatMap((e) => [e.video, e.poster])).filter(Boolean);

test("resolveMediaPolicy: production default deny, explicit modes, unknown fails closed", () => {
  const r = (nodeEnv: string | undefined, mode: string | undefined) =>
    pub.resolveMediaPolicy({ nodeEnv, mode });
  assert.equal(r("production", undefined), "licensed-only");
  assert.equal(r("production", ""), "licensed-only");
  assert.equal(r("production", "local-study"), "local-study");
  assert.equal(r("production", "licensed-only"), "licensed-only");
  assert.equal(r("staging", undefined), "licensed-only", "unknown NODE_ENV");
  for (const env of ["development", "test", undefined]) {
    assert.equal(r(env, undefined), "local-study", String(env));
    assert.equal(r(env, "licensed-only"), "licensed-only", "licensed-only overrides local");
    assert.equal(r(env, "Local-Study"), "licensed-only", "unknown value fails closed");
  }
});

test("published allowlist starts empty and exposes none of the actual previews", () => {
  assert.equal(pub.PUBLISHED_MEDIA.size, 0);
  assert.ok(ALL_RAW_MEDIA.length >= 9);
  for (const url of ALL_RAW_MEDIA) {
    assert.equal(pub.isPublishable(url, "licensed-only"), false, url);
  }
  const published = pub.publishSkills(rawSkills, "licensed-only");
  assert.deepEqual(mediaOf(published), []);
  for (const skill of published) {
    assert.equal(coverFor(skill, "licensed-only"), undefined, skill.slug);
    // Even a raw (unfiltered) skill cannot leak media through coverFor.
    const raw = rawSkills.find((s) => s.slug === skill.slug)!;
    assert.equal(coverFor(raw, "licensed-only"), undefined, skill.slug);
  }
});

test("allowlist matching is exact string equality", () => {
  const url = "/previews/low-poly-urban.png";
  const allow = new Set([url]);
  assert.equal(pub.isPublishable(url, "licensed-only", allow), true);
  for (const near of [
    "/previews/low-poly-urban.PNG",
    "previews/low-poly-urban.png",
    "/previews/low-poly-urban.png?x=1",
    "/previews/low-poly-urban.png ",
    "/previews/low-poly-urban",
    "/previews/",
  ]) {
    assert.equal(pub.isPublishable(near, "licensed-only", allow), false, near);
  }
  assert.equal(pub.isPublishable(undefined, "local-study"), false);
  assert.equal(pub.isPublishable(null, "local-study"), false);
});

test("local-study keeps the catalog unchanged", () => {
  // tsx test runs have no NODE_ENV/mode: the exported catalog is the raw one.
  assert.equal(pub.MEDIA_POLICY, "local-study");
  assert.deepEqual(skills, rawSkills);
  assert.deepEqual(pub.publishSkills(rawSkills, "local-study"), rawSkills);
  for (const skill of rawSkills) {
    const cover = MEDIA_COVERS[skill.slug];
    assert.equal(
      coverFor(skill, "local-study"),
      cover && skill.examples.some((e) => e.video === cover.video)
        ? cover.poster
        : skill.examples.find((e) => e.poster)?.poster,
    );
  }
});

test("licensed-only never mutates raw data and keeps ids, order and attribution", () => {
  const before = JSON.stringify(rawSkills);
  const published = pub.publishSkills(rawSkills, "licensed-only");
  assert.equal(JSON.stringify(rawSkills), before);
  assert.deepEqual(published.map((s) => s.slug), rawSkills.map((s) => s.slug));
  published.forEach((skill, i) => {
    const raw = rawSkills[i];
    assert.notEqual(skill, raw);
    const { examples: _a, ...meta } = skill;
    const { examples: _b, ...rawMeta } = raw;
    assert.deepEqual(meta, rawMeta, raw.slug);
    assert.equal(skill.examples.length, raw.examples.length);
    skill.examples.forEach((example, j) => {
      const orig = raw.examples[j];
      assert.notEqual(example, orig);
      assert.equal(example.id, orig.id);
      for (const key of ["author", "model", "renderer", "voice"] as const) {
        assert.equal(example[key], orig[key]);
      }
      assert.ok(!("poster" in example) && !example.video, "media removed, not hidden");
      assert.equal(example.mediaWithheld, "rights-pending");
      // No claim of a real/playable sample once media is gone.
      assert.doesNotMatch(example.label + example.notes, /ตัวอย่างจริง|portrait|teaser|export|8s/i);
      assert.match(example.label, /รอยืนยันสิทธิ์/);
    });
  });
  assert.ok(!pub.hasWithheldMedia(published.find((s) => s.slug === "thai-jk-voice")!));
  assert.ok(pub.hasWithheldMedia(published.find((s) => s.slug === "growkaz-stickman")!));
});

test("partial approval keeps only the approved file and says what is withheld", () => {
  const skill = rawSkills.find((s) => s.slug === "low-poly-urban")!;
  const allow = new Set([skill.examples[0].poster!]);
  const [example] = pub.publishSkills([skill], "licensed-only", allow)[0].examples;
  assert.equal(example.poster, skill.examples[0].poster);
  assert.equal(example.video, undefined);
  assert.equal(example.label, skill.examples[0].label);
  assert.equal(example.notes, pub.VIDEO_WITHHELD_NOTE);
});

test("approving a source video does not approve its derived cover", () => {
  for (const [slug, cover] of Object.entries(MEDIA_COVERS)) {
    const raw = rawSkills.find((s) => s.slug === slug)!;
    const videoOnly = new Set([cover.video]);
    const published = pub.publishSkills([raw], "licensed-only", videoOnly)[0];
    assert.ok(published.examples.some((e) => e.video === cover.video), "video kept");
    assert.equal(coverFor(published, "licensed-only", videoOnly), undefined, slug);
    assert.equal(coverFor(raw, "licensed-only", videoOnly), undefined, slug);

    // A cover approved on its own still needs its published source video.
    assert.equal(coverFor(raw, "licensed-only", new Set([cover.poster])), undefined);
    const both = new Set([cover.poster, cover.video]);
    const withBoth = pub.publishSkills([raw], "licensed-only", both)[0];
    assert.equal(coverFor(withBoth, "licensed-only", both), cover.poster);
  }
});

test("no-examples skills keep their own honest no-media copy", () => {
  const card = (slug: string) =>
    render(
      createElement(MediaSkillCard, {
        skill: skills.find((s) => s.slug === slug)!,
        onSelectSkill: () => {},
      }),
    );
  assert.match(card("thai-jk-voice"), /เวิร์กโฟลว์เสียงไทย/);
  assert.match(card("captions-overlay"), /เวิร์กโฟลว์ซับไตเติล/);
  for (const slug of ["thai-jk-voice", "captions-overlay"]) {
    assert.match(card(slug), /ยังไม่มีสื่อพรีวิว/);
    assert.doesNotMatch(card(slug), /รอยืนยันสิทธิ์/);
  }
});

test("local-study hero keeps the original full-media stage", () => {
  const html = render(
    createElement(KineticHero, { skills, activeSlug: "", onSelectSkill: () => {} }),
  );
  assert.match(html, /ดูงานจริง/);
  assert.match(html, /aria-label="ผลงานจริงในคลัง"/);
  assert.match(html, /data-motion-toggle/);
  assert.doesNotMatch(html, /data-media="none"|รอยืนยันสิทธิ์/);
});

test("product logos are references, not example media: one exact path per tool, in every policy", async () => {
  const { isProductLogoPath, isPublishable } = await import("../lib/publication");
  assert.equal(isProductLogoPath("/tools/remotion/logo.svg", "remotion"), true);
  assert.equal(isProductLogoPath("/tools/remotion/logo.png", "remotion"), true);
  // Never another tool's folder, a preview/poster, a nested path or a hotlink.
  for (const url of ["/tools/ffmpeg/logo.svg", "/previews/remotion.png", "/tools/remotion/x/logo.svg", "/tools/remotion/logo.svg?x", "https://remotion.dev/logo.svg"]) {
    assert.equal(isProductLogoPath(url, "remotion"), false, url);
  }
  // The example-media allowlist is unchanged by logos: still closed in licensed-only.
  assert.equal(isPublishable("/tools/remotion/logo.svg", "licensed-only"), false);
});
