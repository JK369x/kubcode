import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveTheme, nextTheme } from "../lib/theme";
test("default dark and explicit persisted theme wins", () => {
  assert.equal(resolveTheme(null), "dark");
  assert.equal(resolveTheme("light"), "light");
  assert.equal(resolveTheme("dark"), "dark");
  assert.equal(resolveTheme("invalid"), "dark");
  assert.equal(nextTheme("dark"), "light");
  assert.equal(nextTheme("light"), "dark");
});
