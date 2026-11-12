// Guard: the seller's legal name and contact email must be real before this
// ships. This test FAILS ON PURPOSE while lib/seller.ts still has placeholders
// (owner has not supplied them yet, 2026-11-12).
import { test } from "node:test";
import assert from "node:assert/strict";
import { SELLER, isPlaceholder } from "../lib/seller";

test("seller name and contact email are filled in (no PLACEHOLDER left)", () => {
  assert.ok(!isPlaceholder(SELLER.name), "lib/seller.ts: SELLER.name is still a placeholder");
  assert.ok(!isPlaceholder(SELLER.email), "lib/seller.ts: SELLER.email is still a placeholder");
  assert.match(SELLER.email, /^[^\s@]+@[^\s@]+\.[^\s@]+$/, "SELLER.email must be an email address");
});
