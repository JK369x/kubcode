// Keychain vault for owner secrets (infra/scripts/secret.sh + lib/keychain.sh).
// Runs against a fake `security` (tests/fixtures/fake-security) so it works on
// any OS and never touches a real keychain.
import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const ROOT = resolve(__dirname, "../../..");
const SECRET = join(ROOT, "infra/scripts/secret.sh");
const LIB = join(ROOT, "infra/scripts/lib/keychain.sh");
const WEBHOST = readFileSync(join(ROOT, "infra/web/scripts/webhost.sh"), "utf8");
const VALUE = "s3cret-Value_with.dots";

let dir: string;
let bin: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "kc-"));
  bin = join(dir, "bin");
  mkdirSync(bin);
  const fake = join(bin, "security");
  writeFileSync(fake, readFileSync(join(__dirname, "fixtures/fake-security")));
  chmodSync(fake, 0o755);
});

function env(extra: Record<string, string> = {}) {
  return { PATH: `${bin}:${process.env.PATH}`, FAKE_KC_DIR: dir, ...extra };
}
function secret(args: string[], input = "") {
  return spawnSync("bash", [SECRET, ...args], { input, env: env() });
}
function lib(program: string, input = "", extra: Record<string, string> = {}) {
  return spawnSync("bash", ["-c", `set -euo pipefail\nsource "${LIB}"\n${program}`], { input, env: env(extra) });
}
const log = () => (existsSync(join(dir, "args.log")) ? readFileSync(join(dir, "args.log"), "utf8") : "");

test("put stores under kubcode/<name> with an empty trusted-app list, so every read asks for the Mac password", () => {
  const r = secret(["put", "google-connect-client-secret"], VALUE);
  assert.equal(r.status, 0, String(r.stderr));
  const add = log().split("\n").find((l) => l.startsWith("add-generic-password")) ?? "";
  assert.match(add, /-s kubcode\/google-connect-client-secret/);
  assert.match(add, /-a kubcode/);
  assert.match(add, /-T  /, "-T with an empty value");
  assert.match(add, /-U/);
  assert.doesNotMatch(String(r.stdout) + String(r.stderr), new RegExp(VALUE));
});

test("put rejects bad names and empty values", () => {
  assert.notEqual(secret(["put", "Bad Name"], VALUE).status, 0);
  assert.notEqual(secret(["put", "../x"], VALUE).status, 0);
  assert.notEqual(secret(["put", "ok-name"], "").status, 0);
});

test("has, list and rm work on names only and never print a value", () => {
  secret(["put", "supabase-sg-postgres-uri"], VALUE);
  secret(["put", "package-signer-key"], VALUE);
  assert.equal(secret(["has", "supabase-sg-postgres-uri"]).status, 0);
  assert.equal(secret(["has", "missing"]).status, 1);
  const l = secret(["list"]);
  assert.equal(l.status, 0, String(l.stderr));
  assert.deepEqual(String(l.stdout).trim().split("\n").sort(), ["package-signer-key", "supabase-sg-postgres-uri"]);
  assert.doesNotMatch(String(l.stdout), new RegExp(VALUE));
  assert.equal(secret(["rm", "package-signer-key"]).status, 0);
  assert.equal(secret(["has", "package-signer-key"]).status, 1);
});

test("there is no command that prints a value", () => {
  secret(["put", "x-key"], VALUE);
  for (const cmd of ["get", "show", "print", "cat", "read"]) {
    const r = secret([cmd, "x-key"]);
    assert.notEqual(r.status, 0, cmd);
    assert.doesNotMatch(String(r.stdout) + String(r.stderr), new RegExp(VALUE), cmd);
  }
});

test("kc_or_ask takes the stored value without prompting", () => {
  secret(["put", "google-client-secret"], VALUE);
  const r = lib(`v=$(kc_or_ask google-client-secret 1 "GOOGLE_CLIENT_SECRET") && [ "$v" = "${VALUE}" ] && echo match`);
  assert.equal(r.status, 0, String(r.stderr));
  assert.equal(String(r.stdout).trim(), "match");
  assert.doesNotMatch(String(r.stderr), /GOOGLE_CLIENT_SECRET:/, "no prompt shown");
});

test("kc_or_ask prompts when the value is missing, and does not save it without a terminal", () => {
  const r = lib(`v=$(kc_or_ask google-client-id 0 "GOOGLE_CLIENT_ID") && printf '%s' "$v"`, "typed-value\n");
  assert.equal(r.status, 0, String(r.stderr));
  assert.equal(String(r.stdout), "typed-value");
  assert.equal(secret(["has", "google-client-id"]).status, 1);
});

test("kc_name maps env names to keychain names", () => {
  const r = lib(`kc_name GOOGLE_CLIENT_SECRET; kc_name DATABASE_URL`);
  assert.equal(String(r.stdout), "google-client-secret\ndatabase-url\n");
});

test("webhost.sh loads the helper and uses it in ask and set_connect", () => {
  assert.match(WEBHOST, /source "[^"]*lib\/keychain\.sh"/);
  const ask = WEBHOST.match(/^ask\(\) \{[\s\S]*?^\}$/m)?.[0] ?? "";
  assert.match(ask, /kc_or_ask "\$\(kc_name "\$name"\)"/);
  const connect = WEBHOST.match(/^set_connect\(\) \{[\s\S]*?^\}$/m)?.[0] ?? "";
  assert.match(connect, /kc_or_ask google-connect-client-id 0/);
  assert.match(connect, /kc_or_ask google-connect-client-secret 1/);
});

test("webhost.sh ask returns a stored value as NAME='value' without prompting", () => {
  secret(["put", "line-client-secret"], VALUE);
  const ask = WEBHOST.match(/^ask\(\) \{[\s\S]*?^\}$/m)?.[0] ?? "";
  const r = lib(`die() { echo "webhost: $*" >&2; exit 1; }\n${ask}\nask LINE_CLIENT_SECRET 1`);
  assert.equal(r.status, 0, String(r.stderr));
  assert.equal(String(r.stdout), `LINE_CLIENT_SECRET='${VALUE}'\n`);
});
