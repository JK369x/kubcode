import { test } from "node:test";
import assert from "node:assert/strict";
import { encode } from "next-auth/jwt";
import { accountToken } from "../lib/accounts/session";
import { handleWaitlistState, handleWaitlistToggle } from "../lib/waitlist/routes";
import type { WaitlistStore } from "../lib/waitlist/store";
import { waitlistTargetOpen, waitlistTargets } from "../lib/waitlist/targets";
import { PLANS } from "../lib/plans";
import { ROADMAP } from "../lib/roadmap";

const AUTH_ENV = Object.freeze({
  NEXTAUTH_SECRET: "FIXTURE-ONLY-session-secret-000000000000000001",
  NEXTAUTH_URL: "https://kubcode.dev",
  GOOGLE_CLIENT_ID: "123456789012-fixtureonly0abc.apps.googleusercontent.com",
  GOOGLE_CLIENT_SECRET: "FIXTURE-ONLY-client-secret-0001",
  LINE_CLIENT_ID: "2000000001",
  LINE_CLIENT_SECRET: "FIXTURE-ONLY-line-channel-secret-01",
});
const ON_ENV = Object.freeze({
  ...AUTH_ENV,
  KUBCODE_ACCOUNTS_ENABLED: "true",
  DATABASE_URL: "postgres://fixture:fixture@127.0.0.1:5432/kubcode_fixture_test",
});
const CSRF = "C".repeat(43);
const untouchable = new Proxy({}, { get: (_t, k) => () => assert.fail(`store.${String(k)} must not be called`) }) as WaitlistStore;

async function sessionCookie() {
  const token = accountToken({ userId: "6f0f5e1c-0000-4000-8000-00000000f1a1", sessionVersion: 1, provider: "google", subject: "g-1", name: "N", email: "g@example.test" });
  return `__Secure-next-auth.session-token=${await encode({ token, secret: AUTH_ENV.NEXTAUTH_SECRET })}`;
}

async function post(body: unknown, opts: { signedIn?: boolean; csrf?: string } = {}) {
  const cookies = [`__Host-kubcode-csrf=${CSRF}`];
  if (opts.signedIn !== false) cookies.push(await sessionCookie());
  return new Request("https://kubcode.dev/api/waitlist", {
    method: "POST",
    headers: {
      host: "kubcode.dev",
      origin: "https://kubcode.dev",
      "sec-fetch-site": "same-origin",
      "content-type": "application/json",
      "x-kubcode-csrf": opts.csrf ?? CSRF,
      cookie: cookies.join("; "),
    },
    body: JSON.stringify(body),
  });
}

const deps = (store: Partial<WaitlistStore>, env: Record<string, string> = ON_ENV) => ({ env, storeFor: () => store as WaitlistStore });

test("targets: only coming-soon plans and unopened roadmap items can be joined", () => {
  for (const p of PLANS) assert.equal(waitlistTargetOpen({ kind: "plan", id: p.id }), p.status === "coming_soon", p.id);
  for (const i of ROADMAP) assert.equal(waitlistTargetOpen({ kind: "roadmap", id: i.id }), i.status !== "now", i.id);
  assert.equal(waitlistTargetOpen({ kind: "plan", id: "nope" }), false);
  const ids = waitlistTargets().map((t) => `${t.kind}:${t.id}`);
  assert.equal(new Set(ids).size, ids.length);
  for (const t of waitlistTargets()) assert.match(t.id, /^[a-z0-9]+(-[a-z0-9]+){0,5}$/, "fits the 0012 CHECK");
});

test("toggle: joins a coming-soon plan for the signed-in member", async () => {
  let got: unknown;
  const res = await handleWaitlistToggle(await post({ kind: "plan", id: "skill-pack" }), deps({ toggle: async (_s, t) => ((got = t), { ok: true, joined: true }) }));
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { joined: true });
  assert.deepEqual(got, { kind: "plan", id: "skill-pack" });
});

test("toggle: refuses available plans, live roadmap items, unknown ids and extra keys before the store", async () => {
  for (const body of [
    { kind: "plan", id: "social" },
    { kind: "plan", id: "free" },
    { kind: "roadmap", id: "scheduled-posts" },
    { kind: "plan", id: "../x" },
    { kind: "other", id: "skill-pack" },
    { kind: "plan", id: "skill-pack", extra: 1 },
  ]) {
    const res = await handleWaitlistToggle(await post(body), deps(untouchable));
    assert.equal(res.status, 400, JSON.stringify(body));
  }
});

test("toggle: signed out → 401, bad CSRF → 403, accounts off → 503, rate limit → 429", async () => {
  assert.equal((await handleWaitlistToggle(await post({ kind: "plan", id: "skill-pack" }, { signedIn: false }), deps(untouchable))).status, 401);
  assert.equal((await handleWaitlistToggle(await post({ kind: "plan", id: "skill-pack" }, { csrf: "D".repeat(43) }), deps(untouchable))).status, 403);
  assert.equal((await handleWaitlistToggle(await post({ kind: "plan", id: "skill-pack" }), deps(untouchable, AUTH_ENV))).status, 503);
  const limited = await handleWaitlistToggle(await post({ kind: "roadmap", id: "facebook" }), deps({ toggle: async () => ({ ok: false, code: "RATE_LIMITED" }) }));
  assert.equal(limited.status, 429);
});

test("state: off when accounts are off, signed-out without a session, joined list when signed in", async () => {
  const get = (cookie?: string) => new Request("https://kubcode.dev/api/waitlist", { headers: cookie ? { cookie } : {} });
  assert.deepEqual(await (await handleWaitlistState(get(), deps(untouchable, AUTH_ENV))).json(), { available: false });
  assert.deepEqual(await (await handleWaitlistState(get(), deps(untouchable))).json(), { available: true, signedIn: false, joined: [] });
  const res = await handleWaitlistState(get(await sessionCookie()), deps({ joined: async () => [{ kind: "plan", id: "skill-pack" }] }));
  assert.deepEqual(await res.json(), { available: true, signedIn: true, joined: [{ kind: "plan", id: "skill-pack" }] });
  assert.equal(res.headers.get("cache-control"), "no-store");
});
