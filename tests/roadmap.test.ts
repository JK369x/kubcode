import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CHANGELOG, ROADMAP_STATS } from "../lib/changelog";
import { PLANS } from "../lib/plans";
import { AREA_LABELS, BIG_BETS, ROADMAP, WAITLIST_COUNT_MIN, roadmapItem } from "../lib/roadmap";
import { publicCountMap } from "../lib/waitlist/routes";

// Node cannot load CSS modules; stub them as identity class maps.
const NodeModule = require("node:module") as { _extensions: Record<string, (m: { exports: unknown }) => void> };
NodeModule._extensions[".css"] = (m) => {
  m.exports = new Proxy({}, { get: (_t, key) => (key === "__esModule" ? false : String(key)) });
};
const Roadmap = (require("../app/roadmap/page") as typeof import("../app/roadmap/page")).default;

const html = () => renderToStaticMarkup(createElement(Roadmap as never));
const text = (h: string) => h.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

test("roadmap data: owner's items and statuses, unique ids, user-facing value lines", () => {
  assert.deepEqual(
    ROADMAP.map((i) => [i.id, i.status]),
    [
      ["connect-channels", "now"], ["scheduled-posts", "now"], ["comment-auto-reply", "now"], ["free-skills", "now"], ["deep-sea-docs", "now"],
      ["online-payment", "next"], ["social-mcp", "next"], ["facebook", "next"], ["more-member-skills", "next"],
      ["clip-orders-mcp", "later"], ["annual-plan", "later"],
    ],
  );
  for (const i of ROADMAP) {
    assert.ok(i.valueTh.length > 10 && i.valueTh.length < 90, i.id);
    assert.ok(AREA_LABELS[i.area], i.id);
    if (i.href) assert.equal(i.status, "now", "only live items link out");
  }
  assert.deepEqual(BIG_BETS.map((b) => roadmapItem(b.itemId)?.status), ["next", "later"]);
});

test("roadmap page: hero, big bets, three lanes, shipped log and CTA", () => {
  const h = html();
  const t = text(h);
  assert.match(h, /<h1[^>]*>/);
  for (const head of ["เรื่องใหญ่ที่กำลังมา", "ภาพรวมทั้งหมด", "ตอนนี้ใช้ได้", "กำลังทำ", "ในอนาคต", "เพิ่งปล่อย", "อยากได้อะไร บอกเรา"]) assert.ok(t.includes(head), head);
  assert.match(t, /ลง TikTok พรุ่งนี้ 19:00 แล้วตั้งให้คอมเมนต์ harness ได้ลิงก์/);
  assert.match(t, /กำลังทำ · ยังไม่เปิด/);
  assert.match(t, /ในอนาคต · ยังไม่เปิด/);
  assert.match(h, /href="\/contact"/);
  assert.match(h, /href="\/pricing"/);
});

test("roadmap: every next/later item says ยังไม่เปิด and has a waitlist button; no prices or dates promised", () => {
  const h = html();
  const t = text(h);
  const pending = ROADMAP.filter((i) => i.status !== "now");
  // One control per lane card, plus one per big bet; the name starts with the visible text.
  assert.equal((h.match(/aria-label="แจ้งฉันเมื่อเปิด: /g) ?? []).length, pending.length + BIG_BETS.length);
  assert.equal((t.match(/ยังไม่เปิด/g) ?? []).length >= pending.length + BIG_BETS.length, true);
  for (const i of pending) assert.ok(t.includes(i.titleTh), i.id);
  const copy = [...ROADMAP.map((i) => i.titleTh + i.valueTh), ...BIG_BETS.map((b) => b.headlineTh + b.bodyTh)].join(" ");
  assert.doesNotMatch(copy, /฿|บาท|THB|ไตรมาส|Q[1-4]|20\d\d|25\d\d|ม\.ค|ก\.พ|มี\.ค|เม\.ย|พ\.ค|มิ\.ย|ก\.ค|ส\.ค|ก\.ย|ต\.ค|พ\.ย|ธ\.ค/);
});

test("waitlist counts: only open targets and only at the minimum or more", () => {
  const m = publicCountMap([
    { kind: "roadmap", id: "facebook", members: WAITLIST_COUNT_MIN },
    { kind: "roadmap", id: "annual-plan", members: WAITLIST_COUNT_MIN - 1 },
    { kind: "roadmap", id: "scheduled-posts", members: 99 },
    { kind: "plan", id: "skill-pack", members: 42 },
    { kind: "plan", id: "social", members: 42 },
  ]);
  assert.deepEqual(m, { "roadmap:facebook": WAITLIST_COUNT_MIN, "plan:skill-pack": 42 });
});

test("changelog: newest first, ~10 real merged PRs on main with Thai copy", () => {
  assert.ok(CHANGELOG.length >= 8 && CHANGELOG.length <= 12);
  for (let i = 1; i < CHANGELOG.length; i++) {
    assert.ok(CHANGELOG[i - 1].date >= CHANGELOG[i].date, "newest first");
    if (CHANGELOG[i - 1].date === CHANGELOG[i].date) assert.ok(CHANGELOG[i - 1].pr > CHANGELOG[i].pr, "same day: newer PR first");
  }
  assert.equal(new Set(CHANGELOG.map((e) => e.pr)).size, CHANGELOG.length);
  for (const e of CHANGELOG) assert.match(e.titleTh + e.detailTh, /[\u0E00-\u0E7F]/, `Thai copy for #${e.pr}`);
});

test("changelog and stats match git history when it is available", (t) => {
  let log: string;
  try {
    log = execFileSync("git", ["log", "origin/main", "--date=format-local:%Y-%m-%d", "--pretty=%ad|%s"], {
      encoding: "utf8",
      env: { ...process.env, TZ: "Asia/Bangkok" },
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    t.skip("no git history (shallow or missing origin/main)");
    return;
  }
  const merged = new Map<number, string>();
  for (const line of log.trim().split("\n")) {
    const [date, subject] = line.split("|");
    const m = subject?.match(/\(#(\d+)\)\s*$/) ?? subject?.match(/^Merge pull request #(\d+)/);
    if (m && !merged.has(Number(m[1]))) merged.set(Number(m[1]), date);
  }
  if (!merged.has(CHANGELOG[CHANGELOG.length - 1].pr)) {
    t.skip("history does not reach the changelog (shallow clone)");
    return;
  }
  for (const e of CHANGELOG) assert.equal(merged.get(e.pr), e.date, `#${e.pr} merged on ${e.date}`);
  const november = [...merged.entries()].filter(([, d]) => d >= "2026-11-01" && d <= ROADMAP_STATS.asOf);
  assert.equal(november.length, ROADMAP_STATS.prsThisMonth, "PRs merged in November up to asOf");
});

test("pricing still sells nothing from the roadmap", () => {
  const sold = PLANS.filter((p) => p.status === "available").flatMap((p) => p.features).join(" ");
  for (const i of ROADMAP.filter((x) => x.status !== "now")) assert.ok(!sold.includes(i.titleTh), i.id);
});
