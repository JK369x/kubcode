// UX audit 2026-11-16: P1-8 (plain Thai), P2-1 (one link style), P2-3 (hero text on phones).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const read = (f: string) => readFileSync(f, "utf8");
const walk = (d: string): string[] =>
  readdirSync(d).flatMap((n) => {
    const p = join(d, n);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });

test("P1-8: account notes are questions in plain Thai and keep every fact", () => {
  const page = read("app/account/page.tsx");
  assert.match(page, /คำถามเรื่องบัญชี/);
  for (const q of ["ไม่เข้าสู่ระบบใช้อะไรได้บ้าง", "เข้าสู่ระบบแล้วได้อะไร", "ใช้ทั้ง Google และ LINE ได้ไหม", "สมาชิกที่ได้รับอนุมัติคืออะไร"]) assert.ok(page.includes(q), q);
  // Facts that must not get lost in the rewrite.
  assert.match(page, /ยังไม่ใช่สมาชิกที่ได้รับอนุมัติ/);
  assert.match(page, /ยังดาวน์โหลดไฟล์ไม่ได้|ยังไม่มีใครดาวน์โหลดไฟล์ได้/);
  assert.match(page, /ระบบไม่รวม/);
  assert.match(page, /ไม่มีปุ่มอนุมัติในเบราว์เซอร์/);
  assert.doesNotMatch(page, /สถานะที่ต้องแยกกัน|ไม่เท่ากับการเป็นสมาชิก/);
});

test("P2-1: one underline offset site-wide, from a token", () => {
  assert.match(read("app/globals.css"), /--link-offset: 4px;[\s\S]*text-underline-offset: var\(--link-offset\);/);
  for (const f of [...walk("app"), ...walk("components")].filter((f) => /\.(css|tsx)$/.test(f))) {
    const s = read(f);
    assert.doesNotMatch(s, /text-underline-offset:\s*\d+px/, f);
    assert.doesNotMatch(s, /underline-offset-\d/, f);
  }
});

test("P2-3: on phones the hero lead uses full-strength ink over a calmer glow", () => {
  const css = read("components/HeroStage.module.css");
  assert.match(css, /@media \(max-width: 760px\) \{[\s\S]*\.lead,\s*\.social \{\s*color: var\(--foreground\);/);
});
