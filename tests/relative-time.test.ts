import { test } from "node:test";
import assert from "node:assert/strict";
import { relativeTime } from "../lib/relative-time";

test("relative time reads naturally in Thai", () => {
  const now = Date.parse("2026-11-10T12:00:00Z");
  const ago = (s: number) => new Date(now - s * 1000).toISOString();
  assert.equal(relativeTime(ago(10), now), "เมื่อสักครู่");
  assert.match(relativeTime(ago(5 * 60), now), /5 นาที/);
  assert.match(relativeTime(ago(3 * 3600), now), /3 ชั่วโมง/);
  assert.equal(relativeTime(ago(24 * 3600), now), "เมื่อวาน");
  assert.match(relativeTime(ago(40 * 24 * 3600), now), /เดือน/);
});
