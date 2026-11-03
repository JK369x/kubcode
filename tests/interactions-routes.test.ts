import { test } from "node:test";
import assert from "node:assert/strict";
import { encode } from "next-auth/jwt";
import { accountToken } from "../lib/accounts/session";
import type { InteractionStore } from "../lib/interactions/store";
import {
  handleComment,
  handleCommentDelete,
  handleCommentHide,
  handleCommentReport,
  handlePageState,
  handlePublicName,
  handleStar,
  type InteractionDeps,
} from "../lib/interactions/routes";

const AUTH_ENV = Object.freeze({
  NEXTAUTH_SECRET: "FIXTURE-ONLY-session-secret-000000000000000001",
  NEXTAUTH_URL: "https://kubcode.dev",
  GOOGLE_CLIENT_ID: "123456789012-fixtureonly0abc.apps.googleusercontent.com",
  GOOGLE_CLIENT_SECRET: "FIXTURE-ONLY-client-secret-0001",
  LINE_CLIENT_ID: "2000000001",
  LINE_CLIENT_SECRET: "FIXTURE-ONLY-line-channel-secret-01",
});
const ACCOUNTS_ONLY_ENV = Object.freeze({
  ...AUTH_ENV,
  KUBCODE_ACCOUNTS_ENABLED: "true",
  DATABASE_URL: "postgres://fixture:fixture@127.0.0.1:5432/kubcode_fixture_test",
});
const ON_ENV = Object.freeze({
  ...AUTH_ENV,
  KUBCODE_INTERACTIONS_ENABLED: "true",
  KUBCODE_ACCOUNTS_ENABLED: "true",
  DATABASE_URL: "postgres://fixture:fixture@127.0.0.1:5432/kubcode_fixture_test",
});
const UID = "6f0f5e1c-0000-4000-8000-00000000f1a1";
const CSRF = "C".repeat(43);
const CID = "0b0e8a1e-0000-4000-8000-0000000000c1";

const untouchable = new Proxy({}, { get: (_t, key) => () => assert.fail(`store.${String(key)} must not be called`) }) as InteractionStore;
const pages = (p: { kind: string; slug: string }) => p.kind === "tool" && p.slug === "remotion";

async function sessionCookie() {
  const token = accountToken({ userId: UID, sessionVersion: 1, provider: "google", subject: "g-1", name: "N", email: "g@example.test" });
  return `__Secure-next-auth.session-token=${await encode({ token, secret: AUTH_ENV.NEXTAUTH_SECRET })}`;
}

async function write(path: string, body: unknown, opts: { origin?: string; signedIn?: boolean; method?: string } = {}) {
  const cookies = [`__Host-kubcode-csrf=${CSRF}`];
  if (opts.signedIn !== false) cookies.push(await sessionCookie());
  return new Request(`https://kubcode.dev${path}`, {
    method: opts.method ?? "POST",
    headers: {
      host: "kubcode.dev",
      origin: opts.origin ?? "https://kubcode.dev",
      "sec-fetch-site": "same-origin",
      "content-type": "application/json",
      "x-kubcode-csrf": CSRF,
      cookie: cookies.join("; "),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const deps = (store: Partial<InteractionStore>, env: Record<string, string> = ON_ENV): InteractionDeps => ({
  env,
  storeFor: () => store as InteractionStore,
  pageExists: pages,
});

async function expectError(res: Response, status: number, code: string) {
  assert.equal(res.status, status);
  assert.equal(res.headers.get("cache-control"), "no-store");
  const body = await res.json();
  assert.equal(body.code, code);
  assert.equal(typeof body.message, "string");
}

test("with accounts off, reads and writes say so and never touch the database", async () => {
  const read = new Request("https://kubcode.dev/api/interactions?kind=tool&slug=remotion", { headers: { host: "kubcode.dev" } });
  // "Off" is a normal state (e.g. previews): the read says so without an error status.
  const off = await handlePageState(read, { ...deps(untouchable, AUTH_ENV) });
  assert.equal(off.status, 200);
  assert.deepEqual(await off.json(), { available: false });
  const broken = await handlePageState(read, deps(untouchable, { ...AUTH_ENV, KUBCODE_INTERACTIONS_ENABLED: "true", KUBCODE_ACCOUNTS_ENABLED: "true" }));
  await expectError(broken, 503, "ACCOUNTS_UNAVAILABLE");
  await expectError(await handleStar(await write("/api/interactions/star", { kind: "tool", slug: "remotion" }), deps(untouchable, AUTH_ENV)), 503, "ACCOUNTS_DISABLED");
});

test("writes reject bad origin, unknown pages, bad bodies and signed-out callers before the database", async () => {
  const d = deps(untouchable);
  await expectError(await handleStar(await write("/api/interactions/star", { kind: "tool", slug: "remotion" }, { origin: "https://evil.example" }), d), 403, "BAD_ORIGIN");
  await expectError(await handleStar(await write("/api/interactions/star", { kind: "tool", slug: "nope" }), d), 404, "PAGE_NOT_FOUND");
  await expectError(await handleStar(await write("/api/interactions/star", { kind: "article", slug: "remotion" }), d), 400, "BAD_REQUEST");
  await expectError(await handleStar(await write("/api/interactions/star", { kind: "tool", slug: "remotion", extra: 1 }), d), 400, "BAD_REQUEST");
  await expectError(await handleStar(await write("/api/interactions/star", { kind: "tool", slug: "remotion" }, { signedIn: false }), d), 401, "NOT_SIGNED_IN");
  await expectError(await handleComment(await write("/api/interactions/comments", { kind: "tool", slug: "remotion", body: 5, parentId: null }), d), 400, "BAD_REQUEST");
  await expectError(await handleCommentHide(await write(`/api/interactions/comments/not-a-uuid/hide`, { hidden: true }), "not-a-uuid", d), 400, "BAD_REQUEST");
});

test("a star toggle reaches the store with the session claims and returns its result", async () => {
  let seen: unknown;
  const res = await handleStar(
    await write("/api/interactions/star", { kind: "tool", slug: "remotion" }),
    deps({ toggleStar: async (s, p) => ((seen = { uid: s.uid, p }), { ok: true, starred: true, stars: 3 }) }),
  );
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true, starred: true, stars: 3 });
  assert.deepEqual(seen, { uid: UID, p: { kind: "tool", slug: "remotion" } });
});

test("store refusals map to stable HTTP errors with Thai messages", async () => {
  const cases: Array<[string, number]> = [
    ["RATE_LIMITED", 429],
    ["COMMENT_TOO_SOON", 429],
    ["COMMENT_LINKS", 422],
    ["COMMENT_DUPLICATE", 409],
    ["FORBIDDEN", 403],
    ["NOT_FOUND", 404],
    ["NOT_SIGNED_IN", 401],
  ];
  for (const [code, status] of cases) {
    const res = await handleComment(
      await write("/api/interactions/comments", { kind: "tool", slug: "remotion", body: "สวัสดี", parentId: null }),
      deps({ addComment: async () => ({ ok: false, code }) as never }),
    );
    await expectError(res, status, code);
  }
});

test("comment id routes: delete has no body, hide and report go to the store", async () => {
  const calls: string[] = [];
  const store: Partial<InteractionStore> = {
    deleteComment: async (_s, id) => (calls.push(`delete ${id}`), { ok: true }),
    setHidden: async (_s, id, hidden) => (calls.push(`hide ${id} ${hidden}`), { ok: true }),
    report: async (_s, id) => (calls.push(`report ${id}`), { ok: true }),
  };
  const del = new Request(`https://kubcode.dev/api/interactions/comments/${CID}`, {
    method: "DELETE",
    headers: { host: "kubcode.dev", origin: "https://kubcode.dev", "x-kubcode-csrf": CSRF, cookie: `__Host-kubcode-csrf=${CSRF}; ${await sessionCookie()}` },
  });
  assert.equal((await handleCommentDelete(del, CID, deps(store))).status, 200);
  assert.equal((await handleCommentHide(await write(`/x`, { hidden: true }), CID, deps(store))).status, 200);
  assert.equal((await handleCommentReport(await write(`/x`, {}), CID, deps(store))).status, 200);
  assert.deepEqual(calls, [`delete ${CID}`, `hide ${CID} true`, `report ${CID}`]);
});

test("page state is public and passes a null viewer when signed out", async () => {
  let viewer: unknown = "unset";
  const read = new Request("https://kubcode.dev/api/interactions?kind=tool&slug=remotion", { headers: { host: "kubcode.dev" } });
  const res = await handlePageState(
    read,
    deps({ pageState: async (_p, v) => ((viewer = v), { stars: 1, starred: false, viewer: { signedIn: false, isOwner: false }, comments: [], commentCount: 0, nextCursor: null }) }),
  );
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("cache-control"), "no-store");
  assert.equal(viewer, null);
  assert.equal((await res.json()).stars, 1);
});

test("a database failure is a generic 503 that leaks nothing", async () => {
  const logs: string[] = [];
  const original = console.error;
  console.error = (...a: unknown[]) => void logs.push(a.join(" "));
  try {
    const res = await handleStar(
      await write("/api/interactions/star", { kind: "tool", slug: "remotion" }),
      deps({ toggleStar: async () => Promise.reject(Object.assign(new Error("FIXTURE secret=LEAK"), { code: "08006" })) }),
    );
    await expectError(res, 503, "ACCOUNTS_UNAVAILABLE");
  } finally {
    console.error = original;
  }
  assert.ok(logs.every((l) => !l.includes("LEAK")));
});

test("the public name route validates and saves through the store", async () => {
  const res = await handlePublicName(
    await write("/api/interactions/profile", { publicName: "JK" }),
    deps({ setPublicName: async (_s, n) => ({ ok: true, publicName: n }) }),
  );
  assert.deepEqual(await res.json(), { ok: true, publicName: "JK" });
  await expectError(
    await handlePublicName(await write("/api/interactions/profile", { publicName: 3 }), deps(untouchable)),
    400,
    "BAD_REQUEST",
  );
});

test("accounts on but interactions not enabled (0002 not applied yet): reads say unavailable, writes refuse, no database", async () => {
  const read = new Request("https://kubcode.dev/api/interactions?kind=tool&slug=remotion", { headers: { host: "kubcode.dev" } });
  const off = await handlePageState(read, deps(untouchable, ACCOUNTS_ONLY_ENV));
  assert.deepEqual([off.status, await off.json()], [200, { available: false }]);
  await expectError(
    await handleStar(await write("/api/interactions/star", { kind: "tool", slug: "remotion" }), deps(untouchable, ACCOUNTS_ONLY_ENV)),
    503,
    "INTERACTIONS_DISABLED",
  );
});

test("page state passes a validated cursor and clamps the page size", async () => {
  let seen: unknown;
  const store = { pageState: async (_p: unknown, _v: unknown, o: unknown) => ((seen = o), { stars: 0, starred: false, viewer: { signedIn: false, isOwner: false }, comments: [], commentCount: 0, nextCursor: null }) };
  const url = (q: string) => new Request(`https://kubcode.dev/api/interactions?kind=tool&slug=remotion${q}`, { headers: { host: "kubcode.dev" } });
  assert.equal((await handlePageState(url(`&before=${CID}&limit=500`), deps(store as never))).status, 200);
  assert.deepEqual(seen, { before: CID, limit: 20 });
  await handlePageState(url(""), deps(store as never));
  assert.deepEqual(seen, { before: null, limit: 20 });
  await handlePageState(url("&limit=5"), deps(store as never));
  assert.deepEqual(seen, { before: null, limit: 5 });
  await expectError(await handlePageState(url("&before=nope"), deps(untouchable)), 400, "BAD_REQUEST");
});
