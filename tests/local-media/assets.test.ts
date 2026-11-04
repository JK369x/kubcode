import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { skills } from "../../lib/catalog";

// These tests intentionally require the owner's ignored local preview media.
// They are a separate explicit gate, never skipped or replaced with dummy media.
const NodeModule = require("node:module") as {
  _extensions: Record<string, (m: { exports: unknown }) => void>;
};
NodeModule._extensions[".css"] = (m) => {
  m.exports = new Proxy({}, { get: (_t, key) => key === "__esModule" ? false : String(key) });
};
const { SHOWCASE_MANIFEST } = require("../../lib/showcase-manifest") as typeof import("../../lib/showcase-manifest");

function imageSize(file: string): { w: number; h: number } {
  const b = readFileSync(file);
  if (b.readUInt32BE(0) === 0x89504e47) {
    return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
  }
  assert.equal(b[0], 0xff, file + " is not PNG/JPEG");
  let i = 2;
  while (i < b.length) {
    const marker = b[i + 1];
    const len = b.readUInt16BE(i + 2);
    if (marker >= 0xc0 && marker <= 0xc2) {
      return { h: b.readUInt16BE(i + 5), w: b.readUInt16BE(i + 7) };
    }
    i += 2 + len;
  }
  throw new Error("no SOF marker in " + file);
}

test("every referenced local poster/video actually exists and is nonempty", () => {
  for (const skill of skills) {
    for (const example of skill.examples) {
      for (const asset of [example.poster, example.video].filter(Boolean)) {
        assert.ok(asset!.startsWith("/previews/") && !asset!.includes(".."));
        assert.ok(statSync("public" + asset).size > 0, asset!);
      }
    }
  }
});

test("all hero poster intrinsic dimensions match the actual image headers", () => {
  for (const { poster } of SHOWCASE_MANIFEST) {
    assert.deepEqual(imageSize("public" + poster.src), { w: poster.width, h: poster.height }, poster.src);
  }
});
