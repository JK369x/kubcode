// First-run checklist (UX audit P0-3): steps from existing data; owner skips
// paying; the rule template; the checklist hides only when complete.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { stepsOf, type Onboarding } from "../lib/onboarding/view";
import { OnboardingChecklist } from "../components/OnboardingChecklist";

test("steps: pay (non-owners only) → connect → rule → post", () => {
  assert.deepEqual(stepsOf({ owner: false, paid: false, channels: 0, rules: 0, posts: 0 }).map((s) => [s.id, s.done]), [["pay", false], ["connect", false], ["rule", false], ["post", false]]);
  assert.deepEqual(stepsOf({ owner: true, paid: false, channels: 2, rules: 1, posts: 0 }).map((s) => [s.id, s.done]), [["connect", true], ["rule", true], ["post", false]]);
});

const data = (over: Partial<Onboarding> = {}): Onboarding => ({
  owner: false,
  paidUntil: "2026-12-16T00:00:00.000Z",
  steps: stepsOf({ owner: false, paid: true, channels: 1, rules: 0, posts: 0 }),
  ruleChannelId: "0b0e8a1e-0000-4000-8000-0000000000a1",
  complete: false,
  ...over,
});
const html = (d: Onboarding | null, compact = false) => renderToStaticMarkup(createElement(OnboardingChecklist, { data: d, compact }));

test("full card: progress, paid-until date, next step highlighted with its link; done steps have no button", () => {
  const out = html(data());
  assert.match(out, /เริ่มใช้ kubcode Social/);
  assert.match(out, /2\/4/);
  assert.match(out, /ใช้ได้ถึง 16 ธ\.ค\./);
  assert.match(out, /href="\/account\/channels\/0b0e8a1e-0000-4000-8000-0000000000a1\/automations\?template=link"/);
  assert.match(out, /href="\/account\/posts\/new"/);
  assert.doesNotMatch(out, /href="\/account\/billing"/, "paid: no pay button");
  assert.match(out, /\(เสร็จแล้ว\)/);
});

test("compact: one line with the next step; nothing when complete or no data", () => {
  const out = html(data(), true);
  assert.match(out, /ขั้นต่อไป: ตั้งคำตอบคอมเมนต์/);
  assert.equal(html(data({ complete: true, steps: stepsOf({ owner: false, paid: true, channels: 1, rules: 1, posts: 1 }) }), true), "");
  assert.equal(html(null), "");
});

test("unpaid: only 'ดูแพ็กเกจ' is a link; later steps say they open after paying", () => {
  const out = html(data({ paidUntil: null, steps: stepsOf({ owner: false, paid: false, channels: 0, rules: 0, posts: 0 }) }));
  assert.match(out, /href="\/account\/billing"[^>]*>ดูแพ็กเกจ/);
  assert.doesNotMatch(out, /href="\/account\/channels"|href="\/account\/posts\/new"/);
  assert.equal((out.match(/หลังจ่ายแพ็กเกจ/g) ?? []).length, 3);
});

test("a completed checklist is hidden until the browser says it was not dismissed (no flash)", () => {
  const done = data({ complete: true, steps: stepsOf({ owner: true, paid: false, channels: 1, rules: 1, posts: 1 }) });
  assert.equal(html(done), "", "server render: hidden");
});

test("rule template: keyword ลิงก์ and a reply with a link, per platform", async () => {
  // The panel imports CSS modules; stub them.
  const NodeModule = require("node:module") as { _extensions: Record<string, (m: { exports: unknown }) => void> };
  NodeModule._extensions[".css"] = (m) => {
    m.exports = new Proxy({}, { get: (_t, key) => (key === "__esModule" ? false : String(key)) });
  };
  const { templateDraft } = require("../components/AutomationsPanel") as typeof import("../components/AutomationsPanel");
  const tt = templateDraft(true);
  assert.equal(tt.keywords, "ลิงก์, link");
  assert.match(tt.publicReply, /^ลิงก์อยู่ที่ https:\/\/kubcode\.dev\/go\/.+ ครับ$/);
  const ig = templateDraft(false);
  assert.match(ig.dmText, /ลิงก์อยู่ที่ https:/);
  assert.equal(ig.scope, "all");
});

test("pages insert the checklist with one line each", () => {
  const fs = require("node:fs") as typeof import("node:fs");
  assert.match(fs.readFileSync("app/account/page.tsx", "utf8"), /\{caps && <Onboarding \/>\}/);
  assert.match(fs.readFileSync("app/account/channels/page.tsx", "utf8"), /<Onboarding compact \/>/);
  assert.match(fs.readFileSync("app/account/posts/page.tsx", "utf8"), /<Onboarding compact \/>/);
});
