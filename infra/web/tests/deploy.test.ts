// Behaviour tests for host/kubcode-deploy, the SSH forced command that is the
// only thing the CI deploy key can run. systemctl and the smoke check are
// replaced by stubs through KUBCODE_SYSTEMCTL / KUBCODE_SMOKE.
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, readlinkSync, statSync, symlinkSync, writeFileSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const SCRIPT = resolve(__dirname, "../host/kubcode-deploy");
const sha = (n: number) => n.toString(16).padStart(40, "0");

type Box = {
  root: string;
  log: string;
  run: (cmd: string, input?: Buffer, smokeOk?: boolean, restartOk?: boolean) => ReturnType<typeof spawnSync>;
};

function box(): Box {
  const dir = mkdtempSync(join(tmpdir(), "kubcode-deploy-"));
  const root = join(dir, "srv");
  const cache = join(dir, "cache");
  mkdirSync(root);
  mkdirSync(cache);
  const log = join(dir, "calls.log");
  writeFileSync(log, "");
  const systemctl = join(dir, "systemctl");
  writeFileSync(systemctl, `#!/bin/sh\necho "systemctl $*" >> "${log}"\n[ "$RESTART_OK" != 0 ]\n`);
  chmodSync(systemctl, 0o755);
  const smoke = join(dir, "smoke");
  // The stub reports which release `current` points at when the smoke runs.
  writeFileSync(smoke, `#!/bin/sh\necho "smoke $(readlink "${root}/current")" >> "${log}"\n[ "$SMOKE_OK" = 1 ]\n`);
  chmodSync(smoke, 0o755);
  return {
    root,
    log,
    run: (cmd, input, smokeOk = true, restartOk = true) =>
      spawnSync("bash", [SCRIPT], {
        input,
        env: {
          PATH: process.env.PATH,
          SSH_ORIGINAL_COMMAND: cmd,
          KUBCODE_ROOT: root,
          KUBCODE_CACHE: cache,
          KUBCODE_SYSTEMCTL: systemctl,
          KUBCODE_SMOKE: smoke,
          KUBCODE_MAX_BYTES: "200000",
          SMOKE_OK: smokeOk ? "1" : "0",
          RESTART_OK: restartOk ? "1" : "0",
        },
      }),
  };
}

// A release tarball shaped like the CI artifact.
function tarball(marker: string, extra?: (dir: string) => void): { bytes: Buffer; sum: string } {
  const dir = mkdtempSync(join(tmpdir(), "kubcode-rel-"));
  mkdirSync(join(dir, ".next", "cache"), { recursive: true });
  writeFileSync(join(dir, "server.js"), `// ${marker}\n`);
  extra?.(dir);
  const out = spawnSync("tar", ["-czf", "-", "-C", dir, "."]);
  assert.equal(out.status, 0, String(out.stderr));
  return { bytes: out.stdout, sum: createHash("sha256").update(out.stdout).digest("hex") };
}

const current = (b: Box) => readlinkSync(join(b.root, "current"));
const calls = (b: Box) => readFileSync(b.log, "utf8").trim().split("\n").filter(Boolean);
const deploy = (b: Box, n: number, smokeOk = true) => {
  const t = tarball(`release ${n}`);
  return b.run(`deploy ${sha(n)} ${t.sum}`, t.bytes, smokeOk);
};

test("deploy installs the release, switches current, restarts and smokes it", () => {
  const b = box();
  const r = deploy(b, 1);
  assert.equal(r.status, 0, String(r.stderr));
  assert.equal(current(b), join(b.root, "releases", sha(1)));
  assert.match(readFileSync(join(b.root, "releases", sha(1), "server.js"), "utf8"), /release 1/);
  assert.deepEqual(calls(b), [`systemctl restart kubcode-web.service`, `smoke ${join(b.root, "releases", sha(1))}`]);
});

test("the Next image cache lives outside the release (the app user can write it)", () => {
  const b = box();
  deploy(b, 1);
  const link = readlinkSync(join(b.root, "releases", sha(1), ".next", "cache"));
  assert.match(link, /cache$/);
});

test("the release is readable by the app user even if the archive root is private", () => {
  const b = box();
  // mktemp -d stages are 0700, and tar records that mode on "./".
  const t = tarball("private root", (dir) => {
    chmodSync(dir, 0o700);
    chmodSync(join(dir, "server.js"), 0o600);
  });
  assert.equal(b.run(`deploy ${sha(1)} ${t.sum}`, t.bytes).status, 0);
  const rel = join(b.root, "releases", sha(1));
  assert.equal(statSync(rel).mode & 0o755, 0o755);
  assert.equal(statSync(join(rel, "server.js")).mode & 0o644, 0o644);
});

test("checksum mismatch installs nothing", () => {
  const b = box();
  const t = tarball("x");
  const r = b.run(`deploy ${sha(1)} ${"0".repeat(64)}`, t.bytes);
  assert.notEqual(r.status, 0);
  assert.match(String(r.stderr), /sha256 mismatch/);
  assert.equal(existsSync(join(b.root, "releases", sha(1))), false);
  assert.equal(existsSync(join(b.root, "current")), false);
  assert.deepEqual(calls(b), []);
});

test("a failed smoke puts the previous release back and fails the deploy", () => {
  const b = box();
  assert.equal(deploy(b, 1).status, 0);
  const r = deploy(b, 2, false);
  assert.notEqual(r.status, 0);
  assert.match(String(r.stderr), /smoke failed/);
  assert.equal(current(b), join(b.root, "releases", sha(1)));
  assert.equal(existsSync(join(b.root, "releases", sha(2))), false);
  assert.deepEqual(calls(b).slice(-3), [
    `smoke ${join(b.root, "releases", sha(2))}`,
    "systemctl restart kubcode-web.service",
    `smoke ${join(b.root, "releases", sha(1))}`,
  ]);
});

test("a failed restart restores the previous release like a failed smoke", () => {
  const b = box();
  assert.equal(deploy(b, 1).status, 0);
  const t = tarball("release 2");
  // Every restart fails (e.g. web.env missing); the restore still runs.
  const r = b.run(`deploy ${sha(2)} ${t.sum}`, t.bytes, true, false);
  assert.notEqual(r.status, 0);
  assert.equal(current(b), join(b.root, "releases", sha(1)));
  assert.equal(existsSync(join(b.root, "releases", sha(2))), false);
});

test("a release that never passed its smoke is not reported as already live", () => {
  const b = box();
  // Simulate a box left on an unverified release (e.g. a crash mid-deploy).
  mkdirSync(join(b.root, "releases", sha(1)), { recursive: true });
  writeFileSync(join(b.root, "releases", sha(1), "server.js"), "");
  symlinkSync(join(b.root, "releases", sha(1)), join(b.root, "current"));
  const r = deploy(b, 1);
  assert.equal(r.status, 0, String(r.stderr));
  assert.match(calls(b).at(-1) ?? "", /^smoke /);
});

test("only exact verbs and hex arguments are accepted", () => {
  const b = box();
  for (const cmd of [
    "",
    "bash",
    `deploy ${sha(1)}`,
    `deploy ${"ABCDEF".padEnd(40, "0")} ${"a".repeat(64)}`,
    `deploy ${sha(1)} ${"a".repeat(64)}; touch /tmp/pwned`,
    `deploy ../../etc ${"a".repeat(64)}`,
    `deploy * ${"a".repeat(64)}`,
    "rollback now",
  ]) {
    const r = b.run(cmd, Buffer.from(""));
    assert.equal(r.status, 2, `should refuse: ${JSON.stringify(cmd)}`);
  }
  assert.deepEqual(readdirSync(b.root), []);
});

test("an oversized upload is refused", () => {
  const b = box();
  const big = Buffer.alloc(300000, 1);
  const r = b.run(`deploy ${sha(1)} ${createHash("sha256").update(big).digest("hex")}`, big);
  assert.notEqual(r.status, 0);
  assert.match(String(r.stderr), /too large/);
  assert.equal(existsSync(join(b.root, "releases", sha(1))), false);
});

test("archive members cannot escape the release directory", () => {
  const b = box();
  const dir = mkdtempSync(join(tmpdir(), "kubcode-evil-"));
  mkdirSync(join(dir, "a"));
  writeFileSync(join(dir, "evil"), "x");
  // ../evil relative to a/ — tar stores the member name as given.
  const out = spawnSync("tar", ["-czf", "-", "-C", join(dir, "a"), "../evil"]);
  const sum = createHash("sha256").update(out.stdout).digest("hex");
  const r = b.run(`deploy ${sha(1)} ${sum}`, out.stdout);
  assert.notEqual(r.status, 0);
  assert.equal(existsSync(join(b.root, "releases", "evil")), false);
  assert.equal(existsSync(join(b.root, "evil")), false);
  assert.equal(existsSync(join(b.root, "current")), false);
});

test("redeploying the live sha is refused rather than overwriting it", () => {
  const b = box();
  deploy(b, 1);
  const r = deploy(b, 1);
  assert.equal(r.status, 3);
  assert.match(String(r.stderr), /already live/);
  assert.equal(current(b), join(b.root, "releases", sha(1)));
});

test("keeps the five newest releases and never prunes current", () => {
  const b = box();
  for (let n = 1; n <= 7; n++) assert.equal(deploy(b, n).status, 0);
  const kept = readdirSync(join(b.root, "releases")).sort();
  assert.deepEqual(kept, [3, 4, 5, 6, 7].map(sha));
  assert.equal(current(b), join(b.root, "releases", sha(7)));
});

test("rollback swaps back to the previous release and smokes it", () => {
  const b = box();
  deploy(b, 1);
  deploy(b, 2);
  const r = b.run("rollback");
  assert.equal(r.status, 0, String(r.stderr));
  assert.equal(current(b), join(b.root, "releases", sha(1)));
  assert.equal(readlinkSync(join(b.root, "previous")), join(b.root, "releases", sha(2)));
  assert.equal(calls(b).at(-1), `smoke ${join(b.root, "releases", sha(1))}`);
});

test("rollback without a previous release fails cleanly", () => {
  const b = box();
  deploy(b, 1);
  const r = b.run("rollback");
  assert.notEqual(r.status, 0);
  assert.match(String(r.stderr), /no previous release/);
  assert.equal(current(b), join(b.root, "releases", sha(1)));
});

test("status prints the live and previous sha", () => {
  const b = box();
  deploy(b, 1);
  deploy(b, 2);
  const r = b.run("status");
  assert.equal(r.status, 0);
  assert.equal(String(r.stdout).trim(), `current=${sha(2)} previous=${sha(1)}`);
});
