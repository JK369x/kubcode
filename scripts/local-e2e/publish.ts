// Local end-to-end for publishing (docs/dev/local-e2e.md, "Publish"). Run it
// through scripts/local-e2e/run-publish.sh, which pipes the Zernio key on stdin.
//
// Uses the production Zernio profile and account of one connected channel
// (found read-only), seeded into a throwaway local database, and the owner's
// real `kubcode` CLI talking to the local runner instead of the ops Lambda.
// The runner refuses connect/complete/disconnect (KUBCODE_LOCAL_PROTECT_ACCOUNTS)
// and this script's Zernio client may only read (zernio-guard.ts), so the
// production account is never changed or deleted.
//
// Default is a dry run: push, then the CLI's confirmation summary, answered
// with Enter (cancel). It posts only when KUBCODE_LOCAL_E2E_POST equals the
// clip id. The post is private unless KUBCODE_LOCAL_E2E_VISIBILITY says otherwise.
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { homedir } from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { createPgAccountStore } from "../../lib/accounts/store";
import { throwawayDb } from "../../tests/accounts-db/harness";
import { guardedZernio } from "./zernio-guard";

const PLATFORM = process.argv[2] ?? "youtube";
const CLIP = process.env.KUBCODE_LOCAL_E2E_CLIP ?? "";
const TITLE = process.env.KUBCODE_LOCAL_E2E_TITLE;
const VISIBILITY = process.env.KUBCODE_LOCAL_E2E_VISIBILITY ?? "private";
const POST = process.env.KUBCODE_LOCAL_E2E_POST === CLIP && CLIP !== "";
const LEAD_MINUTES = Number(process.env.KUBCODE_LOCAL_E2E_LEAD_MINUTES ?? "10");
const STUDIO = process.env.KUBCODE_STUDIO ?? path.join(homedir(), "Studio", "clips");
const OUT = path.resolve(".qa/local-e2e/publish");
const WAIT_MINUTES = LEAD_MINUTES + 20;
// Wiring check with no Zernio at all: placeholder ids, dry run only.
const OFFLINE = process.env.KUBCODE_LOCAL_E2E_OFFLINE === "1";

const log = (msg: string) => console.log(`[local-e2e:publish] ${msg}`);

async function readKey(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const c of process.stdin) chunks.push(c as Buffer);
  const key = Buffer.concat(chunks).toString("utf8").trim();
  if (!/^(sk|zrk)_[A-Za-z0-9_]+$/.test(key)) throw new Error("stdin does not carry a Zernio key (run through run-publish.sh)");
  return key;
}

async function freePort(): Promise<number> {
  const s = createServer();
  await new Promise<void>((r) => s.listen(0, "127.0.0.1", r));
  const port = (s.address() as { port: number }).port;
  await new Promise<void>((r) => s.close(() => r()));
  return port;
}

/** Runs the real CLI against the local runner; resolves with its output. */
function cli(args: string[], env: NodeJS.ProcessEnv, input = ""): Promise<{ code: number; out: string }> {
  return new Promise((resolve) => {
    const p = spawn("cargo", ["run", "-q", "--manifest-path", "services/Cargo.toml", "-p", "kubcode-cli", "--", ...args], {
      env,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let out = "";
    p.stdout.on("data", (d: Buffer) => (out += d.toString("utf8")));
    p.stderr.on("data", (d: Buffer) => (out += d.toString("utf8")));
    p.stdin.end(input);
    p.on("close", (code) => resolve({ code: code ?? 1, out }));
  });
}

function bangkokIso(d: Date): string {
  const t = new Date(d.getTime() + 7 * 3600_000).toISOString().slice(0, 19);
  return `${t}+07:00`;
}

async function main() {
  assert.match(CLIP, /^[A-Za-z0-9_-]{1,120}$/, "set KUBCODE_LOCAL_E2E_CLIP to the clip id");
  assert.ok(!(OFFLINE && POST), "offline mode never posts");
  const key = await readKey();
  const zernio = guardedZernio(key, { cancelPosts: false });

  // ---- the production account, read-only
  const listed = OFFLINE
    ? { status: 200, body: { accounts: [{ _id: "offline-account", platform: PLATFORM, profileId: "offline-profile", displayName: "Offline Channel", isActive: true }] } }
    : await zernio("GET", "/accounts");
  assert.equal(listed.status, 200, `GET /accounts: ${listed.status}`);
  const accounts = (listed.body?.accounts ?? []).filter((a: any) => a.platform === PLATFORM && a.isActive !== false);
  if (accounts.length !== 1) {
    throw new Error(`expected one active ${PLATFORM} account at Zernio, found ${accounts.length}: ${accounts.map((a: any) => a.displayName ?? a.username).join(", ")}`);
  }
  const acct = accounts[0];
  const profileId = typeof acct.profileId === "string" ? acct.profileId : acct.profileId?._id;
  assert.ok(profileId, "account has a profile id");
  log(`target: ${acct.displayName ?? acct.username} (${PLATFORM}), visibility ${VISIBILITY}`);

  const db = await throwawayDb();
  const kids: ChildProcess[] = [];
  const scratch = path.join(OUT, randomBytes(4).toString("hex"));
  let failure: unknown;
  try {
    // ---- local database: one owner, the production profile and account
    const accountsStore = createPgAccountStore(db.pool);
    const login = await accountsStore.resolveLogin({ provider: "google", subject: "g-local-publish-owner", displayName: "Local Publish Owner", email: "local-publish@example.test" });
    if (login.status !== "ok") throw new Error("seed login");
    await db.pool.query("UPDATE kubcode_accounts.users SET is_owner = true WHERE id = $1", [login.userId]);
    const ws = (await db.pool.query("INSERT INTO kubcode_accounts.workspaces (name) VALUES ('Local publish') RETURNING id")).rows[0].id;
    await db.pool.query("INSERT INTO kubcode_accounts.workspace_members (workspace_id, user_id, role) VALUES ($1, $2, 'owner')", [ws, login.userId]);
    await db.pool.query("INSERT INTO kubcode_accounts.provider_profiles (workspace_id, provider, provider_ref) VALUES ($1, 'zernio', $2)", [ws, profileId]);
    const channel = (
      await db.pool.query(
        "INSERT INTO kubcode_accounts.channels (workspace_id, platform, display_name, handle, platform_account_id) VALUES ($1, $2, $3, $4, $5) RETURNING id",
        [ws, PLATFORM, acct.displayName ?? acct.username ?? PLATFORM, acct.username ?? null, acct.platformUserId ?? null],
      )
    ).rows[0].id as string;
    await db.pool.query("INSERT INTO kubcode_accounts.channel_connections (channel_id, provider, provider_ref, status) VALUES ($1, 'zernio', $2, 'active')", [channel, acct._id]);

    // ---- a scratch copy of the clip (title for the test), and the media dir
    mkdirSync(scratch, { recursive: true });
    const studio = path.join(scratch, "studio");
    cpSync(path.join(STUDIO, CLIP), path.join(studio, CLIP), { recursive: true, filter: (src) => !src.includes(`${path.sep}source`) });
    if (TITLE) {
      const f = path.join(studio, CLIP, "clip.json");
      const clip = JSON.parse(readFileSync(f, "utf8"));
      clip.title_th = TITLE;
      writeFileSync(f, JSON.stringify(clip, null, 2));
    }
    const media = path.join(scratch, "media");
    mkdirSync(media, { recursive: true });

    // ---- runner: accounts protected, /ops on, media from the local dir
    const dbName = (await db.pool.query("SELECT current_database() AS d")).rows[0].d as string;
    const base = new URL(process.env.KUBCODE_TEST_DATABASE_URL!);
    const workerUrl = `postgres://${base.username}:${base.password}@${base.host}/${dbName}?options=${encodeURIComponent("-c role=kubcode_worker")}`;
    const opsKey = randomBytes(32).toString("hex");
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
          KUBCODE_LOCAL_OPS_KEY: opsKey,
          KUBCODE_LOCAL_MEDIA_DIR: media,
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

    // ---- the owner's CLI, local mode
    const env = {
      ...process.env,
      KUBCODE_LOCAL_OPS_URL: `http://127.0.0.1:${port}`,
      KUBCODE_LOCAL_OPS_KEY: opsKey,
      KUBCODE_LOCAL_MEDIA_DIR: media,
      KUBCODE_STUDIO: studio,
    };
    const who = await cli(["whoami"], env);
    log(`kubcode whoami:\n${who.out.trim()}`);
    assert.equal(who.code, 0, "whoami");
    const at = bangkokIso(new Date(Date.now() + LEAD_MINUTES * 60_000));
    const sched = await cli(
      ["schedule", CLIP, "--channel", channel, "--at", at, "--visibility", VISIBILITY],
      env,
      POST ? `${CLIP}\n` : "\n",
    );
    console.log(sched.out.trim());
    if (!POST) {
      assert.match(sched.out, /ยกเลิก/, "dry run cancels at the confirmation");
      const posts = Number((await db.pool.query("SELECT count(*) AS n FROM kubcode_accounts.deliveries WHERE provider_ref IS NOT NULL")).rows[0].n);
      assert.equal(posts, 0, "nothing reached Zernio");
      log("DRY RUN PASS: pushed, summary shown, cancelled; nothing was sent to Zernio");
      return;
    }
    assert.equal(sched.code, 0, "schedule");
    const d = (await db.pool.query("SELECT status, provider_ref FROM kubcode_accounts.deliveries")).rows[0];
    assert.ok(d?.provider_ref, `delivery handed to Zernio (status ${d?.status})`);
    log(`scheduled at ${at}; Zernio post ${d.provider_ref}; waiting for it to publish (${WAIT_MINUTES} min max)`);

    // ---- follow the post at Zernio (webhooks go to production, not here)
    const until = Date.now() + WAIT_MINUTES * 60_000;
    for (;;) {
      const p = await zernio("GET", `/posts/${encodeURIComponent(d.provider_ref)}`);
      const entry = p.body?.post?.platforms?.[0];
      const status = entry?.status ?? p.body?.post?.status;
      if (status === "published") {
        log(`PASS: published (${VISIBILITY}) ${entry?.platformPostUrl ?? entry?.publishedUrl ?? ""}`);
        log("check in YouTube Studio that the designed cover is the thumbnail");
        break;
      }
      if (status === "failed") throw new Error(`Zernio reports failed: ${entry?.errorCategory ?? "?"} ${entry?.errorMessage ?? ""}`);
      if (Date.now() > until) throw new Error(`still ${status} after ${WAIT_MINUTES} min`);
      await new Promise((r) => setTimeout(r, 30_000));
    }
  } catch (error) {
    failure = error;
  } finally {
    // Nothing at Zernio is deleted: the profile and account are production's.
    for (const k of kids) k.kill("SIGTERM");
    rmSync(scratch, { recursive: true, force: true });
    await db.cleanup().catch(() => undefined);
  }
  if (failure) {
    console.error(`[local-e2e:publish] FAIL: ${failure instanceof Error ? failure.message : String(failure)}`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(`[local-e2e:publish] FAIL: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
