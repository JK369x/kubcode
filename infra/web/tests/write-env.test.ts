// host/write-env: replaces web.env from stdin, keeps or generates
// NEXTAUTH_SECRET on the box, refuses malformed lines, never prints values.
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const SCRIPT = resolve(__dirname, "../host/write-env");

function run(file: string, input: string) {
  return spawnSync("bash", [SCRIPT], {
    input,
    env: { PATH: process.env.PATH, KUBCODE_ENV_FILE: file, KUBCODE_ENV_NO_RESTART: "1" },
  });
}
const envFile = () => join(mkdtempSync(join(tmpdir(), "kubcode-env-")), "web.env");
const secretOf = (file: string) => readFileSync(file, "utf8").match(/^NEXTAUTH_SECRET='([^']+)'$/m)?.[1];

test("writes the lines, generates NEXTAUTH_SECRET, mode 600, prints keys only", () => {
  const f = envFile();
  const r = run(f, "GOOGLE_CLIENT_SECRET='s3cret-value'\nLINE_CLIENT_ID='2012344557'\n");
  assert.equal(r.status, 0, String(r.stderr));
  const body = readFileSync(f, "utf8");
  assert.match(body, /^GOOGLE_CLIENT_SECRET='s3cret-value'$/m);
  assert.ok((secretOf(f) ?? "").length >= 40);
  assert.equal(statSync(f).mode & 0o777, 0o600);
  assert.equal(String(r.stdout).trim(), "write-env: keys GOOGLE_CLIENT_SECRET LINE_CLIENT_ID NEXTAUTH_SECRET");
  assert.doesNotMatch(String(r.stdout) + String(r.stderr), /s3cret-value/);
});

test("a re-run keeps the existing NEXTAUTH_SECRET and ignores a typed one", () => {
  const f = envFile();
  run(f, "A='1'\n");
  const first = secretOf(f);
  const r = run(f, "A='2'\nNEXTAUTH_SECRET='typed-by-someone'\n");
  assert.equal(r.status, 0);
  assert.equal(secretOf(f), first);
  assert.match(readFileSync(f, "utf8"), /^A='2'$/m);
});

test("malformed lines are refused and the old file stays", () => {
  const f = envFile();
  writeFileSync(f, "KEEP='me'\n", { mode: 0o600 });
  for (const bad of ["lower='x'\n", "A=unquoted\n", "A='it's'\n", "A='x' ; rm -rf /\n"]) {
    const r = run(f, bad);
    assert.notEqual(r.status, 0, `should refuse ${JSON.stringify(bad)}`);
    assert.equal(readFileSync(f, "utf8"), "KEEP='me'\n");
  }
});

// With a live release, write-env restarts the app and smokes it. A typo in a
// secret must not take the site down: the old file comes back.
function liveBox(smokeOk: boolean) {
  const dir = mkdtempSync(join(tmpdir(), "kubcode-env-live-"));
  const root = join(dir, "srv");
  mkdirSync(join(root, "releases", "r1"), { recursive: true });
  symlinkSync(join(root, "releases", "r1"), join(root, "current"));
  const log = join(dir, "calls.log");
  writeFileSync(log, "");
  const systemctl = join(dir, "systemctl");
  writeFileSync(systemctl, `#!/bin/sh\necho "restart" >> "${log}"\n`);
  const smoke = join(dir, "smoke");
  // The stub smoke passes only when the env file holds GOOD='1'.
  writeFileSync(smoke, `#!/bin/sh\ngrep -qx "GOOD='1'" "${join(dir, "web.env")}"\n`);
  chmodSync(systemctl, 0o755);
  chmodSync(smoke, 0o755);
  const file = join(dir, "web.env");
  writeFileSync(file, "GOOD='1'\nNEXTAUTH_SECRET='kept-secret-0123456789012345678901234567'\n", { mode: 0o600 });
  const run = (input: string) =>
    spawnSync("bash", [SCRIPT], {
      input,
      env: { PATH: process.env.PATH, KUBCODE_ENV_FILE: file, KUBCODE_ROOT: root, KUBCODE_SYSTEMCTL: systemctl, KUBCODE_SMOKE: smoke },
    });
  return { file, log, run, smokeOk };
}

test("a good change restarts and smokes once", () => {
  const b = liveBox(true);
  const r = b.run("GOOD='1'\nB='2'\n");
  assert.equal(r.status, 0, String(r.stderr));
  assert.match(readFileSync(b.file, "utf8"), /^B='2'$/m);
  assert.equal(readFileSync(b.log, "utf8"), "restart\n");
});

test("a change that fails the smoke restores the old env and restarts again", () => {
  const b = liveBox(false);
  const before = readFileSync(b.file, "utf8");
  const r = b.run("GOOD='typo'\n");
  assert.notEqual(r.status, 0);
  assert.match(String(r.stderr), /restored the previous web.env/);
  assert.equal(readFileSync(b.file, "utf8"), before);
  assert.equal(statSync(b.file).mode & 0o777, 0o600);
  assert.equal(readFileSync(b.log, "utf8"), "restart\nrestart\n");
  assert.doesNotMatch(String(r.stdout) + String(r.stderr), /typo/);
});
