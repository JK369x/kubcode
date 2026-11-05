/**
 * Cuts the homepage showcase media from the read-only sources named in
 * lib/showcase-allowlist.ts: per clip one poster JPG and one muted 3.5 s
 * H.264 preview loop, under public/showcase/<id>/. Then rewrites
 * lib/showcase.json and removes folders of clips no longer listed.
 *
 *   npm run showcase
 *
 * Sources are never written. Roots can be moved with SHOWCASE_STUDIO_ROOT
 * and SHOWCASE_STYLES_ROOT.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { SHOWCASE_ALLOWLIST, type ShowcaseAllowEntry } from "../lib/showcase-allowlist";
import { SHOWCASE_LIMITS, type ShowcaseManifestEntry } from "../lib/showcase-manifest";

const HOME = os.homedir();
const STUDIO = process.env.SHOWCASE_STUDIO_ROOT ?? path.join(HOME, "Studio/clips");
const STYLES = process.env.SHOWCASE_STYLES_ROOT ?? path.join(HOME, "work/ai-video/jk-animation-studio/styles");
const REPO = path.join(__dirname, "..");
const OUT = path.join(REPO, "public/showcase");
const PREVIEW_SECONDS = 3.5;

const sha256 = (file: string) => createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const tilde = (p: string) => (p.startsWith(HOME) ? "~" + p.slice(HOME.length) : p);

function ffmpeg(args: string[]) {
  execFileSync("ffmpeg", ["-v", "error", "-y", ...args], { stdio: ["ignore", "inherit", "inherit"] });
}

function probe(file: string): { width: number; height: number; seconds: number } {
  const out = execFileSync("ffprobe", [
    "-v", "error", "-select_streams", "v:0",
    "-show_entries", "stream=width,height:format=duration", "-of", "json", file,
  ]).toString();
  const j = JSON.parse(out);
  return {
    width: j.streams[0].width,
    height: j.streams[0].height,
    seconds: Number(j.format?.duration ?? 0),
  };
}

type Clip = {
  src: string;
  still: boolean;
  title: string;
  madeWith: Record<string, string>;
  link: ShowcaseManifestEntry["link"];
  sourceSha: string;
};

function readClip(entry: ShowcaseAllowEntry): Clip {
  const [kind, ref] = [entry.source.slice(0, entry.source.indexOf(":")), entry.source.slice(entry.source.indexOf(":") + 1)];
  if (kind === "studio") {
    const dir = path.join(STUDIO, ref);
    const clip = JSON.parse(fs.readFileSync(path.join(dir, "clip.json"), "utf8"));
    const madeWith: Record<string, string> = {};
    for (const [k, v] of Object.entries(clip.made_with ?? {})) if (typeof v === "string") madeWith[k] = v;
    const yt = clip.platforms?.youtube?.published;
    const ig = clip.platforms?.instagram?.published;
    const link: Clip["link"] = yt?.url
      ? { url: yt.url, platform: "youtube", evidence: `clip.json platforms.youtube.published (checked ${yt.checked_at ?? "n/a"})` }
      : ig?.permalink
        ? { url: ig.permalink, platform: "instagram", evidence: `clip.json platforms.instagram.published (${ig.timestamp ?? "n/a"})` }
        : null;
    return {
      src: path.join(dir, clip.video.file),
      still: false,
      title: clip.title_th,
      madeWith,
      link,
      sourceSha: clip.video.sha256,
    };
  }
  if (kind === "style") {
    const src = path.join(STYLES, ref);
    if (!entry.title || !entry.madeWith) throw new Error(`${entry.id}: style sources need title and madeWith`);
    return {
      src,
      still: /\.(png|jpe?g)$/i.test(src),
      title: entry.title,
      madeWith: { ...entry.madeWith },
      link: null,
      sourceSha: sha256(src),
    };
  }
  throw new Error(`${entry.id}: unknown source ${entry.source}`);
}

function build(entry: ShowcaseAllowEntry): ShowcaseManifestEntry {
  const clip = readClip(entry);
  const size = probe(clip.src);
  const portrait = size.height > size.width;
  const dir = path.join(OUT, entry.id);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });

  const posterFile = path.join(dir, "poster.jpg");
  const posterWidth = portrait ? 480 : 640;
  ffmpeg([
    ...(clip.still ? [] : ["-ss", String(entry.at)]),
    "-i", clip.src, "-frames:v", "1",
    "-vf", `scale=${posterWidth}:-2:flags=lanczos`, "-q:v", "5", posterFile,
  ]);
  const posterSize = probe(posterFile);

  let preview: ShowcaseManifestEntry["preview"] = null;
  if (!clip.still) {
    const file = path.join(dir, "preview.mp4");
    const width = portrait ? 360 : 640;
    // Raise CRF until the loop fits the budget (with a margin).
    for (let crf = 28; ; crf += 2) {
      ffmpeg([
        "-ss", String(entry.at), "-t", String(PREVIEW_SECONDS), "-i", clip.src, "-an",
        "-vf", `scale=${width}:-2:flags=lanczos,fps=24`,
        "-c:v", "libx264", "-profile:v", "main", "-pix_fmt", "yuv420p",
        "-preset", "veryslow", "-tune", "animation", "-crf", String(crf),
        "-movflags", "+faststart", file,
      ]);
      if (fs.statSync(file).size <= SHOWCASE_LIMITS.previewBytes * 0.95 || crf >= 40) break;
    }
    const p = probe(file);
    preview = {
      src: `/showcase/${entry.id}/preview.mp4`,
      width: p.width,
      height: p.height,
      seconds: Math.round(p.seconds * 100) / 100,
      bytes: fs.statSync(file).size,
      sha256: sha256(file),
    };
  }

  return {
    id: entry.id,
    title: clip.title,
    aspect: portrait ? "portrait" : "landscape",
    poster: {
      src: `/showcase/${entry.id}/poster.jpg`,
      width: posterSize.width,
      height: posterSize.height,
      bytes: fs.statSync(posterFile).size,
      sha256: sha256(posterFile),
    },
    preview,
    link: clip.link,
    madeWith: clip.madeWith,
    source: { path: tilde(clip.src), sha256: clip.sourceSha },
  };
}

const only = process.argv.slice(2);
const previous: ShowcaseManifestEntry[] = fs.existsSync(path.join(REPO, "lib/showcase.json"))
  ? JSON.parse(fs.readFileSync(path.join(REPO, "lib/showcase.json"), "utf8"))
  : [];
const manifest: ShowcaseManifestEntry[] = [];
for (const entry of SHOWCASE_ALLOWLIST) {
  const kept = previous.find((p) => p.id === entry.id);
  if (only.length && !only.includes(entry.id) && kept) {
    manifest.push(kept);
    continue;
  }
  const built = build(entry);
  console.log(`${entry.id}: poster ${built.poster.bytes} B, preview ${built.preview?.bytes ?? "-"} B`);
  manifest.push(built);
}
const listed = new Set(SHOWCASE_ALLOWLIST.map((e) => e.id));
if (fs.existsSync(OUT)) {
  for (const name of fs.readdirSync(OUT)) {
    if (!listed.has(name)) {
      fs.rmSync(path.join(OUT, name), { recursive: true, force: true });
      console.log(`removed ${name} (not in the allowlist)`);
    }
  }
}
fs.writeFileSync(path.join(REPO, "lib/showcase.json"), JSON.stringify(manifest, null, 2) + "\n");
const total = manifest.reduce((n, e) => n + e.poster.bytes + (e.preview?.bytes ?? 0), 0);
const files = manifest.reduce((n, e) => n + 1 + (e.preview ? 1 : 0), 0);
console.log(`${manifest.length} clips, ${files} files, ${total} bytes`);
