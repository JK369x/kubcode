import { test } from "node:test";
import assert from "node:assert/strict";
import { avatarInitial, safeAvatarUrl } from "../lib/avatar";

test("provider avatar URLs pass only over https from Google or LINE image hosts", () => {
  for (const ok of [
    "https://lh3.googleusercontent.com/a/ACg8ocK-fixture=s96-c",
    "https://profile.line-scdn.net/0hFixture",
    "https://obs.line-scdn.net/0hFixture/preview",
  ])
    assert.equal(safeAvatarUrl(ok), ok, ok);
  for (const bad of [
    "http://lh3.googleusercontent.com/a/x",
    "https://googleusercontent.com.evil.example/a",
    "https://evil.example/?u=lh3.googleusercontent.com",
    "https://user:pw@lh3.googleusercontent.com/a",
    "https://lh3.googleusercontent.com:8443/a",
    "https://line-scdn.net/x",
    "https://scdn.line-apps.com/x",
    "javascript:alert(1)",
    "data:image/png;base64,AAAA",
    "https://lh3.googleusercontent.com/" + "a".repeat(1100),
    "",
    42,
    null,
  ])
    assert.equal(safeAvatarUrl(bad), null, String(bad).slice(0, 60));
});

test("the fallback initial is the first whole character of the name", () => {
  assert.equal(avatarInitial("jk studio"), "J");
  assert.equal(avatarInitial("  สมชาย"), "ส");
  assert.equal(avatarInitial("น้ำ"), "น้ำ", "Thai marks stay with their base letter (one grapheme)");
  assert.equal(avatarInitial(null), "ส");
  assert.equal(avatarInitial("   "), "ส");
});
