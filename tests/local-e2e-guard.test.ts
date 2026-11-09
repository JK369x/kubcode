// Publish mode of the local E2E reuses the production Zernio profile and
// account (docs/dev/local-e2e.md); its Zernio client may read, and may delete
// only a post it was told to, never an account or a profile.
import test from "node:test";
import assert from "node:assert/strict";
import { allowedZernioCall } from "../scripts/local-e2e/zernio-guard";

test("reads are allowed", () => {
  for (const p of ["/accounts", "/accounts?profileId=abc", "/posts/65f1c0a9e2b5af0012ab34cd", "/profiles"])
    assert.equal(allowedZernioCall("GET", p, { cancelPosts: false }), true, p);
});

test("accounts and profiles are never deleted or changed", () => {
  for (const [m, p] of [
    ["DELETE", "/accounts/64e1f0a9e2b5af0012ab34de"],
    ["DELETE", "/profiles/66a1f0c2a4b9d3e8f1a2b3c4"],
    ["delete", "/accounts/x"],
    ["POST", "/profiles"],
    ["PUT", "/profiles/x"],
    ["POST", "/accounts/x/disconnect"],
  ] as const) {
    assert.equal(allowedZernioCall(m, p, { cancelPosts: true }), false, `${m} ${p}`);
  }
});

test("a post may be deleted only when asked", () => {
  assert.equal(allowedZernioCall("DELETE", "/posts/65f1c0a9e2b5af0012ab34cd", { cancelPosts: false }), false);
  assert.equal(allowedZernioCall("DELETE", "/posts/65f1c0a9e2b5af0012ab34cd", { cancelPosts: true }), true);
  assert.equal(allowedZernioCall("DELETE", "/posts/../accounts/x", { cancelPosts: true }), false);
});
