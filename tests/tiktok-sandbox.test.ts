import { test } from "node:test";
import assert from "node:assert/strict";
import { Sandbox } from "../services/tiktok-sandbox/session.mjs";
test("a grant is single use and bound to the initiating member", async () => {
  const api = new Sandbox(
    {
      clientKey: "key",
      clientSecret: "secret",
      origin: "https://sandbox.example",
    },
    async () =>
      Response.json({
        access_token: "grant",
        scope: "video.publish",
        expires_in: 3600,
      }),
  );
  const url = new URL(api.start("alice"));
  const state = url.searchParams.get("state");
  await assert.rejects(api.connect("bob", state, "code"));
  await api.connect("alice", state, "code");
  await assert.rejects(api.connect("alice", state, "code"));
});

test("private post uses the selected caption and fresh creator permissions; only its member can track it", async () => {
  const calls: { url: string; body: any }[] = [];
  const api = new Sandbox(
    {
      clientKey: "key",
      clientSecret: "secret",
      origin: "https://sandbox.example",
    },
    async (input, options) => {
      const url = String(input);
      if (url.endsWith("/oauth/token/"))
        return Response.json({
          access_token: "token",
          scope: "video.publish",
          expires_in: 3600,
        });
      const body = JSON.parse(String(options?.body));
      calls.push({ url, body });
      const data = url.endsWith("/query/")
        ? {
            privacy_level_options: ["SELF_ONLY"],
            max_video_post_duration_sec: 30,
            comment_disabled: true,
          }
        : url.endsWith("/init/")
          ? { publish_id: "id", upload_url: "https://example.test/upload" }
          : { status: "PUBLISH_COMPLETE" };
      return Response.json({ data, error: { code: "ok" } });
    },
  );
  const state = new URL(api.start("alice")).searchParams.get("state");
  await api.connect("alice", state, "code");
  const post = {
    size: 1024,
    duration: 4,
    consent: true,
    caption: "คลิปทดสอบ",
    privacy: "SELF_ONLY",
    comment: true,
  };
  for (const invalid of [
    { privacy: "PUBLIC_TO_EVERYONE" },
    { consent: false },
    { duration: 31 },
    { size: 0 },
  ])
    await assert.rejects(api.init("alice", { ...post, ...invalid }));
  assert.ok(calls.every((call) => !call.url.endsWith("/init/")));
  assert.deepEqual(await api.init("alice", post), { publish_id: "id" });
  const sent = calls.at(-1)!.body;
  assert.equal(sent.post_info.title, post.caption);
  assert.equal(sent.post_info.disable_comment, true);
  assert.equal(sent.source_info.video_size, 1024);
  await assert.rejects(api.status("bob", "id"));
  assert.equal((await api.status("alice", "id")).status, "PUBLISH_COMPLETE");
});

test("bridge uploads only the selected member file, with exact bytes and range", async () => {
  const { createBridge } = await import("../services/tiktok-sandbox/http.mjs");
  const jobs = new Map([
    ["publish-id", { url: "https://upload.example/one", size: 5 }],
  ]);
  let uploaded = "";
  const bridge = createBridge(
    { grants: new Map([["alice", { jobs }]]) },
    "test-key",
    async (url, init) => {
      assert.equal(String(url), "https://upload.example/one");
      assert.equal(init?.method, "PUT");
      assert.equal(
        new Headers(init?.headers).get("content-range"),
        "bytes 0-4/5",
      );
      uploaded = await new Response(init?.body).text();
      return new Response(null, { status: 201 });
    },
  );
  await new Promise<void>((resolve) => bridge.listen(0, "127.0.0.1", resolve));
  try {
    const addr = bridge.address();
    assert.ok(addr && typeof addr !== "string");
    const upload = (member: string) =>
      fetch("http://127.0.0.1:" + addr.port + "/upload", {
        method: "POST",
        headers: {
          authorization: "Bearer test-key",
          "x-member": member,
          "x-job": "publish-id",
        },
        body: "video",
      });
    assert.equal((await upload("bob")).status, 400);
    assert.equal((await upload("alice")).status, 200);
    assert.equal(uploaded, "video");
    assert.equal((await upload("alice")).status, 400);
  } finally {
    bridge.closeAllConnections();
    bridge.close();
  }
});

test("TikTok accepts the token exchange form media type without a charset", async () => {
  const api = new Sandbox({clientKey:"key", clientSecret:"secret", origin:"https://example.test"}, async (input, init) => {
    const request = new Request(input, init);
    assert.equal(request.headers.get("content-type"), "application/x-www-form-urlencoded");
    return Response.json({access_token:"grant",scope:"video.publish",expires_in:3600});
  });
  const state = new URL(api.start("member")).searchParams.get("state");
  await api.connect("member", state, "code");
});

test("explicit sandbox connection opens the account authorization screen for returning users", () => {
 const sandbox = new Sandbox({clientKey:"test",origin:"https://example.test"});
 const url = new URL(sandbox.start("member", true));
 assert.equal(url.searchParams.get("disable_auto_auth"), "1");
});
