import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import Pricing from "../app/pricing/page";
import Refund from "../app/refund/page";
import Contact from "../app/contact/page";
import Terms from "../app/terms/page";
import Privacy from "../app/privacy/page";
import Roadmap from "../app/roadmap/page";
import { SiteFooter } from "../components/SiteFooter";
import { PLANS, priceLabel } from "../lib/plans";
import { ROADMAP } from "../lib/roadmap";
import { SELLER } from "../lib/seller";

const html = (c: () => unknown) => renderToStaticMarkup(createElement(c as never));
const text = (h: string) => h.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

test("plans: four plans, one free, at most one highlighted, unique ids, owner's prices", () => {
  assert.ok(PLANS.length >= 1 && PLANS.length <= 4);
  assert.equal(PLANS.filter((p) => p.priceThb === 0).length, 1);
  assert.ok(PLANS.filter((p) => p.highlighted).length <= 1);
  assert.equal(new Set(PLANS.map((p) => p.id)).size, PLANS.length);
  for (const p of PLANS) assert.ok(Number.isInteger(p.priceThb) && p.priceThb >= 0, p.id);
  const by = Object.fromEntries(PLANS.map((p) => [p.id, p]));
  assert.deepEqual(
    PLANS.map((p) => [p.id, p.status, p.priceThb, p.channelsIncluded, p.extraChannelThb]),
    [
      ["free", "available", 0, 0, null],
      ["social", "available", 289, 1, 289],
      ["skill-pack", "coming_soon", 149, 0, null],
      ["social-skill", "coming_soon", 389, 1, 289],
    ],
  );
  assert.ok(by.social.features.some((f) => /ไม่รวม skill สำหรับสมาชิก/.test(f)));
});

test("pricing renders every plan from config with prices, payment terms and the no-VAT line", () => {
  const t = text(html(Pricing));
  for (const p of PLANS) {
    assert.ok(t.includes(p.nameTh), p.id);
    assert.ok(t.includes(priceLabel(p).amount), p.id);
    for (const f of p.features) assert.ok(t.includes(f), f);
  }
  assert.match(t, /289 ฿ ต่อช่อง ต่อเดือน/);
  assert.match(t, /389 ฿ ต่อเดือน สำหรับ ช่องแรก/);
  assert.match(t, /ช่องถัดไป \+289 ฿ ต่อช่อง ต่อเดือน/);
  assert.match(t, /149 ฿ ต่อเดือน/);
  assert.match(t, /ทุกแพ็กเกจจ่ายทีละเดือน ไม่ตัดเงินอัตโนมัติ · ราคานี้ยังไม่มี VAT/);
  assert.match(t, /พร้อมเพย์/);
  assert.match(t, /ยังไม่มีภาษีมูลค่าเพิ่ม เพราะเรายังไม่ได้จดทะเบียน VAT/);
  assert.match(t, /หมดเดือนแล้ว โพสต์ที่ตั้งเวลาไว้/);
});

function cardOf(h: string, id: string): string {
  const start = h.indexOf(`aria-labelledby="plan-${id}"`);
  assert.ok(start > 0, id);
  const next = h.indexOf('aria-labelledby="plan-', start + 10);
  return h.slice(start, next > 0 ? next : h.indexOf("</ul>", h.indexOf('data-slot="card-footer"', start)));
}

test("pricing: available paid plan shows a disabled 'soon' button while billing is off", () => {
  delete process.env.KUBCODE_BILLING_ENABLED;
  const h = html(Pricing);
  assert.match(cardOf(h, "social"), /<button[^>]*disabled=""[^>]*>เปิดให้สมัครเร็ว ๆ นี้<\/button>/);
  assert.doesNotMatch(h, /href="\/account\/billing"/);
});

test("pricing: coming-soon plans can never be bought, even with billing on", () => {
  process.env.KUBCODE_BILLING_ENABLED = "true";
  try {
    const h = html(Pricing);
    assert.match(cardOf(h, "social"), /href="\/account\/billing"/);
    for (const p of PLANS.filter((x) => x.status === "coming_soon")) {
      const c = cardOf(h, p.id);
      assert.match(c, /data-status="coming_soon"/);
      assert.match(c, /เร็ว ๆ นี้/);
      assert.match(c, /แจ้งฉันเมื่อเปิด/);
      assert.doesNotMatch(c, /billing|สมัคร|เปิดให้สมัคร/);
    }
  } finally {
    delete process.env.KUBCODE_BILLING_ENABLED;
  }
});

test("pricing never says Facebook works and links to the roadmap", () => {
  const h = html(Pricing);
  const t = text(h);
  assert.match(t, /Facebook ยังไม่รองรับ/);
  assert.doesNotMatch(t, /Facebook รองรับแล้ว/);
  for (const p of PLANS) for (const f of p.features) assert.doesNotMatch(f, /Facebook/);
  assert.match(h, /href="\/roadmap"[^>]*>ดูแผนที่จะมา →</);
});

test("pricing sells no roadmap item that is not available yet", () => {
  const sold = PLANS.filter((p) => p.status === "available").flatMap((p) => p.features).join(" ");
  for (const i of ROADMAP.filter((x) => x.status !== "now")) {
    assert.ok(!sold.includes(i.titleTh), `available plan sells roadmap item ${i.id}`);
  }
  assert.doesNotMatch(PLANS.flatMap((p) => p.features).join(" "), /MCP|รายปี|annual|Facebook/i);
});

test("roadmap: three sections, every next/later item says ยังไม่เปิด with a waitlist button, no prices or dates", () => {
  const h = html(Roadmap);
  const t = text(h);
  for (const s of ["ตอนนี้ใช้ได้", "กำลังทำ", "ในอนาคต"]) assert.ok(t.includes(s), s);
  const pending = ROADMAP.filter((i) => i.status !== "now");
  assert.equal((t.match(/ยังไม่เปิด(?!ให้)/g) ?? []).length, pending.length);
  assert.equal((t.match(/แจ้งฉันเมื่อเปิด/g) ?? []).length, pending.length);
  for (const i of ROADMAP) assert.doesNotMatch(i.descriptionTh + i.titleTh, /฿|บาท|THB|\d{1,2} (ม\.ค|ก\.พ|มี\.ค|เม\.ย|พ\.ค|มิ\.ย|ก\.ค|ส\.ค|ก\.ย|ต\.ค|พ\.ย|ธ\.ค)|20\d\d/);
  assert.deepEqual(
    ROADMAP.map((i) => [i.id, i.status]),
    [
      ["connect-channels", "now"], ["scheduled-posts", "now"], ["comment-auto-reply", "now"], ["free-skills", "now"], ["deep-sea-docs", "now"],
      ["online-payment", "next"], ["social-mcp", "next"], ["facebook", "next"], ["more-member-skills", "next"],
      ["clip-orders-mcp", "later"], ["annual-plan", "later"],
    ],
  );
});

test("refund: no refunds, cancel by not renewing, duplicate/erroneous charges refunded, seller shown", () => {
  const t = text(html(Refund));
  assert.match(t, /ไม่คืนเงินสำหรับเดือนที่จ่ายแล้ว/);
  assert.match(t, /ไม่ต่ออายุ/);
  assert.match(t, /วันสุดท้ายของเดือนที่จ่ายแล้ว/);
  assert.match(t, /เรียกเก็บเงินซ้ำ/);
  assert.match(t, /ผิดพลาด/);
  assert.ok(t.includes(SELLER.name));
});

test("contact shows seller name, email and response time", () => {
  const t = text(html(Contact));
  assert.ok(t.includes(SELLER.name));
  assert.ok(t.includes(SELLER.email));
  assert.ok(t.includes(SELLER.responseTime));
});

test("terms cover payment, renewal, cancellation, refund, price changes and fair use", () => {
  const h = html(Terms);
  for (const id of ["seller", "payment", "renewal", "cancellation", "price-changes", "fair-use"]) assert.match(h, new RegExp(`id="${id}"`));
  const t = text(h);
  assert.match(t, /ไม่มีการตัดเงินอัตโนมัติ/);
  assert.match(t, /30 วัน/);
  assert.match(t, /ไม่คืนเงิน/);
  assert.match(h, /href="\/refund"/);
});

test("privacy names Stripe as the payment processor and says we keep no card numbers", () => {
  const t = text(html(Privacy));
  assert.match(t, /Stripe/);
  assert.match(t, /ไม่เห็นและไม่เก็บเลขบัตร/);
});

test("footer links pricing, refund, contact, terms, privacy and roadmap", () => {
  const h = renderToStaticMarkup(createElement(SiteFooter));
  for (const href of ["/pricing", "/refund", "/contact", "/terms", "/privacy", "/roadmap"]) {
    assert.match(h, new RegExp(`href="${href}"`), href);
  }
  for (const label of ["ราคา", "นโยบายคืนเงิน", "ติดต่อเรา", "ข้อกำหนด", "ความเป็นส่วนตัว"]) assert.ok(text(h).includes(label));
});
