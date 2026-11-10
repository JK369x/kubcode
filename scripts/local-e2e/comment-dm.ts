// Local end-to-end for Instagram comment → DM (docs/dev/local-e2e.md,
// "Comment to DM"). Run it through scripts/local-e2e/run-comment-dm.sh, which
// pipes the Zernio key on stdin.
//
// Uses the production Instagram account (found read-only) seeded into a
// throwaway database with one rule, and the protected local runner (no
// connect/disconnect). Zernio's webhooks go to production, so comments arrive
// here through catch-up, which reads the account's own recent posts.
//
// Default is a dry run: catch-up only. It records the comments the rule
// matches and shows them; nothing is sent. With KUBCODE_LOCAL_E2E_SEND set to
// "yes-send-real-dm" it then runs one worker tick, which sends the real
// private reply (and the public reply after it) from the account.
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import { randomBytes } from "node:crypto";
import { createPgAccountStore } from "../../lib/accounts/store";
import { throwawayDb } from "../../tests/accounts-db/harness";
import { guardedZernio } from "./zernio-guard";

const KEYWORD = process.env.KUBCODE_LOCAL_E2E_KEYWORD ?? "kubcode-test";
const POST = process.env.KUBCODE_LOCAL_E2E_POST || null;
const DM_TEXT = process.env.KUBCODE_LOCAL_E2E_DM ?? "ทดสอบระบบตอบคอมเมนต์ของ kubcode: https://kubcode.dev/";
const PUBLIC_REPLY = process.env.KUBCODE_LOCAL_E2E_REPLY ?? "ส่งให้ใน DM แล้วนะ";
const SEND = process.env.KUBCODE_LOCAL_E2E_SEND === "yes-send-real-dm";

const log = (msg: string) => console.log(`[local-e2e:comment-dm] ${msg}`);

async function readKey(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const c of process.stdin) chunks.push(c as Buffer);
  const key = Buffer.concat(chunks).toString("utf8").trim();
  if (!/^(sk|zrk)_[A-Za-z0-9_]+$/.test(key)) throw new Error("stdin does not carry a Zernio key (run through run-comment-dm.sh)");
  return key;
}

async function freePort(): Promise<number> {
  const s = createServer();
  await new Promise<void>((r) => s.listen(0, "127.0.0.1", r));
  const port = (s.address() as { port: number }).port;
  await new Promise<void>((r) => s.close(() => r()));
  return port;
}

async function main() {
  const key = await readKey();
  const zernio = guardedZernio(key, { cancelPosts: false });
  const listed = await zernio("GET", "/accounts");
  assert.equal(listed.status, 200, `GET /accounts: ${listed.status}`);
  const accounts = (listed.body?.accounts ?? []).filter((a: any) => a.platform === "instagram" && a.isActive !== false);
  if (accounts.length !== 1) throw new Error(`expected one active Instagram account at Zernio, found ${accounts.length}`);
  const acct = accounts[0];
  const profileId = typeof acct.profileId === "string" ? acct.profileId : acct.profileId?._id;
  log(`account: @${acct.username ?? "?"}; rule: "${KEYWORD}" on ${POST ? `post ${POST}` : "all posts"}; ${SEND ? "SEND" : "dry run (no DM, no reply)"}`);

  const db = await throwawayDb();
  const kids: ChildProcess[] = [];
  let failure: unknown;
  try {
    const store = createPgAccountStore(db.pool);
    const login = await store.resolveLogin({ provider: "google", subject: "g-local-comment-owner", displayName: "Local Comment Owner", email: "local-comment@example.test" });
    if (login.status !== "ok") throw new Error("seed login");
    await db.pool.query("UPDATE kubcode_accounts.users SET is_owner = true WHERE id = $1", [login.userId]);
    const ws = (await db.pool.query("INSERT INTO kubcode_accounts.workspaces (name) VALUES ('Local comment') RETURNING id")).rows[0].id;
    await db.pool.query("INSERT INTO kubcode_accounts.workspace_members (workspace_id, user_id, role) VALUES ($1, $2, 'owner')", [ws, login.userId]);
    await db.pool.query("INSERT INTO kubcode_accounts.provider_profiles (workspace_id, provider, provider_ref) VALUES ($1, 'zernio', $2)", [ws, profileId]);
    const channel = (
      await db.pool.query(
        "INSERT INTO kubcode_accounts.channels (workspace_id, platform, display_name, handle, platform_account_id) VALUES ($1, 'instagram', $2, $3, $4) RETURNING id",
        [ws, acct.displayName ?? acct.username ?? "instagram", acct.username ?? null, acct.platformUserId ?? null],
      )
    ).rows[0].id as string;
    await db.pool.query("INSERT INTO kubcode_accounts.channel_connections (channel_id, provider, provider_ref, status) VALUES ($1, 'zernio', $2, 'active')", [channel, acct._id]);
    await db.pool.query(
      "INSERT INTO kubcode_accounts.automation_rules (channel_id, keywords, platform_post_id, public_reply, dm_text) VALUES ($1, $2, $3, $4, $5)",
      [channel, [KEYWORD], POST, PUBLIC_REPLY, DM_TEXT],
    );

    const dbName = (await db.pool.query("SELECT current_database() AS d")).rows[0].d as string;
    const base = new URL(process.env.KUBCODE_TEST_DATABASE_URL!);
    const workerUrl = `postgres://${base.username}:${base.password}@${base.host}/${dbName}?options=${encodeURIComponent("-c role=kubcode_worker")}`;
    const port = await freePort();
    const runner = spawn(
      "cargo",
      ["run", "-q", "--manifest-path", "services/Cargo.toml", "-p", "kubcode-publishing-lambda", "--example", "publishing_local"],
      {
        env: {
          ...process.env,
          KUBCODE_LOCAL_PORT: String(port),
          KUBCODE_LOCAL_WORKER_DB_URL: workerUrl,
          KUBCODE_LOCAL_HMAC_KEY: randomBytes(32).toString("hex"),
          KUBCODE_LOCAL_OPS_KEY: randomBytes(32).toString("hex"),
          KUBCODE_LOCAL_PROTECT_ACCOUNTS: "1",
        },
        stdio: ["pipe", "pipe", "inherit"],
      },
    );
    kids.push(runner);
    runner.stdin!.end(`${key}\n`);
    let ready = false;
    runner.stdout!.on("data", (d: Buffer) => {
      for (const line of d.toString("utf8").split("\n").filter(Boolean)) {
        if (line.includes("accounts protected")) ready = true;
        console.log(`  ${line}`);
      }
    });
    for (let i = 0; !ready; i++) {
      if (i > 600) throw new Error("runner did not start in protected mode");
      await new Promise((r) => setTimeout(r, 500));
    }
    const post = async (path: string) => (await fetch(`http://127.0.0.1:${port}${path}`, { method: "POST" })).json();

    const caught = await post("/catch-up");
    assert.equal(caught.ok, true, JSON.stringify(caught));
    const pending = (
      await db.pool.query(
        "SELECT platform_post_id, received_at FROM kubcode_accounts.comment_items WHERE status = 'pending' ORDER BY received_at",
      )
    ).rows;
    log(`catch-up kept ${caught.kept} matching comment(s): ${pending.map((p) => `post ${p.platform_post_id}`).join(", ") || "none"}`);
    if (!SEND) {
      log("DRY RUN: nothing was sent. Set KUBCODE_LOCAL_E2E_SEND=yes-send-real-dm to send them.");
      return;
    }
    const tick = await post("/work");
    log(`worker: ${JSON.stringify(tick)}`);
    const ledger = (await db.pool.query("SELECT dm_state, reply_state, error_code FROM kubcode_accounts.dm_ledger ORDER BY created_at")).rows;
    for (const l of ledger) log(`DM ${l.dm_state}, public reply ${l.reply_state}${l.error_code ? ` (${l.error_code})` : ""}`);
    assert.ok(ledger.length > 0, "a DM was attempted");
  } catch (error) {
    failure = error;
  } finally {
    // Nothing at Zernio is deleted: the account is production's. Sent DMs and
    // replies stay on Instagram.
    for (const k of kids) k.kill("SIGTERM");
    await db.cleanup().catch(() => undefined);
  }
  if (failure) {
    console.error(`[local-e2e:comment-dm] FAIL: ${failure instanceof Error ? failure.message : String(failure)}`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(`[local-e2e:comment-dm] FAIL: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
