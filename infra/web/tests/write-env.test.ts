// host/write-env: replaces web.env from stdin, keeps or generates
// NEXTAUTH_SECRET on the box, refuses malformed lines, never prints values.
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
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
