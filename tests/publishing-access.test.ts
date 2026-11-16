// Who may publish (lib/channels/access.ts): the owner, or paid slots while
// active or inside the 3-day grace (ADR 0008).
import { test } from "node:test";
import assert from "node:assert/strict";
import { canUsePublishing } from "../lib/channels/access";

const now = new Date("2026-11-16T03:00:00Z");
const at = (days: number) => new Date(now.getTime() + days * 86_400_000);

test("owner always; paid active or grace; never expired, 0 slots or never paid", () => {
  assert.equal(canUsePublishing({ owner: true, slots: 0, paidUntil: null }, now), true);
  assert.equal(canUsePublishing({ owner: false, slots: 1, paidUntil: at(5) }, now), true);
  assert.equal(canUsePublishing({ owner: false, slots: 1, paidUntil: at(-2) }, now), true, "grace");
  assert.equal(canUsePublishing({ owner: false, slots: 1, paidUntil: at(-3.01) }, now), false, "past grace");
  assert.equal(canUsePublishing({ owner: false, slots: 0, paidUntil: at(5) }, now), false);
  assert.equal(canUsePublishing({ owner: false, slots: 0, paidUntil: null }, now), false);
});
