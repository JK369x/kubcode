import { test } from "node:test";
import assert from "node:assert/strict";
// Node cannot load CSS modules (the page renders inside AccountShell): stub them first.
const NodeModule = require("node:module") as { _extensions: Record<string, (m: { exports: unknown }) => void> };
NodeModule._extensions[".css"] = (m) => {
  m.exports = new Proxy({}, { get: (_t, key) => (key === "__esModule" ? false : String(key)) });
};
const page = require("../app/account/tiktok/page") as Record<string, unknown>;

test("sandbox member page reads runtime configuration on every request", () => assert.equal(Reflect.get(page, "dynamic"), "force-dynamic"));
