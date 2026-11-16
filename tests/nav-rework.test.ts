// Owner review 2026-11-16: header IA, theme switch, dashboard, badges.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { LEARN_LINKS, PRICING_LINK, isCurrent } from "../lib/main-links";

const read = (f: string) => readFileSync(f, "utf8");
const lum = (h: string) => {
  const v = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((x) => (x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
  return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
};
const ratio = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};

test("content pages are one 'เรียนรู้' group with a line each; ราคา stays top-level", () => {
  assert.deepEqual(LEARN_LINKS.map((l) => l.label), ["คลังทักษะ", "บทความ", "เครื่องมือ", "ชุมชน"]);
  for (const l of LEARN_LINKS) assert.ok(l.desc.length > 10, l.label);
  assert.equal(PRICING_LINK.href, "/pricing");
  const nav = read("components/site/HeaderNav.tsx");
  assert.match(nav, /<NavigationMenuTrigger[^>]*>เรียนรู้<\/NavigationMenuTrigger>/);
  assert.match(nav, /LEARN_LINKS\.map/);
  assert.match(nav, /PRICING_LINK\.label/);
  assert.equal(isCurrent("/", "/articles"), false);
  assert.equal(isCurrent("/articles", "/articles/x"), true);
  assert.equal(isCurrent("/account", "/account/posts"), false);
});

test("theme switch: 40px icon button with a name and aria-pressed; moves to the far right and the phone sheet", () => {
  const t = read("components/ThemeToggle.tsx");
  assert.match(t, /aria-pressed=\{theme === "light"\}/);
  assert.match(t, /"Light: เปลี่ยนเป็นธีมสว่าง"/);
  const css = read("app/globals.css");
  assert.match(css, /\.theme-switch \{[^}]*width: 40px;[^}]*height: 40px;/);
  assert.match(css, /prefers-reduced-motion: reduce\) \{\s*\.theme-switch,[^}]*transition: none;/);
  const layout = read("app/layout.tsx");
  assert.ok(layout.indexOf("<AccountMenu />") < layout.indexOf("<ThemeToggle />"), "theme after the account controls (far right)");
  assert.doesNotMatch(layout.slice(layout.indexOf('className="header-links"'), layout.indexOf("</span>", layout.indexOf('className="header-links"'))), /ThemeToggle/);
});

test("status badges never look disabled: every status pill ≥ 6:1", () => {
  const b = read("components/ui/badge.tsx");
  for (const v of ["ok", "warn", "info", "neutral"]) {
    const m = b.match(new RegExp(`${v}: "bg-\\[(#[0-9a-f]{6})\\] text-\\[(#[0-9a-f]{6})\\]"`, "i"));
    assert.ok(m, v);
    assert.ok(ratio(m![1], m![2]) >= 6, `${v} ${ratio(m![1], m![2]).toFixed(2)}`);
  }
  // Delivery statuses use status pills, not the grey 'secondary'.
  assert.doesNotMatch(read("components/PostsList.tsx"), /variant: "secondary"/);
  assert.doesNotMatch(read("app/account/page.tsx"), /variant: "secondary"/);
});

test("onboarding: a finished checklist is one slim line, not a card", () => {
  const src = read("components/OnboardingChecklist.tsx");
  assert.match(src, /if \(data\.complete\) \{[\s\S]*?<p className="[^"]*rounded-full[^"]*" role="status">[\s\S]*?ตั้งค่าครบแล้ว/);
  assert.doesNotMatch(src, /\{data\.complete \? "ตั้งค่าครบแล้ว"/);
});

test("tool cards read as links: full-ink title, icon tile, chevron, hover lift", () => {
  const src = read("components/AccountShortcuts.tsx");
  assert.match(src, /<strong className="[^"]*text-foreground/);
  assert.match(src, /<ChevronRight/);
  assert.match(src, /hover:-translate-y-0\.5/);
  assert.match(src, /motion-reduce:hover:translate-y-0/);
});

test("dashboard: greeting, plan, channels, recent posts and the main action at the top", () => {
  const page = read("app/account/page.tsx");
  assert.match(page, /สวัสดี \{display\}/);
  assert.match(page, /โพสต์ล่าสุด/);
  assert.match(page, /ช่องของคุณ/);
  assert.match(page, /getPostsView\(/);
  const head = page.slice(page.indexOf("styles.dashHead"), page.indexOf("</header>", page.indexOf("styles.dashHead")));
  assert.match(head, /href="\/account\/posts\/new"/);
});
