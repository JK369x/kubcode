import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

// Node cannot load CSS modules; stub them as identity class maps.
const NodeModule = require("node:module") as {
  _extensions: Record<string, (m: { exports: unknown }) => void>;
};
NodeModule._extensions[".css"] = (m) => {
  m.exports = new Proxy({}, { get: (_t, key) => (key === "__esModule" ? false : String(key)) });
};

const { getPathMatch } = require("next/dist/shared/lib/router/utils/path-match") as {
  getPathMatch: (p: string, o?: object) => (pathname: string) => false | object;
};
const { matchHas } = require("next/dist/shared/lib/router/utils/prepare-destination") as {
  matchHas: (req: object, query: object, has?: object[], missing?: object[]) => false | object;
};
const config = (require("../next.config") as { default: import("next").NextConfig }).default;
const { IMMUTABLE, SHORT, IMAGE_MIN_CACHE_TTL, versioned } =
  require("../lib/cache-headers") as typeof import("../lib/cache-headers");
const { SHOWCASE_MANIFEST } = require("../lib/showcase-manifest") as typeof import("../lib/showcase-manifest");
const { publishedShowcase, visualShelf } = require("../lib/showcase") as typeof import("../lib/showcase");

type Rule = { source: string; has?: object[]; missing?: object[]; headers: { key: string; value: string }[] };

/** Cache-Control values Next would send for a URL, using Next's own matchers. */
async function cacheControl(url: string): Promise<string[]> {
  const rules = (await config.headers!()) as Rule[];
  const u = new URL(url, "http://x");
  const query = Object.fromEntries(u.searchParams);
  const req = { headers: {}, cookies: {} };
  return rules
    .filter((r) => getPathMatch(r.source, { strict: true, removeUnnamedParams: true, regexModifier: (x: string) => x })(u.pathname))
    .filter((r) => matchHas(req, query, r.has, r.missing))
    .flatMap((r) => r.headers.filter((h) => h.key.toLowerCase() === "cache-control").map((h) => h.value));
}

const someShowcase = SHOWCASE_MANIFEST.find((e) => e.preview)!;

test("cache policy per public path: immutable only where the URL never changes content", async () => {
  const cases: [string, string | undefined][] = [
    // Covers get a new file name when replaced (docs/covers.md).
    ["/covers/install-with-permissions/cover-v3.jpg", IMMUTABLE],
    ["/covers/make-short-blender/og.jpg", IMMUTABLE],
    // Metadata is edited in place.
    ["/covers/make-short-blender/cover.json", undefined],
    // Showcase files are rewritten in place by `npm run showcase`: only the
    // content-hashed URL is immutable.
    [versioned(someShowcase.poster.src, someShowcase.poster.sha256), IMMUTABLE],
    [versioned(someShowcase.preview!.src, someShowcase.preview!.sha256), IMMUTABLE],
    [someShowcase.poster.src, SHORT],
    [someShowcase.preview!.src, SHORT],
    // Logos and icons can be swapped under the same name.
    ["/tools/blender/logo.png", SHORT],
    ["/tools/opencode/logo.svg", SHORT],
    ["/tool-icons/react.svg", SHORT],
    ["/platform-icons/youtube.svg", SHORT],
    ["/kubcode-icon.png", SHORT],
    // Pages and APIs keep Next's own policy.
    ["/", undefined],
    ["/articles/install-with-permissions", undefined],
    ["/api/auth/session", undefined],
  ];
  for (const [url, want] of cases) {
    const got = await cacheControl(url);
    assert.deepEqual(got, want ? [want] : [], url);
  }
});

test("the SVG logo sandbox still applies next to the cache rule", async () => {
  const rules = (await config.headers!()) as Rule[];
  const svg = rules.find((r) => r.source === "/tools/:slug/logo.svg");
  assert.ok(svg?.headers.some((h) => h.key === "Content-Security-Policy" && /sandbox/.test(h.value)));
});

test("every cover image in public/ and in frontmatter is a versioned, never-overwritten name", () => {
  // Immutable caching relies on this rule: a replaced cover must get a new name.
  // The test cannot see history, so it guards the documented rule instead.
  const doc = fs.readFileSync("docs/covers.md", "utf8");
  assert.match(doc, /new names/);
  for (const dir of fs.readdirSync("public/covers")) {
    for (const f of fs.readdirSync(path.join("public/covers", dir))) assert.match(f, /^(cover|og)(-v\d+)?\.jpg$|^cover\.json$/, f);
  }
});

test("the image optimiser keeps results for 31 days and allows only the showcase ?v query", () => {
  assert.equal(IMAGE_MIN_CACHE_TTL, 2678400);
  assert.equal(config.images?.minimumCacheTTL, IMAGE_MIN_CACHE_TTL);
  assert.deepEqual(config.images?.formats, ["image/avif", "image/webp"]);
  const patterns = config.images?.localPatterns ?? [];
  assert.ok(patterns.some((p) => p.pathname === "/**" && p.search === ""));
  assert.ok(patterns.some((p) => p.pathname === "/showcase/**" && p.search === undefined));
});

test("showcase URLs carry the file's content hash, so a regenerated file is a new URL", () => {
  for (const item of publishedShowcase("licensed-only")) {
    const m = SHOWCASE_MANIFEST.find((e) => e.id === item.id)!;
    assert.equal(item.poster.src, `${m.poster.src}?v=${m.poster.sha256.slice(0, 12)}`);
    if (item.preview) assert.equal(item.preview.src, `${m.preview!.src}?v=${m.preview!.sha256.slice(0, 12)}`);
  }
});

test("Caddy does not override the app's cache headers", () => {
  const caddy = fs.readFileSync("infra/web/host/Caddyfile", "utf8");
  assert.doesNotMatch(caddy, /Cache-Control/i);
});

// ---------- components ----------

const strip = (html: string) => html.replace(/<link\b(?=[^>]*rel="preload")[^>]*\/>/g, "");
const imgs = (html: string) => [...html.matchAll(/<img\b[^>]*>/g)].map((m) => m[0]);
const attr = (tag: string, name: string) => tag.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1];

test("SkeletonImage: shimmer box, optimised srcset, lazy by default, eager and high priority when asked", () => {
  const { SkeletonImage } = require("../components/SkeletonImage") as typeof import("../components/SkeletonImage");
  const lazy = renderToStaticMarkup(createElement(SkeletonImage, { src: "/covers/x/cover-v2.jpg", alt: "", fill: true, sizes: "300px" }));
  assert.match(lazy, /^<span class="img-skeleton" aria-hidden="true"><\/span><img/);
  const [img] = imgs(lazy);
  assert.equal(attr(img, "loading"), "lazy");
  assert.equal(attr(img, "decoding"), "async");
  assert.equal(attr(img, "sizes"), "300px");
  assert.match(attr(img, "srcSet") ?? "", /\/_next\/image\?url=%2Fcovers%2Fx%2Fcover-v2\.jpg&amp;w=\d+/);
  // Server HTML never hides an image: without JS it simply paints.
  assert.doesNotMatch(img, /opacity|data-img-state="loading"/);

  const hero = strip(renderToStaticMarkup(createElement(SkeletonImage, { src: "/covers/x/cover-v2.jpg", alt: "a", fill: true, sizes: "100vw", preload: true, fetchPriority: "high" })));
  const [h] = imgs(hero);
  assert.notEqual(attr(h, "loading"), "lazy");
  assert.equal(attr(h, "fetchPriority"), "high");
});

test("SkeletonImg (third-party thumbnails): plain <img>, lazy, async, sized, no referrer", () => {
  const { SkeletonImg } = require("../components/SkeletonImage") as typeof import("../components/SkeletonImage");
  const html = renderToStaticMarkup(createElement(SkeletonImg, { src: "https://cdn.example/t.jpg", alt: "", width: 150, height: 188, referrerPolicy: "no-referrer" }));
  const [img] = imgs(html);
  assert.equal(attr(img, "src"), "https://cdn.example/t.jpg", "not proxied through our optimiser");
  assert.equal(attr(img, "loading"), "lazy");
  assert.equal(attr(img, "decoding"), "async");
  assert.equal(attr(img, "width"), "150");
  assert.equal(attr(img, "height"), "188");
  assert.equal(attr(img, "referrerPolicy"), "no-referrer");
});

test("homepage shelf: first two posters high priority, first six eager, the rest lazy; all sized", () => {
  const { VisualShelf } = require("../components/VisualShelf") as typeof import("../components/VisualShelf");
  const items = publishedShowcase("licensed-only");
  const html = strip(renderToStaticMarkup(createElement(VisualShelf, { items })));
  const posters = imgs(html).filter((t) => /class="poster"/.test(t));
  assert.ok(posters.length >= visualShelf(items).length * 2, "the looping track renders each style at least twice");
  posters.forEach((t, i) => {
    assert.match(t, /data-nimg="fill"/);
    assert.match(attr(t, "sizes") ?? "", /232px/);
    assert.equal(attr(t, "loading"), i < 6 ? "eager" : "lazy", `poster ${i}`);
    assert.equal(attr(t, "fetchPriority"), i < 2 ? "high" : undefined, `poster ${i}`);
  });
  // Each poster sits on a shimmer.
  assert.equal((html.match(/class="img-skeleton"/g) ?? []).length, posters.length);
});

test("every <img> in components is lazy or explicitly eager, async, and sized or in a sized box", () => {
  const dir = "components";
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".tsx"))) {
    const src = fs.readFileSync(path.join(dir, f), "utf8");
    if (f === "SkeletonImage.tsx") continue; // sets loading/decoding from props, defaults lazy/async
    // JSX tags only (an attribute on the next line or after a space), not prose in comments.
    for (const m of src.matchAll(/<img(\s+[a-zA-Z][\s\S]*?)\/>/g)) {
      const tag = m[1];
      assert.match(tag, /decoding=/, `${f}: decoding`);
      // Preview sizes its stage from the image's natural size (aspect-ratio).
      assert.match(tag, /width=|ref=\{imageRef\}/, `${f}: size`);
      // The account avatar is in the header (above the fold): left eager on purpose.
      if (f !== "AccountMenu.tsx" && f !== "Preview.tsx") assert.match(tag, /loading=/, `${f}: loading`);
    }
  }
});

test("skeletons: light and dark tokens, and still under reduced motion", () => {
  const css = fs.readFileSync("app/globals.css", "utf8");
  const block = css.slice(css.indexOf("loading skeletons"));
  assert.match(block, /var\(--surface-soft\)/, "theme token, so both themes work");
  assert.match(block, /@media \(prefers-reduced-motion: reduce\)\s*\{[^}]*\.img-skeleton[^}]*animation: none/);
});

test("client-fetched lists show skeleton rows while loading", () => {
  const { SkeletonRows } = require("../components/SkeletonImage") as typeof import("../components/SkeletonImage");
  const html = renderToStaticMarkup(createElement(SkeletonRows, { rows: 3, label: "กำลังโหลดคอมเมนต์" }));
  assert.equal((html.match(/class="skeleton-row"/g) ?? []).length, 3);
  assert.match(html, /role="status"/);
  assert.match(html, /กำลังโหลดคอมเมนต์/);
  for (const f of ["components/PageInteractions.tsx", "components/Community.tsx"]) {
    assert.match(fs.readFileSync(f, "utf8"), /<SkeletonRows\b/, f);
  }
  assert.match(fs.readFileSync("components/AutomationsPanel.tsx", "utf8"), /aria-busy="true"[\s\S]{0,400}img-skeleton/);
});
