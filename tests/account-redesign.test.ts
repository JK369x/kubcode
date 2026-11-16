// Group 2 of the redesign + UX audit 2026-11-16 items folded into it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (f: string) => readFileSync(f, "utf8");
const labels = (src: string) => [...src.matchAll(/(?:label: |<Link href="\/account[^"]*">)"?([^"<]+)"?/g)].map((m) => m[1].trim());

test("P2-5: account section strip uses exactly the header menu's names and links", () => {
  const menu = read("components/AccountMenu.tsx");
  const shell = read("components/site/AccountShell.tsx");
  const menuDoors = [...menu.matchAll(/<Link href="(\/account[^"]*)">([^<]+)<\/Link>/g)].map((m) => [m[1], m[2]]);
  const shellDoors = [...shell.matchAll(/href: "(\/account[^"]*)", label: "([^"]+)"/g)].map((m) => [m[1], m[2]]);
  assert.deepEqual(shellDoors, menuDoors);
  assert.ok(labels(shell).length > 0);
  // Same gating as the menu: publishing doors and billing follow capabilities.
  assert.match(shell, /d\.id === "billing" \? caps\?\.billing : caps\?\.publishing/);
});

test("P0-2: after paying, the primary action is connecting the first channel", () => {
  const src = read("components/BillingSuccess.tsx");
  assert.match(src, /<Button asChild size="lg"[^>]*>\s*<Link href="\/account\/channels#channels-add">เชื่อมช่องแรก<\/Link>/);
  assert.match(src, /variant="outline"[^>]*>\s*<Link href="\/account\/billing">ดูแพ็กเกจ<\/Link>/);
});

test("P1-6: billing defaults to the connected channels (at least 1) and says what comes next", () => {
  const src = read("app/account/billing/page.tsx");
  assert.match(src, /initial=\{Math\.max\(page\.view\.slots, page\.view\.activeChannels, 1\)\}/);
  assert.match(src, /จ่ายแล้วทำอะไรต่อ/);
});

test("P1-7: channels and posts empty states show platform logos, one sentence and the action", () => {
  const ch = read("components/ChannelsPanel.tsx");
  assert.match(ch, /className=\{own\.empty\}/);
  assert.match(ch, /ระบบจะพาไปหน้าขอสิทธิ์ของแพลตฟอร์ม/);
  assert.match(ch, /PlatformLogo platform="(youtube|instagram|tiktok)"/);
  const posts = read("components/PostsList.tsx");
  assert.match(posts, /ยังไม่มีโพสต์ อัปโหลดคลิปครั้งเดียว/);
  assert.match(posts, /href="\/account\/posts\/new"[\s\S]{0,80}สร้างโพสต์แรก/);
});

test("P1-4/P1-5: composer has closed per-platform step, live preview, sticky submit and an error summary", () => {
  const src = read("components/PostComposer.tsx");
  const css = read("components/PostComposer.module.css");
  assert.match(src, /4\. ปรับแต่งต่อแพลตฟอร์ม \(ไม่บังคับ\)/);
  assert.match(src, /<Accordion type="multiple"/);
  assert.doesNotMatch(src, /defaultValue=/, "step 4 starts closed");
  assert.match(src, /overrideSummary\(c\.platform, overrides\[c\.id\], visLabel\)/);
  assert.match(read("components/PlatformOverrides.tsx"), /"ใช้ค่าเริ่มต้น"/);
  assert.match(src, /<aside className=\{styles\.preview\} aria-label="ตัวอย่างโพสต์">/);
  assert.match(css, /\.preview \{\s*position: sticky;/);
  assert.match(css, /@media \(max-width: 767px\) \{\s*\.submitBar \{\s*position: sticky;/);
  assert.match(src, /role="alert" className=\{styles\.problems\}/);
  assert.match(src, /focusField\(problems\[0\]\.field\)/);
  // The preview never uploads or fetches: a local object URL, revoked on change/unmount.
  assert.match(src, /URL\.createObjectURL\(file\)/);
  assert.match(src, /URL\.revokeObjectURL\(coverUrl\)/);
});

test("step-4 summary: defaults read 'ใช้ค่าเริ่มต้น', changes are listed", async () => {
  const NodeModule = require("node:module") as { _extensions: Record<string, (m: { exports: unknown }) => void> };
  NodeModule._extensions[".css"] = (m) => {
    m.exports = {};
  };
  const { overrideSummary } = require("../components/PlatformOverrides") as typeof import("../components/PlatformOverrides");
  assert.equal(overrideSummary("tiktok", undefined), "ใช้ค่าเริ่มต้น");
  assert.equal(overrideSummary("tiktok", { captionOn: false, caption: "", options: { tiktok: { allowComment: true } } }), "ใช้ค่าเริ่มต้น");
  assert.equal(overrideSummary("tiktok", { captionOn: true, caption: "x", options: { tiktok: { draft: true, allowComment: false } } }), "แคปชันแยก · ปิดคอมเมนต์ · ส่งเป็นร่าง");
  assert.equal(overrideSummary("youtube", { captionOn: false, caption: "", options: {} }, "ส่วนตัว"), "ส่วนตัว");
  assert.equal(overrideSummary("instagram", { captionOn: false, caption: "", options: { instagram: { shareToFeed: false } } }), "เฉพาะแท็บ Reels");
});
