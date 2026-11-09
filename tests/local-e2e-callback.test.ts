// The local E2E hand-off (docs/dev/local-e2e.md): the owner copies Zernio's
// exit page or our callback URL; only our callback with a state may come out.
import test from "node:test";
import assert from "node:assert/strict";
import { callbackFrom } from "../scripts/local-e2e/callback";

const STATE = "ab".repeat(32);
const CALLBACK = `https://kubcode.dev/api/channels/callback?i=${STATE}&connected=youtube&profileId=p1&accountId=a1&username=x`;

test("takes our callback from Zernio's exit page or as copied", () => {
  assert.equal(callbackFrom(`https://zernio.com/connect/continue?to=${encodeURIComponent(CALLBACK)}`), CALLBACK);
  assert.equal(callbackFrom(CALLBACK), CALLBACK);
  assert.equal(callbackFrom(`https://kubcode.dev/api/channels/callback?i=${STATE}`), `https://kubcode.dev/api/channels/callback?i=${STATE}`);
});

test("anything else is ignored", () => {
  for (const c of [
    "",
    "hello",
    `https://kubcode.dev/account/channels?notice=connect_failed`,
    `https://kubcode.dev/api/channels/callback?i=short`,
    `https://evil.example/api/channels/callback?i=${STATE}`,
    `https://zernio.com/connect/continue?to=${encodeURIComponent("https://evil.example/")}`,
    `https://zernio.com.evil.example/connect/continue?to=${encodeURIComponent(CALLBACK)}`,
  ])
    assert.equal(callbackFrom(c), undefined, c);
});
