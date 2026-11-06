// Every showcase card says which AI agent and model made the clip (owner,
// 2026-11-06), and a style's card uses its best picture: the clip's designed
// cover where one exists, else a chosen frame.
// Attribution evidence: the Codex and Claude Code session logs that built each
// clip's source folder, and Mute Touch's clip.json (writer: OpenCode GLM).
import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const NodeModule = require("node:module") as {
  _extensions: Record<string, (m: { exports: unknown }) => void>;
};
NodeModule._extensions[".css"] = (m) => {
  m.exports = new Proxy({}, { get: (_t, key) => (key === "__esModule" ? false : String(key)) });
};

const { SHOWCASE_ALLOWLIST, SHOWCASE_AGENTS } = require("../lib/showcase-allowlist") as typeof import("../lib/showcase-allowlist");
const { SHOWCASE_MANIFEST } = require("../lib/showcase-manifest") as typeof import("../lib/showcase-manifest");
const { publishedShowcase, cartoonShowcase, styleShelf } = require("../lib/showcase") as typeof import("../lib/showcase");
const { StyleShelf } = require("../components/StyleShelf") as typeof import("../components/StyleShelf");

const madeBy = (id: string) => SHOWCASE_ALLOWLIST.find((e) => e.id === id)?.madeBy;

test("every allowlisted clip names the agent and model that made it", async () => {
  const { getContent } = await import("../lib/content");
  const toolSlugs = new Set(getContent().tools.map((t) => t.slug));
  for (const e of SHOWCASE_ALLOWLIST) {
    assert.ok(e.madeBy, `${e.id}: needs madeBy`);
    assert.ok(SHOWCASE_AGENTS[e.madeBy.agent], `${e.id}: unknown agent ${e.madeBy.agent}`);
    assert.ok(toolSlugs.has(e.madeBy.agent), `${e.id}: no /tools/${e.madeBy.agent} page`);
    assert.match(e.madeBy.model, /^[a-z0-9][a-z0-9.\-/]+$/, `${e.id}: model id`);
  }
});

test("attributions match the evidence", () => {
  assert.deepEqual(madeBy("2026-10-25_zombie-condo_ep01_tomorrow-invasion"), { agent: "codex-cli", model: "gpt-6.1-sol" });
  assert.deepEqual(madeBy("2026-10-29_mall-infection_ep01_first-night"), { agent: "codex-cli", model: "gpt-6.1-sol" });
  assert.deepEqual(madeBy("2026-10-25_tech-podcast_ep01_cliparr"), { agent: "codex-cli", model: "gpt-6.1-sol" });
  assert.deepEqual(madeBy("2026-11-01_freshstack-what-if_ep03_internet-gone-week"), { agent: "claude-code", model: "claude-opus-5-5" });
  assert.deepEqual(madeBy("2026-11-01_what-if-studio_ep01_mute-touch"), { agent: "opencode", model: "glm-5.3-flash-free" });
});

test("published items carry madeBy", () => {
  for (const item of publishedShowcase("local-study")) assert.ok(item.madeBy, item.id);
});

test("low-poly is represented by a real episode, not the silent style study", () => {
  const cover = SHOWCASE_ALLOWLIST.find((e) => e.style === "low-poly" && e.cover);
  assert.equal(cover?.id, "2026-10-29_mall-infection_ep01_first-night");
});

test("sitcom cards use the designed episode covers, and the manifest says so", () => {
  for (const e of SHOWCASE_ALLOWLIST.filter((a) => a.style === "sitcom-toon")) {
    assert.equal(e.poster, "cover", e.id);
    assert.equal(SHOWCASE_MANIFEST.find((m) => m.id === e.id)?.poster.from, "cover", e.id);
  }
  for (const m of SHOWCASE_MANIFEST) {
    const a = SHOWCASE_ALLOWLIST.find((e) => e.id === m.id)!;
    assert.equal(m.poster.from, a.poster === "cover" ? "cover" : "frame", m.id);
  }
});

test("shelf cards show the cover clip's agent and model", () => {
  const items = cartoonShowcase(publishedShowcase("local-study"));
  const html = renderToStaticMarkup(createElement(StyleShelf, { items }));
  for (const { clip } of styleShelf(items)) {
    const by = clip.madeBy!;
    assert.ok(html.includes(`>${SHOWCASE_AGENTS[by.agent]}<`), `${clip.id}: agent name`);
    assert.ok(html.includes(`>${by.model}<`), `${clip.id}: model id`);
  }
});
