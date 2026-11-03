// Unit tests for the CI production promote/smoke logic against a mocked
// Vercel API and site. No network: every request goes to the fake fetch.
import test from "node:test";
import assert from "node:assert/strict";
import { postPromote, promoteAndWait, type ReleaseConfig } from "../lib/ci/vercel-release";

const NEW = "dpl_new";
const PREV = "dpl_prev";

type Call = { method: string; url: string; auth: string | null };

// A fake Vercel API + kubcode.dev. `live` is what the domain points at; a
// promote request moves it after `lag` further GETs.
function fakeWorld(opts: {
  live: string;
  promoteStatus?: number;
  lag?: number;
  neverMoves?: boolean;
  providers?: unknown;
  accountStatus?: number;
  smokeFailsFor?: string;
}) {
  let live = opts.live;
  let pending: { id: string; after: number } | null = null;
  const calls: Call[] = [];
  const fetchImpl = async (input: string | URL, init?: RequestInit): Promise<Response> => {
    const url = String(input);
    const method = init?.method ?? "GET";
    const headers = new Headers(init?.headers);
    calls.push({ method, url, auth: headers.get("authorization") });
    const promote = url.match(/^https:\/\/api\.vercel\.com\/v10\/projects\/prj_x\/promote\/([^?]+)\?teamId=team_x$/);
    if (method === "POST" && promote) {
      if (!opts.neverMoves) pending = { id: promote[1], after: opts.lag ?? 0 };
      return new Response(null, { status: opts.promoteStatus ?? 201 });
    }
    if (method === "GET" && url === "https://api.vercel.com/v13/deployments/kubcode.dev?teamId=team_x") {
      if (pending) {
        if (pending.after <= 0) {
          live = pending.id;
          pending = null;
        } else pending.after--;
      }
      return Response.json({ id: live, readyState: "READY" });
    }
    const failing = opts.smokeFailsFor !== undefined && live === opts.smokeFailsFor;
    if (url === "https://kubcode.dev/api/auth/providers")
      return failing
        ? new Response("boom", { status: 500 })
        : Response.json(opts.providers ?? { google: {}, line: {} });
    if (url === "https://kubcode.dev/account") return new Response("ok", { status: failing ? 503 : (opts.accountStatus ?? 200) });
    return new Response("unexpected", { status: 599 });
  };
  return { fetchImpl, calls, live: () => live };
}

const config = (fetchImpl: typeof fetch): ReleaseConfig => ({
  token: "tok_secret",
  teamId: "team_x",
  projectId: "prj_x",
  domain: "kubcode.dev",
  origin: "https://kubcode.dev",
  fetch: fetchImpl,
  sleep: async () => undefined,
  timeoutMs: 1_000,
  intervalMs: 100,
});

test("promote posts to the project promote endpoint and waits until the domain serves the new id", async () => {
  const w = fakeWorld({ live: PREV, lag: 3 });
  const r = await promoteAndWait(config(w.fetchImpl as typeof fetch), NEW);
  assert.deepEqual(r, { ok: true, live: NEW });
  const post = w.calls.filter((c) => c.method === "POST");
  assert.deepEqual(post.map((c) => c.url), ["https://api.vercel.com/v10/projects/prj_x/promote/dpl_new?teamId=team_x"]);
  assert.equal(post[0].auth, "Bearer tok_secret");
  assert.equal(w.live(), NEW);
});

test("promote fails on a non-2xx API response without polling", async () => {
  const w = fakeWorld({ live: PREV, promoteStatus: 403 });
  const r = await promoteAndWait(config(w.fetchImpl as typeof fetch), NEW);
  assert.equal(r.ok, false);
  assert.match(r.reason ?? "", /HTTP 403/);
  assert.equal(w.calls.filter((c) => c.method === "GET").length, 0);
});

test("promote times out when the domain never moves", async () => {
  const w = fakeWorld({ live: PREV, neverMoves: true });
  const r = await promoteAndWait(config(w.fetchImpl as typeof fetch), NEW);
  assert.equal(r.ok, false);
  assert.match(r.reason ?? "", /timed out.*dpl_prev/);
});

test("post-promote: live == new and smoke passes -> success, no re-promote", async () => {
  const w = fakeWorld({ live: NEW });
  const r = await postPromote(config(w.fetchImpl as typeof fetch), NEW, PREV);
  assert.deepEqual(r, { ok: true, outcome: "promoted_and_healthy", live: NEW });
  assert.equal(w.calls.some((c) => c.method === "POST"), false);
});

test("post-promote: live == previous -> promote never happened, fail without any action", async () => {
  const w = fakeWorld({ live: PREV });
  const r = await postPromote(config(w.fetchImpl as typeof fetch), NEW, PREV);
  assert.equal(r.ok, false);
  assert.equal(r.outcome, "not_promoted");
  assert.equal(w.calls.some((c) => c.method === "POST"), false);
  assert.equal(w.calls.some((c) => c.url.startsWith("https://kubcode.dev/")), false, "no smoke against the old deployment");
});

test("post-promote: live is neither new nor previous -> unexpected, no action", async () => {
  const w = fakeWorld({ live: "dpl_someoneElse9" });
  const r = await postPromote(config(w.fetchImpl as typeof fetch), NEW, PREV);
  assert.equal(r.outcome, "unexpected_live");
  assert.equal(r.ok, false);
  assert.equal(w.calls.some((c) => c.method === "POST"), false);
});

test("post-promote: live == new but smoke fails -> re-promote previous and wait for it", async () => {
  const w = fakeWorld({ live: NEW, smokeFailsFor: NEW, lag: 1 });
  const r = await postPromote(config(w.fetchImpl as typeof fetch), NEW, PREV);
  assert.equal(r.ok, false);
  assert.equal(r.outcome, "rolled_back");
  assert.match(r.reason ?? "", /providers/);
  assert.deepEqual(
    w.calls.filter((c) => c.method === "POST").map((c) => c.url),
    ["https://api.vercel.com/v10/projects/prj_x/promote/dpl_prev?teamId=team_x"],
  );
  assert.equal(w.live(), PREV);
});

test("post-promote: wrong provider set or /account failure also count as a failed smoke", async () => {
  for (const extra of [{ providers: { google: {} } }, { accountStatus: 500 }]) {
    const w = fakeWorld({ live: NEW, lag: 0, ...extra });
    const r = await postPromote(config(w.fetchImpl as typeof fetch), NEW, PREV);
    assert.equal(r.outcome, "rolled_back", JSON.stringify(extra));
  }
});

test("post-promote: a failed re-promote is reported for manual rollback", async () => {
  const w = fakeWorld({ live: NEW, smokeFailsFor: NEW, promoteStatus: 500 });
  const r = await postPromote(config(w.fetchImpl as typeof fetch), NEW, PREV);
  assert.equal(r.outcome, "rollback_failed");
  assert.equal(r.ok, false);
});

test("results never include the API token", async () => {
  const w = fakeWorld({ live: PREV, promoteStatus: 401 });
  const r = await promoteAndWait(config(w.fetchImpl as typeof fetch), NEW);
  assert.ok(!JSON.stringify(r).includes("tok_secret"));
});
