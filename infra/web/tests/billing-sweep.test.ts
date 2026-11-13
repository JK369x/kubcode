// The web host's billing sweep tick (ADR 0008 §5): hourly signed POST {} to
// the billing Lambda's /api/sweep, off until billing is enabled.
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import path from "node:path";
import { connectHeaders } from "../../../lib/keys/connect-config";

const require = createRequire(__filename);
const tick = require(path.join(__dirname, "..", "host", "billing-sweep"));
const URL_OK = "https://abcdefghij0123456789abcdefghij03.lambda-url.ap-southeast-1.on.aws/";
const KEY = "FIXTURE-ONLY-billing-hmac-key-000000000000000000";
const ON = { KUBCODE_BILLING_ENABLED: "true", KUBCODE_BILLING_URL: URL_OK, KUBCODE_BILLING_HMAC_KEY: KEY };

test("signs the sweep exactly like the web app's billing calls", () => {
  const req = tick.signedRequest(ON, 1_800_000_000, "cd".repeat(16));
  assert.equal(req.url, `${URL_OK}api/sweep`);
  assert.equal(req.init.body, "{}");
  assert.equal(req.init.redirect, "error");
  assert.deepEqual(req.init.headers, connectHeaders(KEY, "/api/sweep", "{}", 1_800_000_000, "cd".repeat(16)));
});

test("off until billing is enabled; only a Function URL and a real key", () => {
  assert.equal(tick.signedRequest({ ...ON, KUBCODE_BILLING_ENABLED: undefined }, 1, "n"), null);
  assert.equal(tick.signedRequest({ ...ON, KUBCODE_BILLING_ENABLED: "1" }, 1, "n"), null);
  for (const bad of [{ ...ON, KUBCODE_BILLING_URL: "http://127.0.0.1:3091/" }, { ...ON, KUBCODE_BILLING_HMAC_KEY: "short" }]) {
    assert.throws(() => tick.signedRequest(bad, 1, "n"), /billing-sweep:/);
  }
});

test("setup installs and enables the sweep timer; it runs as kubcode, hourly", () => {
  const setup = readFileSync(path.join(__dirname, "..", "host", "setup.sh"), "utf8");
  for (const f of ["billing-sweep", "kubcode-billing-sweep.service", "kubcode-billing-sweep.timer"]) assert.ok(setup.includes(f), f);
  assert.match(setup, /systemctl enable --now kubcode-billing-sweep\.timer/);
  const unit = readFileSync(path.join(__dirname, "..", "host", "kubcode-billing-sweep.service"), "utf8");
  assert.match(unit, /User=kubcode/);
  assert.match(unit, /ExecStart=\/usr\/local\/bin\/node \/usr\/local\/lib\/kubcode\/billing-sweep/);
  assert.match(unit, /NoNewPrivileges=yes/);
  assert.match(readFileSync(path.join(__dirname, "..", "host", "kubcode-billing-sweep.timer"), "utf8"), /OnCalendar=\*-\*-\* \*:07:00/);
});
