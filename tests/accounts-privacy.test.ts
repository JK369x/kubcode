// Copy contract for the central-accounts privacy page and the legacy
// POST /api/account 503 message. These assert wording only; they do not prove
// any storage, deletion or revocation behavior.
import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

function load<T>(path: string): T {
  try {
    return require(path) as T;
  } catch (error) {
    assert.fail(`${path} is not loadable: ${String((error as Error).message).split("\n")[0]}`);
  }
}

function privacyHtml(): string {
  const Privacy = load<{ default: () => unknown }>("../app/privacy/page").default;
  return renderToStaticMarkup(createElement(Privacy as never));
}

// Text only, so negative checks are not fooled by markup between words.
function privacyText(): string {
  return privacyHtml().replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
}

test("privacy copy describes the central account records that now exist", () => {
  const text = privacyText();
  assert.match(text, /รหัสผู้ใช้ภายใน/);
  assert.match(text, /Supabase/);
  assert.match(text, /PostgreSQL/);
  assert.match(text, /ไม่ได้ใช้ Supabase Auth/);
  assert.match(text, /schema ส่วนตัว/);
  assert.match(text, /เฉพาะฝั่งเซิร์ฟเวอร์/);
  assert.match(text, /อีเมลที่ Google ยืนยันแล้ว/);
  assert.match(text, /LINE ไม่มีอีเมล/);
  assert.match(text, /ไม่รวมหรือเชื่อมบัญชีให้อัตโนมัติจากอีเมล/);
  assert.match(text, /ไม่เก็บ access token \/ refresh token \/ ID token/);
});

test("privacy copy describes link intents and audit without global-deletion or no-log claims", () => {
  const text = privacyText();
  assert.match(text, /10 นาที/);
  assert.match(text, /เก็บเฉพาะค่าแฮช/);
  assert.match(text, /ยังไม่มีงานลบอัตโนมัติ/);
  assert.match(text, /ไม่มีอีเมล ตัวระบุบัญชีของผู้ให้บริการ IP หรือ OAuth token/);
  assert.match(text, /บันทึกการทำงานของผู้ให้บริการโฮสต์/);
  assert.doesNotMatch(text, /ภายใน 10 นาที[^.]*ลบ|ลบ[^.]*ภายใน 10 นาที/);
  assert.doesNotMatch(text, /ไม่มี log|ไม่มีการบันทึก log|ไม่บันทึกข้อมูลใด ๆ/i);
});

test("privacy copy states session, logout and revocation limits truthfully", () => {
  const text = privacyText();
  assert.match(text, /24 ชั่วโมง/);
  assert.match(text, /ตรวจกับฐานข้อมูลทุกครั้ง/);
  assert.match(text, /ออกจากระบบทุกเซสชันก่อนหน้า/);
  assert.match(text, /ไม่ได้ออกจากบัญชี Google หรือ LINE/);
  assert.match(text, /ยังเพิกถอนรายตัวจากส่วนกลางไม่ได้/);
  assert.match(text, /ข้อมูลในฐานข้อมูลยังอยู่หลังออกจากระบบ/);
  assert.match(text, /ปิดระบบบัญชีส่วนกลาง[^.]*ไม่ได้ลบข้อมูลที่บันทึกไว้แล้ว/);
});

test("privacy copy routes deletion through the owner without inventing contacts or promises", () => {
  const html = privacyHtml();
  const text = privacyText();
  assert.match(text, /ยังไม่มีหน้าลบบัญชีหรือข้อมูลอัตโนมัติ/);
  assert.match(text, /ช่องทางส่วนตัวที่คุณใช้ติดต่อเจ้าของเว็บอยู่แล้ว/);
  assert.doesNotMatch(html, /mailto:|tel:|https?:\/\//);
  assert.doesNotMatch(text, /[\w.+-]+@[\w-]+\.[\w.]+/);
  assert.doesNotMatch(text, /ภายใน \d+ (วัน|ชั่วโมง)|เก็บไว้ \d+|PDPA|GDPR|compliant|certified|ได้รับการรับรอง/i);
});

test("privacy copy drops the pre-database and Supabase Auth claims", () => {
  const text = privacyText();
  assert.doesNotMatch(text, /ยังไม่ได้บันทึกบัญชีสมาชิกลงฐานข้อมูล|ไม่มีฐานข้อมูล|ถือเป็นคนละบัญชีเสมอ/);
  assert.doesNotMatch(text, /(?<!ไม่ได้)ใช้ Supabase Auth/);
  assert.doesNotMatch(text, /ยังไม่มีระบบยกเลิกเซสชันส่วนกลาง/);
  assert.match(text, /ไม่ใช่การอนุมัติสมาชิก/);
  assert.match(text, /ไม่ได้ให้สิทธิ์ดาวน์โหลด/);
  assert.match(text, /MCP/);
});

test("legacy POST /api/account stays 503 with a truthful membership message", async () => {
  const { POST } = load<{ POST: () => Promise<Response> }>("../app/api/account/route");
  const res = await POST();
  assert.equal(res.status, 503);
  assert.equal(res.headers.get("Cache-Control"), "no-store");
  const body = (await res.json()) as { code: string; message: string };
  assert.equal(body.code, "BACKEND_NOT_CONFIGURED");
  assert.match(body.message, /ยังไม่เปิดให้ใช้/);
  assert.match(body.message, /สมัครหรืออนุมัติสมาชิก/);
  assert.match(body.message, /ไม่ได้สร้างสิทธิ์สมาชิก/);
  assert.doesNotMatch(body.message, /Supabase|ไม่ได้สร้างบัญชี|บันทึกข้อมูล/);
});
