// scripts/webhost.sh ask_downloads: the optional skill-download settings that
// set-env adds to the box's env file (ADR 0002). Empty URL = downloads off.
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SCRIPT = readFileSync(resolve(__dirname, "../scripts/webhost.sh"), "utf8");
const fn = SCRIPT.match(/^ask_downloads\(\) \{[\s\S]*?^\}$/m)?.[0] ?? "";

function run(input: string) {
  const program = `die() { echo "webhost: $*" >&2; exit 1; }\n${fn}\nask_downloads`;
  return spawnSync("bash", ["-c", program], { input, env: { PATH: process.env.PATH } });
}
const KEY = "a".repeat(64);
const URL = "https://abc123.lambda-url.ap-southeast-1.on.aws/";

test("set-env defines and calls ask_downloads", () => {
  assert.ok(fn, "ask_downloads() exists");
  const setEnv = SCRIPT.match(/^set_env\(\) \{[\s\S]*?^\}$/m)?.[0] ?? "";
  assert.match(setEnv, /ask_downloads/);
});

test("an empty signer URL leaves downloads off and asks nothing more", () => {
  const r = run("\n");
  assert.equal(r.status, 0, String(r.stderr));
  assert.equal(String(r.stdout), "");
});

test("a URL and key turn downloads on", () => {
  const r = run(`${URL}\n${KEY}\n`);
  assert.equal(r.status, 0, String(r.stderr));
  assert.equal(
    String(r.stdout),
    `KUBCODE_PACKAGE_SIGNER_URL='${URL}'\nKUBCODE_PACKAGE_SIGNER_KEY='${KEY}'\nKUBCODE_DOWNLOADS_ENABLED='true'\n`,
  );
  assert.doesNotMatch(String(r.stderr), new RegExp(KEY));
});

test("refuses a non-https or odd URL, and a short or quoted key, without echoing the key", () => {
  for (const url of ["http://abc.lambda-url.ap-southeast-1.on.aws/", "https://abc.example/?x=1", "https://a'b/"]) {
    const r = run(`${url}\n${KEY}\n`);
    assert.notEqual(r.status, 0, url);
  }
  for (const key of ["short", `${"a".repeat(40)}'x`]) {
    const r = run(`${URL}\n${key}\n`);
    assert.notEqual(r.status, 0, key);
    assert.doesNotMatch(String(r.stdout) + String(r.stderr), new RegExp(key.replace(/'/g, "\\'")));
  }
});
