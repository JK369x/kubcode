// Guards from the 2026-11-11 UI/UX audit (docs/design/uiux-audit-2026-11-11.md).
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const css = readFileSync("app/globals.css", "utf8");

test("route loading UI exists for the public detail/index routes, not under /account", () => {
  for (const p of [
    "app/articles/[slug]",
    "app/articles",
    "app/skills/[slug]",
    "app/tools/[slug]",
    "app/community",
  ]) {
    assert.ok(existsSync(`${p}/loading.tsx`), `${p}/loading.tsx`);
    assert.match(readFileSync(`${p}/loading.tsx`, "utf8"), /RouteSkeleton/);
  }
  // A loading boundary there would stream before notFound()/redirect() and
  // turn 404/307 into soft 200s.
  assert.equal(existsSync("app/account/loading.tsx"), false);
});

test("form-control outlines use --field-line / shadcn --input (>=3:1), defined for both themes", () => {
  for (const name of ["--field-line", "--input"]) {
    const dark = css.match(new RegExp(`:root \\{[^}]*${name}: (#[0-9a-f]{6})`))?.[1];
    const light = css.match(
      new RegExp(`:root\\[data-theme="light"\\] \\{[^}]*${name}: (#[0-9a-f]{6})`),
    )?.[1];
    assert.equal(dark, "#807394", name);
    assert.equal(light, "#857896", name);
  }
  assert.match(css, /\.search \{[^}]*border: 1px solid var\(--field-line\)/);
  for (const f of [
    "components/AutomationsPanel.module.css",
    "components/KeysSettings.module.css",
    "app/account/tiktok/studio.css",
  ])
    assert.match(readFileSync(f, "utf8"), /var\(--field-line\)/, f);
  // shadcn fields (Input/Textarea) draw their edge with border-input, never border-border.
  for (const f of ["components/ui/input.tsx", "components/ui/textarea.tsx"]) {
    const src = readFileSync(f, "utf8");
    assert.match(readFileSync("components/ui/input.tsx", "utf8"), /border-input/, f);
    assert.doesNotMatch(src, /border-border/, f);
  }
  assert.match(readFileSync("components/PageInteractions.tsx", "utf8"), /<Textarea\b/);
});

test("floating mobile comments bar reserves scroll padding so focus is not hidden under it", () => {
  const m = readFileSync("components/PageInteractions.module.css", "utf8");
  assert.match(
    m,
    /:global\(html\):has\(\.mobileBar\) \{\s*scroll-padding-bottom: 104px;/,
  );
  assert.match(
    m,
    /:global\(body\):has\(\.mobileBar\) \{\s*padding-bottom: 96px;/,
  );
});

test("theme toggle accessible name starts with its visible text (WCAG 2.5.3)", () => {
  const t = readFileSync("components/ThemeToggle.tsx", "utf8");
  assert.match(t, /"Light: เปลี่ยนเป็นธีมสว่าง"/);
  assert.match(t, /"Dark: เปลี่ยนเป็นธีมมืด"/);
});

test("design system master is linked for agents", () => {
  assert.ok(existsSync("design-system/kubcode/MASTER.md"));
  assert.match(
    readFileSync("AGENTS.md", "utf8"),
    /design-system\/kubcode\/MASTER\.md/,
  );
});
