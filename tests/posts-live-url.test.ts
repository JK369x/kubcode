import { test } from "node:test";
import assert from "node:assert/strict";
import { liveUrl } from "../lib/posts/live-url";

test("provider URL wins; TikTok and YouTube links are built when it is missing; IG needs the provider", () => {
  const base = { url: null, platformPostId: null, handle: null };
  assert.equal(liveUrl({ ...base, platform: "tiktok", url: "https://www.tiktok.com/@kubcode/video/1" }), "https://www.tiktok.com/@kubcode/video/1");
  assert.equal(liveUrl({ ...base, platform: "tiktok", platformPostId: "7713000000000000001", handle: "kubcode" }), "https://www.tiktok.com/@kubcode/video/7713000000000000001");
  assert.equal(liveUrl({ ...base, platform: "tiktok", platformPostId: "7713000000000000001", handle: "@kube.code" }), "https://www.tiktok.com/@kube.code/video/7713000000000000001");
  assert.equal(liveUrl({ ...base, platform: "tiktok", platformPostId: "7713000000000000001", handle: null }), null, "no handle → no guess");
  assert.equal(liveUrl({ ...base, platform: "tiktok", platformPostId: "abc", handle: "kubcode" }), null);
  assert.equal(liveUrl({ ...base, platform: "tiktok", platformPostId: "1", handle: "bad/handle" }), null);
  assert.equal(liveUrl({ ...base, platform: "youtube", platformPostId: "dQw4w9WgXcQ" }), "https://youtu.be/dQw4w9WgXcQ");
  assert.equal(liveUrl({ ...base, platform: "youtube", platformPostId: "../x" }), null);
  assert.equal(liveUrl({ ...base, platform: "instagram", platformPostId: "17900000000000001" }), null);
  assert.equal(liveUrl({ ...base, platform: "instagram", url: "javascript:alert(1)" }), null);
});
