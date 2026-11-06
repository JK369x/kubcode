import { test } from "node:test";
import assert from "node:assert/strict";
import { skills, styles } from "../lib/catalog";
import { loadContent } from "../lib/content";

const catalogNames: Record<string, string> = {
  "growkaz-stickman": "Stickman Cinema",
  "thai-survival": "Survival Stories",
  "freshstack-what-if": "What If Lab",
  "low-poly-urban": "Low-poly Urban",
  "thai-jk-voice": "Thai Voice",
  "captions-overlay": "Captions Overlay",
};

const styleNames: Record<string, string> = {
  "freshstack-what-if": "What If Lab",
  "genhaha-horror-story": "Midnight Stories",
  "genhaha-map-story": "Map Stories",
  "growkaz-stickman": "Stickman Cinema",
  "low-poly-urban": "Low-poly Urban",
  "thai-survival": "Survival Stories",
};

// Person, creator or upstream/model brand tokens that must not appear in public display names.
const bannedDisplayTokens = [
  /growkaz/i,
  /genhaha/i,
  /freshstack/i,
  /\bjk\b/i,
  /claude/i,
  /codex/i,
  /opencode/i,
  /\bglm\b/i,
];

test("catalog keeps the same stable slugs in the same order", () => {
  assert.deepEqual(
    skills.map((s) => s.slug),
    Object.keys(catalogNames),
  );
  assert.equal(skills.length, Object.keys(catalogNames).length);
});

test("catalog display names match the descriptive naming map", () => {
  for (const s of skills) {
    assert.equal(s.name, catalogNames[s.slug], `catalog name for ${s.slug}`);
  }
});

test("style register keeps the same stable ids in the same order", () => {
  assert.deepEqual(
    styles.map((s) => s.id),
    Object.keys(styleNames),
  );
  assert.equal(styles.length, Object.keys(styleNames).length);
});

test("style display names match the descriptive naming map", () => {
  for (const s of styles) {
    assert.equal(s.name, styleNames[s.id], `style name for ${s.id}`);
  }
});

test("catalog and style register agree on shared names", () => {
  for (const s of skills) {
    const style = styles.find((st) => st.id === s.slug);
    if (style) assert.equal(style.name, s.name, `shared name for ${s.slug}`);
  }
});

test("no person or upstream brand names in public display names", () => {
  const names = [...skills.map((s) => s.name), ...styles.map((s) => s.name)];
  for (const name of names) {
    for (const token of bannedDisplayTokens) {
      assert.doesNotMatch(name, token, `display name "${name}"`);
    }
    assert.doesNotMatch(
      name,
      /—/,
      `display name "${name}" keeps no author suffix`,
    );
  }
});

test("genuine author and model attribution is preserved", () => {
  const ex = (slug: string, id: string) => {
    const skill = skills.find((s) => s.slug === slug);
    assert.ok(skill, `skill ${slug} exists`);
    const example = skill.examples.find((e) => e.id === id);
    assert.ok(example, `example ${slug}/${id} exists`);
    return example;
  };
  for (const slug of ["growkaz-stickman", "thai-survival"]) {
    assert.equal(ex(slug, "claude").author, "Claude Code");
    assert.equal(ex(slug, "claude").model, "claude-opus-5-5");
    assert.equal(ex(slug, "codex").author, "Codex CLI");
    assert.equal(ex(slug, "codex").model, "gpt-6.1-sol");
  }
  assert.equal(ex("freshstack-what-if", "glm").author, "OpenCode");
  assert.equal(
    ex("freshstack-what-if", "glm").model,
    "opencode/glm-5.3-flash-free",
  );
  assert.equal(ex("low-poly-urban", "study").author, "JK local study");
});

test("example media paths still use the stable slug prefix", () => {
  let checked = 0;
  for (const s of skills) {
    for (const e of s.examples) {
      for (const path of [e.video, e.poster]) {
        if (!path) continue;
        assert.ok(
          path.startsWith(`/previews/${s.slug}`),
          `${s.slug}/${e.id} path ${path}`,
        );
        checked++;
      }
    }
  }
  const expected = skills
    .flatMap((s) => s.examples)
    .reduce((n, e) => n + (e.video ? 1 : 0) + (e.poster ? 1 : 0), 0);
  assert.equal(checked, expected);
  assert.ok(checked > 0);
});

test("style metadata tags keep model/author identities", () => {
  const tags = (id: string) => styles.find((s) => s.id === id)?.tags ?? [];
  assert.ok(tags("growkaz-stickman").includes("claude"));
  assert.ok(tags("growkaz-stickman").includes("codex"));
  assert.ok(tags("thai-survival").includes("claude"));
  assert.ok(tags("freshstack-what-if").includes("glm"));
});

test("article prose uses the new display names", () => {
  // The two articles migrated from lib/articles.ts; newer articles may name
  // upstream publishers (e.g. FreshStack) when crediting sources.
  const migrated = ["style-author-renderer", "install-with-permissions"];
  const prose = JSON.stringify(loadContent().articles.filter((a) => migrated.includes(a.slug)));
  for (const name of [
    "Stickman Cinema",
    "Survival Stories",
    "What If Lab",
    "Thai Voice",
  ]) {
    assert.ok(prose.includes(name), `article mentions ${name}`);
  }
  for (const old of ["GrowKaz", "Thai Survival", "FreshStack"]) {
    assert.ok(!prose.includes(old), `article no longer mentions ${old}`);
  }
  // Technical facts unchanged.
  for (const fact of [
    "Canvas",
    "Chromium",
    "Python",
    "HyperFrames",
    "React SVG",
    "Remotion",
    "MLX",
  ]) {
    assert.ok(prose.includes(fact), `article keeps ${fact}`);
  }
});
