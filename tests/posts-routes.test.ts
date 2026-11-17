// Web composer routes (/api/posts*): guards before the Lambda, exact bodies,
// "now" = now+5m, Bangkok times, the S3 URL allow-list and Thai errors.
import { test } from "node:test";
import assert from "node:assert/strict";
import { encode } from "next-auth/jwt";
import { accountToken } from "../lib/accounts/session";
import type { ChannelRouteDeps } from "../lib/channels/routes";
import type { ChannelStore } from "../lib/channels/store";
import { handleCancel, handleSchedule, handleUpload } from "../lib/posts/routes";
import { bangkokLocalToIso, isoToBangkokLocal } from "../lib/posts/media";

const AUTH_ENV = Object.freeze({
  NEXTAUTH_SECRET: "FIXTURE-ONLY-session-secret-000000000000000001",
  NEXTAUTH_URL: "https://kubcode.dev",
  GOOGLE_CLIENT_ID: "123456789012-fixtureonly0abc.apps.googleusercontent.com",
  GOOGLE_CLIENT_SECRET: "FIXTURE-ONLY-client-secret-0001",
  LINE_CLIENT_ID: "2000000001",
  LINE_CLIENT_SECRET: "FIXTURE-ONLY-line-channel-secret-01",
  KUBCODE_ACCOUNTS_ENABLED: "true",
  DATABASE_URL: "postgres://fixture:fixture@127.0.0.1:5432/kubcode_fixture_test",
});
const ON = Object.freeze({
  ...AUTH_ENV,
  KUBCODE_PUBLISHING_ENABLED: "true",
  KUBCODE_PUBLISHING_URL: "https://abcdefghij0123456789abcdefghij01.lambda-url.ap-southeast-1.on.aws/",
  KUBCODE_PUBLISHING_HMAC_KEY: "FIXTURE-ONLY-publishing-hmac-key-000000000000",
});
const UID = "6f0f5e1c-0000-4000-8000-00000000f1a1";
const CSRF = "C".repeat(43);
const CLIP = "web-0b0e8a1e-0000-4000-8000-0000000000c1";
const CH1 = "0b0e8a1e-0000-4000-8000-0000000000a1";
const CH2 = "0b0e8a1e-0000-4000-8000-0000000000a2";
const ASSET = "0b0e8a1e-0000-4000-8000-0000000000b1";
const COVER = "0b0e8a1e-0000-4000-8000-0000000000b2";
const NOW = Date.parse("2026-11-16T03:00:00Z");
const S3 = "https://kubcode-media-955758449820.s3.ap-southeast-1.amazonaws.com/clips/ws/web-x/ab.mp4?X-Amz-Signature=1";

const member: Partial<ChannelStore> = { member: async () => ({ ok: true, userId: UID }) };
const forbidden: Partial<ChannelStore> = { member: async () => ({ ok: false, code: "FORBIDDEN" }) };
const noFetch = (async () => assert.fail("the Lambda must not be called")) as typeof fetch;

function lambda(reply: Record<string, unknown>) {
  const calls: { path: string; body: any }[] = [];
  const fetchFn = (async (input: string | URL, init?: RequestInit) => {
    calls.push({ path: new URL(String(input)).pathname, body: JSON.parse(String(init?.body)) });
    return Response.json(reply);
  }) as typeof fetch;
  return { calls, fetch: fetchFn };
}

async function post(path: string, body: unknown, opts: { origin?: string } = {}) {
  const token = accountToken({ userId: UID, sessionVersion: 1, provider: "google", subject: "g-1", name: "N", email: "g@example.test" });
  const session = `__Secure-next-auth.session-token=${await encode({ token, secret: AUTH_ENV.NEXTAUTH_SECRET })}`;
  return new Request(`https://kubcode.dev${path}`, {
    method: "POST",
    headers: {
      host: "kubcode.dev",
      origin: opts.origin ?? "https://kubcode.dev",
      "sec-fetch-site": "same-origin",
      "content-type": "application/json",
      "x-kubcode-csrf": CSRF,
      cookie: [`__Host-kubcode-csrf=${CSRF}`, session].join("; "),
    },
    body: JSON.stringify(body),
  });
}

const deps = (store: Partial<ChannelStore>, extra: Partial<ChannelRouteDeps> = {}): ChannelRouteDeps => ({
  env: ON,
  now: () => NOW,
  storeFor: () => store as ChannelStore,
  fetch: noFetch,
  ...extra,
});

const VIDEO = { kind: "video", sha256: "ab".repeat(32), contentType: "video/mp4", bytes: 10_000_000, width: 1080, height: 1920, seconds: 30, clipRef: CLIP };

test("upload: off → 404; bad origin, bad body or a non-member never reach the Lambda", async () => {
  assert.equal((await handleUpload(await post("/api/posts/upload", VIDEO), deps(member, { env: AUTH_ENV }))).status, 404);
  assert.equal((await handleUpload(await post("/api/posts/upload", VIDEO, { origin: "https://evil.example" }), deps(member))).status, 403);
  for (const bad of [
    { ...VIDEO, contentType: "video/webm" },
    { ...VIDEO, bytes: 600 * 1024 * 1024 },
    { ...VIDEO, clipRef: "2026-11-08_cli" },
    { ...VIDEO, seconds: undefined },
    { ...VIDEO, kind: "cover" },
    { ...VIDEO, key: "clips/x" },
  ]) {
    assert.equal((await handleUpload(await post("/api/posts/upload", bad), deps(member))).status, 400, JSON.stringify(bad));
  }
  assert.equal((await handleUpload(await post("/api/posts/upload", VIDEO), deps(forbidden))).status, 403);
});

test("upload: signs a presign call with the member's id; only our bucket's S3 URL reaches the browser", async () => {
  const l = lambda({ ok: true, asset_id: ASSET, upload: { url: S3, headers: [["content-type", "video/mp4"], ["x-amz-checksum-sha256", "q83v"]] } });
  const r = await handleUpload(await post("/api/posts/upload", VIDEO), deps(member, { fetch: l.fetch }));
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { ok: true, assetId: ASSET, upload: { url: S3, headers: { "content-type": "video/mp4", "x-amz-checksum-sha256": "q83v" } } });
  assert.equal(l.calls[0].path, "/api/media/presign");
  assert.deepEqual(l.calls[0].body, { user_id: UID, asset: { clip_ref: CLIP, kind: "video", sha256: "ab".repeat(32), content_type: "video/mp4", bytes: 10_000_000, width: 1080, height: 1920, seconds: 30 } });
  const evil = lambda({ ok: true, asset_id: ASSET, upload: { url: "https://evil.example/x", headers: [] } });
  assert.equal((await handleUpload(await post("/api/posts/upload", VIDEO), deps(member, { fetch: evil.fetch }))).status, 503);
  const quota = lambda({ ok: false, code: "upload_quota" });
  const q = await handleUpload(await post("/api/posts/upload", VIDEO), deps(member, { fetch: quota.fetch }));
  assert.equal(q.status, 429);
  assert.match((await q.json()).message, /โควตา/);
});

const SCHEDULE = { clipRef: CLIP, videoAsset: ASSET, coverAsset: COVER, caption: "บรรทัดแรก\nรายละเอียด", publishAt: null, targets: [{ channelId: CH1, visibility: "public" }, { channelId: CH2, visibility: "unlisted" }] };

test("schedule: 'now' is now+5m (whole minute); a chosen time must be ≥ now+5m and ≤ 30 days", async () => {
  const l = lambda({ ok: true, result: { post: "p1", deliveries: [{ channel: CH1, delivery: "d1", status: "scheduled", codes: [] }, { channel: CH2, delivery: "d2", status: "rejected", codes: ["video_not_9_16"] }] } });
  const r = await handleSchedule(await post("/api/posts", SCHEDULE), deps(member, { fetch: l.fetch }));
  assert.equal(r.status, 200);
  const body = await r.json();
  assert.equal(body.publishAt, "2026-11-16T03:05:00.000Z");
  assert.deepEqual(body.deliveries[1], { channelId: CH2, deliveryId: "d2", status: "rejected", codes: ["video_not_9_16"] });
  const sent = l.calls[0].body;
  assert.equal(l.calls[0].path, "/api/posts/schedule");
  assert.equal(sent.user_id, UID);
  assert.equal(sent.request.title, "บรรทัดแรก", "title defaults to the caption's first line");
  assert.equal(sent.request.description, "บรรทัดแรก\nรายละเอียด");
  assert.deepEqual(sent.request.targets.map((t: any) => [t.channel, t.visibility, t.publish_at]), [[CH1, "public", "2026-11-16T03:05:00.000Z"], [CH2, "unlisted", "2026-11-16T03:05:00.000Z"]]);
  // Too soon / too far are refused before the Lambda.
  for (const [at, code] of [["2026-11-16T03:02:00Z", "TOO_SOON"], ["2026-12-20T03:00:00Z", "TOO_FAR"]] as const) {
    const res = await handleSchedule(await post("/api/posts", { ...SCHEDULE, publishAt: at }), deps(member));
    assert.equal((await res.json()).code, code);
  }
});

test("schedule: duplicate channels, too many targets, missing cover or extra fields are 400", async () => {
  for (const bad of [
    { ...SCHEDULE, targets: [{ channelId: CH1, visibility: "public" }, { channelId: CH1, visibility: "public" }] },
    { ...SCHEDULE, targets: Array.from({ length: 11 }, (_, i) => ({ channelId: `0b0e8a1e-0000-4000-8000-0000000000${(i + 10).toString(16).padStart(2, "0")}`, visibility: "public" })) },
    { ...SCHEDULE, coverAsset: undefined },
    { ...SCHEDULE, targets: [] },
    { ...SCHEDULE, caption: "x".repeat(2201) },
    { ...SCHEDULE, extra: true },
  ]) {
    assert.equal((await handleSchedule(await post("/api/posts", bad), deps(member))).status, 400);
  }
});

test("schedule: a resubmitted draft returns the first post (Lambda 'already')", async () => {
  const l = lambda({ ok: true, already: true, result: { post: "p1", deliveries: [] } });
  const r = await handleSchedule(await post("/api/posts", SCHEDULE), deps(member, { fetch: l.fetch }));
  assert.deepEqual(await r.json(), { ok: true, post: "p1", already: true, deliveries: [] });
});

test("cancel: member's own delivery via the Lambda; codes map to Thai", async () => {
  const ok = lambda({ ok: true });
  const r = await handleCancel(await post("/api/posts/cancel", { deliveryId: CH1 }), deps(member, { fetch: ok.fetch }));
  assert.equal(r.status, 200);
  assert.deepEqual(ok.calls[0], { path: "/api/posts/cancel", body: { user_id: UID, delivery_id: CH1 } });
  const final = lambda({ ok: false, code: "already_final" });
  const f = await handleCancel(await post("/api/posts/cancel", { deliveryId: CH1 }), deps(member, { fetch: final.fetch }));
  assert.equal(f.status, 409);
  assert.equal((await handleCancel(await post("/api/posts/cancel", { deliveryId: "x" }), deps(member))).status, 400);
});

test("Bangkok time helpers round-trip", () => {
  assert.equal(bangkokLocalToIso("2026-11-16T19:30"), "2026-11-16T12:30:00.000Z");
  assert.equal(isoToBangkokLocal("2026-11-16T12:30:00.000Z"), "2026-11-16T19:30");
  assert.equal(bangkokLocalToIso("bad"), null);
});

test("upload URL allow-list: our bucket always; loopback only for a local preview", async () => {
  const { uploadUrlOk } = await import("../lib/posts/routes");
  assert.equal(uploadUrlOk(S3, { NODE_ENV: "production" }), true);
  assert.equal(uploadUrlOk("http://127.0.0.1:3263/clips/a", { NODE_ENV: "production" }), false);
  assert.equal(uploadUrlOk("http://127.0.0.1:3263/clips/a", { NODE_ENV: "production", KUBCODE_LOCAL_MEDIA: "true" }), true);
  assert.equal(uploadUrlOk("https://kubcode-media-955758449820.s3.ap-southeast-1.amazonaws.com/packages/x", { NODE_ENV: "production" }), false);
  assert.equal(uploadUrlOk("https://evil.example/clips/x", {}), false);
});

test("schedule: per-platform caption and options pass through in the core's shape", async () => {
  const l = lambda({ ok: true, result: { post: "p1", deliveries: [] } });
  const body = {
    ...SCHEDULE,
    targets: [
      { channelId: CH1, visibility: "public", platform: "tiktok", caption: "  แคปชัน TikTok  ", options: { tiktok: { allowDuet: true, allowStitch: true, allowComment: false, draft: true } } },
      { channelId: CH2, visibility: "unlisted", platform: "youtube", options: { youtube: { categoryId: "27", madeForKids: false, firstComment: "ขอบคุณที่ดู" } } },
    ],
  };
  const r = await handleSchedule(await post("/api/posts", body), deps(member, { fetch: l.fetch }));
  assert.equal(r.status, 200);
  const [tt, yt] = l.calls[0].body.request.targets;
  assert.equal(tt.caption, "แคปชัน TikTok");
  assert.deepEqual(tt.options, { tiktok: { allow_comment: false, allow_duet: true, allow_stitch: true, draft: true } });
  assert.equal(yt.caption, undefined);
  assert.deepEqual(yt.options, { youtube: { made_for_kids: false, category_id: "27", first_comment: "ขอบคุณที่ดู" } });
  assert.equal(l.calls[0].body.request.description, "บรรทัดแรก\nรายละเอียด", "the shared caption stays");
  // A plain target carries neither field (CLI-identical shape).
  const plain = lambda({ ok: true, result: { post: "p2", deliveries: [] } });
  await handleSchedule(await post("/api/posts", SCHEDULE), deps(member, { fetch: plain.fetch }));
  assert.deepEqual(Object.keys(plain.calls[0].body.request.targets[0]).sort(), ["channel", "publish_at", "visibility"]);
});

test("schedule: options for another platform, unknown keys, bad types or a bad category are 400", async () => {
  const t = (extra: Record<string, unknown>) => ({ ...SCHEDULE, targets: [{ channelId: CH1, visibility: "public", ...extra }] });
  for (const bad of [
    t({ platform: "tiktok", options: { instagram: { shareToFeed: false } } }),
    t({ platform: "tiktok", options: { tiktok: { privacyLevel: "SELF_ONLY" } } }),
    t({ platform: "tiktok", options: { tiktok: { allowDuet: "yes" } } }),
    t({ platform: "youtube", options: { youtube: { categoryId: "99" } } }),
    t({ platform: "instagram", options: { instagram: { firstComment: "   " } } }),
    t({ platform: "instagram", caption: "x".repeat(2201) }),
    t({ platform: "threads", caption: "x" }),
    t({ caption: "no platform named" }),
    t({ platform: "tiktok", options: { tiktok: {}, youtube: {} } }),
  ]) {
    assert.equal((await handleSchedule(await post("/api/posts", bad), deps(member))).status, 400, JSON.stringify(bad.targets));
  }
  // YouTube captions may run to 5000.
  const ok = lambda({ ok: true, result: { post: "p3", deliveries: [] } });
  const long = t({ platform: "youtube", caption: "ย".repeat(4000) });
  assert.equal((await handleSchedule(await post("/api/posts", long), deps(member, { fetch: ok.fetch }))).status, 200);
});
