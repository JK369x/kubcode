// The Social dashboard on /account (owner 2026-11-23: Social first): exact
// counts from our own records, per channel where kubcode answers comments.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const NodeModule = require("node:module") as { _extensions: Record<string, (m: { exports: unknown }) => void> };
NodeModule._extensions[".css"] = (m) => {
  m.exports = new Proxy({}, { get: (_t, key) => (key === "__esModule" ? false : String(key)) });
};
const { SocialActivity, SocialStats } = require("../components/SocialActivity") as typeof import("../components/SocialActivity");
type Activity = import("../lib/dashboard/store").DashboardActivity;

const activity: Activity = {
  posts: { scheduled: 4, published: 12, failed: 1 },
  answersThisMonth: 1234,
  matched: 30,
  answered: 20,
  channels: [
    { channelId: "a", platform: "instagram", name: "myshop", answersThisMonth: 1200, matched: 25, answered: 18 },
    { channelId: "b", platform: "tiktok", name: "myshop.tt", answersThisMonth: 34, matched: 5, answered: 2 },
    { channelId: "c", platform: "youtube", name: "My Shop", answersThisMonth: 0, matched: 0, answered: 0 },
  ],
};

test("stats: scheduled, published in 30 days, answers this month; failures only when there are some", () => {
  const html = renderToStaticMarkup(createElement(SocialStats, { activity }));
  for (const t of ["โพสต์ที่ตั้งเวลาไว้", "เผยแพร่แล้ว (30 วัน)", "ตอบคอมเมนต์ให้แล้ว (เดือนนี้)", "โพสต์ไม่สำเร็จ (30 วัน)"]) assert.match(html, new RegExp(t.replace(/[()]/g, "\\$&")));
  assert.match(html, />1,234</, "Thai-locale grouping");
  const ok = renderToStaticMarkup(createElement(SocialStats, { activity: { ...activity, posts: { ...activity.posts, failed: 0 } } }));
  assert.doesNotMatch(ok, /ไม่สำเร็จ/);
});

test("activity: a real table of Instagram and TikTok channels with the monthly cap; YouTube is left out", () => {
  const html = renderToStaticMarkup(createElement(SocialActivity, { activity }));
  assert.match(html, /<table/);
  assert.match(html, /<caption class="sr-only">/);
  assert.equal((html.match(/<th scope="col">/g) || []).length, 4);
  assert.match(html, /@myshop</);
  assert.match(html, /@myshop\.tt</);
  assert.doesNotMatch(html, /My Shop/, "no automations on YouTube: no zero row");
  assert.match(html, /1,200<span[^>]*> \/ 5,000<\/span>/);
  const none = renderToStaticMarkup(createElement(SocialActivity, { activity: { ...activity, channels: [activity.channels[2]] } }));
  assert.match(none, /ยังไม่มีช่อง Instagram หรือ TikTok/);
  assert.doesNotMatch(none, /<table/);
});

test("/account uses the exact counts, not a sample of recent posts", () => {
  const page = readFileSync("app/account/page.tsx", "utf8");
  assert.match(page, /getDashboardView\(process\.env/);
  assert.match(page, /<SocialStats activity=\{activity\} \/>/);
  assert.match(page, /<SocialActivity activity=\{activity\} \/>/);
  assert.doesNotMatch(page, /เผยแพร่แล้ว \(ล่าสุด\)/, "the old count of the last 3 posts is gone");
  // Same cap as the worker (kubcode-publishing config).
  const cfg = readFileSync("services/crates/kubcode-publishing/src/config.rs", "utf8");
  assert.match(cfg, /dm_cap_per_month: 5_000/);
});
