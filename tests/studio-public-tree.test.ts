// studio/ (the production engine imported from jk-animation-studio, ADR 0005)
// lives in a PUBLIC repo. Reference kits, voice data and large media stay in
// the git-ignored media/ folder; this test keeps them out of Git.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { NEVER_DOWNLOADABLE } from "../lib/packages";

const REPO = path.join(__dirname, "..");
const STUDIO = path.join(REPO, "studio");
const MAX_BYTES = 1_400_000; // two vendored three.module.js copies are ~1.3 MB

function trackedStudioFiles(): string[] {
  try {
    const out = execFileSync("git", ["ls-files", "-z", "--", "studio"], { cwd: REPO }).toString();
    const files = out.split("\0").filter(Boolean);
    if (files.length) return files;
  } catch {
    /* not a git checkout: fall back to the tree */
  }
  const walk = (dir: string): string[] =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      if (["node_modules", ".venv", "outputs", "dist", ".git"].includes(e.name)) return [];
      const p = path.join(dir, e.name);
      return e.isDirectory() ? walk(p) : [path.relative(REPO, p)];
    });
  return walk(STUDIO);
}

// deep-sea-docs is a members-only proprietary kit: its source stays in the private repo.
const REFERENCE_KITS = ["growkaz-stickman", "thai-survival", "tool-reel-system", "deep-sea-docs"];

test("studio/ tracks no reference-only or unlicensed upstream kit", () => {
  for (const kit of [...REFERENCE_KITS, ...NEVER_DOWNLOADABLE]) {
    assert.ok(!fs.existsSync(path.join(STUDIO, "styles", kit)), `studio/styles/${kit} must stay in media/archive`);
  }
  for (const dir of fs.readdirSync(path.join(STUDIO, "styles"))) {
    const manifest = path.join(STUDIO, "styles", dir, "style.json");
    if (!fs.existsSync(manifest)) continue;
    const style = JSON.parse(fs.readFileSync(manifest, "utf8")) as { availability?: string };
    assert.notEqual(style.availability, "reference", `${dir} is reference-only`);
  }
});

test("studio/ tracks no audio/video, voice data, secrets or files over the size cap", () => {
  const files = trackedStudioFiles();
  assert.ok(files.length > 100, "studio tree found");
  for (const rel of files) {
    assert.doesNotMatch(rel, /\.(mp4|mov|webm|mkv|wav|mp3|m4a|flac|safetensors|npz|ckpt)$/i, `${rel} is media`);
    assert.doesNotMatch(rel, /(^|\/)(\.env(\.(?!example$)[^/]+)?|token\.json|client_secret[^/]*\.json)$/, `${rel} looks like a credential`);
    assert.doesNotMatch(rel, /(^|\/)(node_modules|\.venv|outputs|dist)\//, `${rel} is build/output state`);
    assert.doesNotMatch(rel, /source-frames\//, `${rel} is a third-party screenshot`);
    const size = fs.statSync(path.join(REPO, rel)).size;
    assert.ok(size <= MAX_BYTES, `${rel} is ${size} bytes (cap ${MAX_BYTES})`);
  }
});

test("studio voice profile ships the checksum but not the reference WAV", () => {
  const profile = JSON.parse(
    fs.readFileSync(path.join(STUDIO, "shared/voice/assets/narrator-profile.json"), "utf8"),
  ) as { reference: string; reference_sha256: string };
  assert.match(profile.reference_sha256, /^[0-9a-f]{64}$/);
  assert.ok(!trackedStudioFiles().some((f) => f.endsWith(profile.reference)));
});
