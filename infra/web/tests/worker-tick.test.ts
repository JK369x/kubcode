// The web host's comment → DM worker tick (docs/design/ig-comment-dm.md §4.8):
// a systemd timer runs host/worker-tick every minute; it must sign exactly as
// the web app does (KUBCODE-HMAC-V1) and stay off until both flags are on.
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import path from "node:path";
import { connectHeaders } from "../../../lib/keys/connect-config";

const require = createRequire(__filename);
const tick = require(path.join(__dirname, "..", "host", "worker-tick"));

const URL_OK = "https://abcdefghij0123456789abcdefghij01.lambda-url.ap-southeast-1.on.aws/";
const KEY = "FIXTURE-ONLY-publishing-hmac-key-000000000000";
const ON = {
  KUBCODE_PUBLISHING_ENABLED: "true",
  KUBCODE_AUTOMATIONS_ENABLED: "true",
  KUBCODE_PUBLISHING_URL: URL_OK,
  KUBCODE_PUBLISHING_HMAC_KEY: KEY,
};

test("signs the tick exactly like the web app's Lambda calls", () => {
  const req = tick.signedRequest(ON, 1_800_000_000, "ab".repeat(16));
  assert.equal(req.url, `${URL_OK}api/worker`);
  assert.equal(req.init.method, "POST");
  assert.equal(req.init.body, "{}");
  assert.equal(req.init.redirect, "error");
  assert.deepEqual(req.init.headers, connectHeaders(KEY, "/api/worker", "{}", 1_800_000_000, "ab".repeat(16)));
});

test("off until publishing and automations are both on", () => {
  for (const off of [
    { ...ON, KUBCODE_AUTOMATIONS_ENABLED: undefined },
    { ...ON, KUBCODE_AUTOMATIONS_ENABLED: "1" },
    { ...ON, KUBCODE_PUBLISHING_ENABLED: "false" },
  ]) {
    assert.equal(tick.signedRequest(off, 1, "n"), null);
  }
});

test("only the Lambda Function URL format and a real key", () => {
  for (const bad of [
    { ...ON, KUBCODE_PUBLISHING_URL: "http://127.0.0.1:9000/" },
    { ...ON, KUBCODE_PUBLISHING_URL: "https://evil.example/" },
    { ...ON, KUBCODE_PUBLISHING_URL: "https://abcdefghij0123456789.lambda-url.us-east-1.on.aws/" },
    { ...ON, KUBCODE_PUBLISHING_HMAC_KEY: "short" },
  ]) {
    assert.throws(() => tick.signedRequest(bad, 1, "n"), /worker-tick:/);
  }
});

test("setup installs the tick, its service and its timer", () => {
  const setup = readFileSync(path.join(__dirname, "..", "host", "setup.sh"), "utf8");
  for (const f of ["worker-tick", "kubcode-worker.service", "kubcode-worker.timer"]) assert.ok(setup.includes(f), f);
  assert.match(setup, /systemctl enable --now kubcode-worker\.timer/);
  const timer = readFileSync(path.join(__dirname, "..", "host", "kubcode-worker.timer"), "utf8");
  assert.match(timer, /OnCalendar=\*-\*-\* \*:\*:00/);
  const unit = readFileSync(path.join(__dirname, "..", "host", "kubcode-worker.service"), "utf8");
  assert.match(unit, /User=kubcode/);
  assert.match(unit, /EnvironmentFile=\/etc\/kubcode\/web\.env/);
  assert.match(unit, /Type=oneshot/);
});
