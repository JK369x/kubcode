// The preview job gets an AWS role that can decrypt the stack config, so it
// must only run for pull requests from this repository, never from a fork.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const WORKFLOW = readFileSync(path.join(__dirname, "..", "..", ".github", "workflows", "infra.yml"), "utf8");

/** The text of one top-level job, up to the next job at the same indent. */
function job(name: string): string {
  const start = WORKFLOW.indexOf(`\n  ${name}:\n`);
  assert.notEqual(start, -1, `job ${name} not found`);
  const rest = WORKFLOW.slice(start + 1);
  const next = rest.slice(1).search(/\n {2}[a-z][a-z0-9_-]*:\n/);
  return next === -1 ? rest : rest.slice(0, next + 1);
}

test("the preview job runs only for pull requests from this repository", () => {
  const preview = job("preview");
  assert.match(preview, /id-token: write/);
  const cond = preview.match(/^ {4}if: (.+)$/m)?.[1] ?? "";
  assert.match(cond, /github\.event_name == 'pull_request'/);
  assert.match(cond, /github\.event\.pull_request\.head\.repo\.full_name == github\.repository/);
});
