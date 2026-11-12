// shadcn/ui foundation (PR1 of the migration): Tailwind v4, brand tokens as
// shadcn variables, ding toasts. Rules: design-system/kubcode/MASTER.md.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const css = readFileSync("app/globals.css", "utf8");
const read = (f: string) => readFileSync(f, "utf8");
const block = (selector: RegExp) => css.match(selector)?.[1] ?? "";
const dark = block(/@layer base \{\s*\/\*[^*]*\*\/\s*:root \{([^}]*)\}/);
const light = block(/:root\[data-theme="light"\] \{([^}]*--background[^}]*)\}/);
const token = (b: string, name: string) => b.match(new RegExp(`\\s${name}: ([^;]+);`))?.[1];

test("shadcn variables carry the MASTER.md brand values in both themes", () => {
  const expected: Record<string, [string, string]> = {
    "--background": ["#100e15", "#faf8fd"],
    "--foreground": ["#f5f1fb", "#271c34"],
    "--card": ["#1b1722", "#ffffff"],
    "--primary": ["#d1b9ff", "#7136b9"],
    "--primary-foreground": ["#291640", "#ffffff"],
    "--secondary": ["#231d2d", "#e9dbff"],
    "--muted": ["#231d2d", "#efe9f8"],
    "--muted-foreground": ["#b8adca", "#6c5f7d"],
    "--destructive": ["#ffb4b4", "#a3262a"],
    "--border": ["#38303f", "#e0d9e9"],
    "--input": ["#807394", "#857896"],
    "--ring": ["#bb98ff", "#7136b9"],
  };
  for (const [name, [d, l]] of Object.entries(expected)) {
    assert.equal(token(dark, name), d, `dark ${name}`);
    assert.equal(token(light, name), l, `light ${name}`);
  }
  assert.equal(token(dark, "--radius"), "12px");
});

test("no shadcn grey defaults, pink, or Inter/Geist", () => {
  assert.doesNotMatch(css, /oklch\(/, "shadcn default palette left in globals.css");
  assert.doesNotMatch(css, /#ec4899/i);
  assert.match(css, /--font-sans: Anuphan, sans-serif;/);
  for (const f of ["app/layout.tsx", "app/globals.css"]) {
    assert.doesNotMatch(read(f), /\bInter\b|Geist|next\/font\/google/, f);
  }
});

test("theme switch stays data-theme on <html>; dark: maps to it, not to .dark", () => {
  assert.match(css, /@custom-variant dark \(&:where\(\[data-theme="dark"\], \[data-theme="dark"\] \*\)\);/);
  assert.doesNotMatch(css, /^\.dark \{/m);
  assert.match(read("app/layout.tsx"), /data-theme="dark"/);
});

test("legacy CSS sits in a cascade layer under utilities; reduced-motion rule kept", () => {
  assert.match(css, /^@layer theme, base, legacy, components, utilities;/m);
  assert.match(css, /^@layer legacy \{/m);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{\s*html \{\s*scroll-behavior: auto;\s*\}\s*\*,\s*\*::before,\s*\*::after \{\s*animation: none !important;\s*transition: none !important;/);
});

test("toaster: top-center, follows the system theme, Thai labels, mounted once in the root layout", async () => {
  const layout = read("app/layout.tsx");
  assert.equal(layout.match(/<Toaster\b/g)?.length, 1);
  assert.match(layout, /<Toaster position="top-center" theme="system" \/>/);
  const { TOAST_LABELS, pageNonce } = await import("../components/ui/toaster");
  assert.deepEqual(TOAST_LABELS, { region: "การแจ้งเตือน", dismiss: "ปิดการแจ้งเตือน" });
  // CSP: the nonce Next puts on its scripts is handed to ding's <style>.
  const doc = {
    querySelectorAll: () => [{ nonce: "" }, { nonce: "n0nce" }],
  } as unknown as Document;
  assert.equal(pageNonce(doc), "n0nce");
  assert.equal(pageNonce({ querySelectorAll: () => [] } as unknown as Document), undefined);
  // The toast takes our tokens and fonts, and the site theme over the OS one.
  assert.match(css, /\.tst-viewport \{[^}]*--tst-bg: var\(--popover\);[^}]*font-family: Anuphan/);
});

test("inline status lines are toasts now", () => {
  const files = [
    "components/PageInteractions.tsx",
    "components/CopyButton.tsx",
    "components/ChannelsPanel.tsx",
    "components/KeysSettings.tsx",
    "components/AutomationsPanel.tsx",
    "components/PublicNameForm.tsx",
    "components/CardDownloadAction.tsx",
    "components/VisualShelf.tsx",
    "components/YouTubePrivateUpload.tsx",
  ];
  for (const f of files) {
    const src = read(f);
    assert.match(src, /from "@\/components\/ui\/toaster"/, f);
    assert.doesNotMatch(src, /setStatus\(r\.message\)|setError\(message\)|setMessage\(/, f);
  }
  assert.match(read("components/PageInteractions.tsx"), /toast\.success\(done\)/);
  assert.match(read("components/PageInteractions.tsx"), /"ส่งคอมเมนต์แล้ว"/);
  assert.match(read("components/CopyButton.tsx"), /toast\.success\(/);
  // Connect callback notices show once, then leave the URL.
  const channels = read("components/ChannelsPanel.tsx");
  assert.match(channels, /searchParams\.delete\("notice"\)/);
  assert.match(channels, /history\.replaceState/);
});

test("shadcn Button/Input meet the size and focus rules", async () => {
  const { Button } = await import("../components/ui/button");
  const { Input } = await import("../components/ui/input");
  const b = renderToStaticMarkup(createElement(Button, null, "ส่ง"));
  assert.match(b, /\bh-11\b/, "44px on mobile");
  assert.match(b, /md:h-10/);
  assert.match(b, /focus-visible:outline-3/);
  assert.match(b, /focus-visible:outline-ring/);
  // outline-none (in the base classes) sets outline-style: none, so the focus
  // variant has to set the style back or the ring never paints.
  assert.match(b, /focus-visible:outline-solid/);
  assert.match(renderToStaticMarkup(createElement(Input)), /focus-visible:outline-solid/);
  assert.doesNotMatch(b, /ring-ring\/50/, "no half-transparent shadcn ring");
  const icon = renderToStaticMarkup(createElement(Button, { size: "icon", "aria-label": "ปิด" }));
  assert.match(icon, /size-11/);
  const i = renderToStaticMarkup(createElement(Input));
  assert.match(i, /text-base/, "16px on mobile: no iOS zoom");
  assert.match(i, /border-input/);
  assert.match(i, /h-11/);
  assert.doesNotMatch(read("components/ui/badge.tsx"), /text-xs|text-\[1[01]px\]/, "badge text >= 12px");
});

/* ---------------- PR2: cards, filters, shelves ---------------- */

test("home filters are shadcn ToggleGroups; link filters share the chip look", () => {
  const lib = read("components/Library.tsx");
  assert.match(lib, /<ToggleGroup\s+type="single"/);
  assert.match(lib, /onValueChange=\{\(id\) => id && onPick\(id\)\}/, "one chip always checked");
  for (const f of ["components/ArticleIndex.tsx", "components/ToolIndex.tsx"]) {
    assert.match(read(f), /aria-current=\{c\.active \? "page" : undefined\} className=\{chipVariants\(/, f);
  }
  const toggle = read("components/ui/toggle-variants.ts");
  assert.match(toggle, /h-11 px-4 md:h-10/, "44px chips on mobile");
  assert.match(toggle, /text-\[13px\]/, "13px Thai chips");
  assert.match(toggle, /aria-\[current=page\]:bg-primary/);
  assert.doesNotMatch(css, /\.categories button/, "old chip CSS removed");
});

test("cards use the shadcn Card; tool cards keep a meaningful --input edge", () => {
  assert.match(read("components/ToolCard.tsx"), /<Card as="article"/);
  assert.match(read("components/ArticleCard.tsx"), /<Card as="article" variant="cover"/);
  assert.match(read("components/MediaSkillCard.tsx"), /variant="media"/);
  const card = read("components/ui/card.tsx");
  assert.match(card, /border-input bg-card/);
  assert.match(card, /has-\[\[data-stretch\]:focus-visible\]:outline-ring/);
});

test("shelf actions and the pause control are shadcn Button / Toggle", () => {
  const shelf = read("components/VisualShelf.tsx");
  assert.match(shelf, /<Button asChild className=\{cn\(ACTION, ON_MEDIA_PRIMARY/);
  assert.match(shelf, /<Toggle\s+variant="outline"[\s\S]*?data-motion-toggle=""/);
  assert.match(shelf, /const ACTION = "h-11 /, "44px card actions on touch");
});

test("no text under 12px in the cards, shelves and filters (audit #7)", () => {
  const small = /font-size:\s*(?:[0-9]|1[01])(?:\.\d+)?px|font:\s*\d+\s+(?:[0-9]|1[01])(?:\.\d+)?px/;
  for (const f of [
    "components/VisualShelf.module.css",
    "components/ClipResults.module.css",
    "components/CardDownloadAction.module.css",
    "components/ToolIndex.module.css",
    "components/ArticleIndex.module.css",
    "components/MediaSkillCard.module.css",
  ]) assert.doesNotMatch(read(f), small, f);
  // globals.css: only the two allowed exceptions are left (MASTER.md §Typography).
  const left = [...css.matchAll(/([^{}]+)\{[^}]*font-size:\s*(?:[0-9]|1[01])px/g)].map((m) => m[1].trim().split("\n").pop()!.trim());
  assert.deepEqual(left, [".tool-logo-icon.is-monogram", ".categories .chip-en"]);
});

test("conditions link name starts with its visible word (WCAG 2.5.3, audit #4)", () => {
  assert.match(read("components/CardDownloadAction.tsx"), /const label = "เงื่อนไข: ดาวน์โหลด"/);
});

/* ---------------- PR3: article page, comments Sheet, account DropdownMenu ---------------- */

test("BreakableText: <wbr> after / - . in long URLs only; copied text is unchanged", async () => {
  const { BreakableText } = await import("../components/BreakableText");
  const text = "ช่วยติดตั้ง skill จาก https://github.com/kelano86/what-if-animation ตาม README\n1. ok";
  const html = renderToStaticMarkup(createElement("code", null, createElement(BreakableText, { text })));
  assert.match(html, /https:\/<wbr\/>\/<wbr\/>github\.<wbr\/>com\/<wbr\/>kelano86\/<wbr\/>what-<wbr\/>if-<wbr\/>animation/);
  assert.match(html, /ช่วยติดตั้ง skill จาก /, "short Thai words untouched");
  assert.equal(html.replace(/<wbr\/>/g, "").replace(/<\/?code>/g, ""), text.replace(/&/g, "&amp;"));
  // pre-wrap blocks no longer break anywhere mid-word.
  for (const sel of [".agent-install .code-block pre", ".get-started-prompt pre", ".detail-copy .steps .step-prompt pre"]) {
    const rule = css.slice(css.indexOf(sel + " {"));
    assert.match(rule.slice(0, rule.indexOf("}")), /overflow-wrap: break-word/, sel);
  }
});

test("mobile comments open in a shadcn bottom Sheet; Back still closes it", () => {
  const src = read("components/PageInteractions.tsx");
  assert.match(src, /<SheetContent side="bottom" closeLabel="ปิดคอมเมนต์"/);
  assert.match(src, /history\.pushState\(\{ \.\.\.history\.state, kbSheet: true \}/);
  assert.match(src, /addEventListener\("popstate"/);
  assert.doesNotMatch(src, /<dialog\b/);
  const sheet = read("components/ui/sheet.tsx");
  assert.match(sheet, /bg-black\/50/, "scrim keeps the foreground readable");
  assert.match(sheet, /size="icon"/, "44px close button");
});

test("account menu is a shadcn DropdownMenu with 44px items on mobile", () => {
  assert.match(read("components/AccountMenu.tsx"), /<DropdownMenuTrigger className=\{styles\.avatar\} aria-label=\{`บัญชีของ \$\{name\}`\}>/);
  const dd = read("components/ui/dropdown-menu.tsx");
  assert.match(dd, /min-h-11 /);
  assert.match(dd, /border-input bg-popover/);
  assert.match(dd, /focus-visible:outline-solid/);
});

test("article chrome meets the touch rules (audit #8)", () => {
  assert.match(read("components/FontSizeControl.tsx"), /const STEP = "h-11 w-11/);
  assert.match(read("components/TagList.tsx"), /chipVariants\(\{ size: "sm"/);
  assert.match(read("components/PageInteractions.tsx"), /const ACT = "h-11 /);
  assert.match(css, /\.toc-mobile summary \{[^}]*min-height: 44px/);
  assert.match(css, /\.crumbs a \{[^}]*min-height: 24px/);
});

test("toasts stay announced while a modal sheet is open (aria-hidden skips [aria-live])", () => {
  assert.match(read("components/ui/toaster.tsx"), /<div data-toaster="" aria-live="off" className="contents">/);
});
