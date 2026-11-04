import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  SHOWCASE_MANIFEST,
  showcaseMediaPaths,
  type ShowcaseManifestEntry,
} from "../lib/showcase-manifest";
import { validateShowcase } from "../lib/showcase-check";
import { publishedShowcase } from "../lib/showcase";
import { SHOWCASE_ALLOWLIST, type ShowcaseAllowEntry } from "../lib/showcase-allowlist";
import { PUBLISHED_MEDIA, isPublishable } from "../lib/publication";
import { rawSkills } from "../lib/catalog";

const PUBLIC = path.join(__dirname, "..", "public");

test("the committed allowlist, manifest and media files agree", () => {
  assert.deepEqual(
    validateShowcase({ allowlist: SHOWCASE_ALLOWLIST, manifest: SHOWCASE_MANIFEST, publicDir: PUBLIC }),
    [],
  );
  assert.ok(SHOWCASE_MANIFEST.length > 0 && SHOWCASE_MANIFEST.length < 100);
});

test("every showcase file is approved media; catalog previews stay withheld", () => {
  const paths = showcaseMediaPaths(SHOWCASE_MANIFEST);
  for (const p of paths) assert.ok(PUBLISHED_MEDIA.has(p), p);
  assert.equal(PUBLISHED_MEDIA.size, paths.length, "the allowlist holds showcase files only");
  for (const skill of rawSkills) {
    for (const example of skill.examples) {
      for (const url of [example.video, example.poster]) {
        if (url) assert.equal(isPublishable(url, "licensed-only"), false, url);
      }
    }
  }
});

test("licensed-only shows nothing without approval, and drops an unapproved preview", () => {
  assert.deepEqual(publishedShowcase("licensed-only", new Set()), []);
  const video = SHOWCASE_MANIFEST.find((e) => e.preview)!;
  const onlyPoster = new Set([video.poster.src]);
  const items = publishedShowcase("licensed-only", onlyPoster);
  assert.equal(items.length, 1);
  assert.equal(items[0].preview, null);
  assert.equal(publishedShowcase("licensed-only").length, SHOWCASE_MANIFEST.length);
});

test("published items carry the allowlist's label and credits", () => {
  const items = publishedShowcase("licensed-only");
  const muteTouch = items.find((i) => i.id === "2026-11-01_what-if-studio_ep01_mute-touch")!;
  assert.equal(muteTouch.label, "Mute Touch");
  assert.ok(muteTouch.credits.some((c) => c.text.includes("elevenlabs.io")));
});

// ------------------------------------------------------------- rejections

function sha(buf: Buffer) {
  return createHash("sha256").update(buf).digest("hex");
}

/** A tiny valid fixture: one clip with a poster and a preview on disk. */
function fixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "showcase-test-"));
  const id = "clip-a";
  fs.mkdirSync(path.join(dir, "showcase", id), { recursive: true });
  const poster = Buffer.from("poster-bytes");
  const preview = Buffer.from("preview-bytes");
  fs.writeFileSync(path.join(dir, "showcase", id, "poster.jpg"), poster);
  fs.writeFileSync(path.join(dir, "showcase", id, "preview.mp4"), preview);
  const allow: ShowcaseAllowEntry = {
    id,
    source: "studio:clip-a",
    label: "Clip A",
    rights: "Own work.",
    at: 1,
  };
  const entry: ShowcaseManifestEntry = {
    id,
    title: "Clip A title",
    aspect: "portrait",
    poster: { src: `/showcase/${id}/poster.jpg`, width: 480, height: 854, bytes: poster.length, sha256: sha(poster) },
    preview: { src: `/showcase/${id}/preview.mp4`, width: 360, height: 640, seconds: 3.5, bytes: preview.length, sha256: sha(preview) },
    link: { url: "https://www.youtube.com/watch?v=abc", platform: "youtube", evidence: "clip.json" },
    madeWith: { renderer: "hyperframes", voice: "thai-jk" },
    source: { path: "~/Studio/clips/clip-a/video.mp4", sha256: "0".repeat(64) },
  };
  return { dir, allow, entry };
}

function problems(
  mutate: (f: ReturnType<typeof fixture>) => {
    allowlist?: ShowcaseAllowEntry[];
    manifest?: ShowcaseManifestEntry[];
  } | void,
) {
  const f = fixture();
  const out = mutate(f) || {};
  return validateShowcase({
    allowlist: out.allowlist ?? [f.allow],
    manifest: out.manifest ?? [f.entry],
    publicDir: f.dir,
  });
}

test("fixture itself is valid", () => {
  assert.deepEqual(problems(() => {}), []);
});

const cases: [string, Parameters<typeof problems>[0], RegExp][] = [
  ["media without an allowlist line", (f) => ({ allowlist: [] }), /not in the allowlist/],
  ["allowlisted clip without media", (f) => ({ manifest: [] }), /no generated media/],
  ["duplicate allowlist id", (f) => ({ allowlist: [f.allow, f.allow] }), /duplicate/],
  ["empty rights note", (f) => ({ allowlist: [{ ...f.allow, rights: " " }] }), /rights/],
  ["pending rights note", (f) => ({ allowlist: [{ ...f.allow, rights: "PENDING owner decision" }] }), /rights/],
  ["path outside the clip folder", (f) => ({ manifest: [{ ...f.entry, poster: { ...f.entry.poster, src: "/previews/x.jpg" } }] }), /poster path/],
  ["changed file", (f) => { fs.writeFileSync(path.join(f.dir, "showcase", "clip-a", "poster.jpg"), "other"); }, /poster.*(bytes|sha256)/],
  ["missing file", (f) => { fs.rmSync(path.join(f.dir, "showcase", "clip-a", "preview.mp4")); }, /preview.*missing/],
  ["preview over budget", (f) => ({ manifest: [{ ...f.entry, preview: { ...f.entry.preview!, bytes: 400_001 } }] }), /preview.*400000/],
  ["extra file in a clip folder", (f) => { fs.writeFileSync(path.join(f.dir, "showcase", "clip-a", "full.mp4"), "x"); }, /unexpected file/],
  ["stray clip folder", (f) => { fs.mkdirSync(path.join(f.dir, "showcase", "old-clip")); }, /unexpected folder/],
  ["link to another host", (f) => ({ manifest: [{ ...f.entry, link: { ...f.entry.link!, url: "https://example.com/x" } }] }), /link/],
  ["What If style without its credit", (f) => ({ manifest: [{ ...f.entry, madeWith: { style: "freshstack-what-if (React SVG)" } }] }), /What If/],
  ["ElevenLabs voice without its credit", (f) => ({ manifest: [{ ...f.entry, madeWith: { voice: "ElevenLabs eleven_v3 Thai" } }] }), /elevenlabs\.io/],
];

for (const [name, mutate, expected] of cases) {
  test(`rejects: ${name}`, () => {
    const found = problems(mutate);
    assert.ok(found.some((p) => expected.test(p)), `${name}: ${JSON.stringify(found)}`);
  });
}

test("required credits are satisfied by the allowlist's credits", () => {
  const found = problems((f) => ({
    allowlist: [{
      ...f.allow,
      credits: [
        { text: "สไตล์จาก What If Animation", href: "/tools/what-if-animation" },
        { text: "เสียงจาก elevenlabs.io", href: "https://elevenlabs.io" },
      ],
    }],
    manifest: [{ ...f.entry, madeWith: { style: "freshstack-what-if", voice: "ElevenLabs eleven_v3" } }],
  }));
  assert.deepEqual(found, []);
});
