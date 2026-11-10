import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { ShowcaseAllowEntry, ShowcaseCredit } from "./showcase-allowlist";
import { SHOWCASE_LIMITS, type ShowcaseManifestEntry } from "./showcase-manifest";
import { SERIES_MAP, isStoryKey, isVisualKey, seriesOf } from "./taxonomy";

const LINK_HOSTS = new Set(["www.youtube.com", "youtube.com", "www.instagram.com"]);

/** Credits a clip must show, derived from what it was made with. */
function creditProblems(id: string, madeWith: Readonly<Record<string, string>>, credits: readonly ShowcaseCredit[]) {
  const out: string[] = [];
  const used = Object.values(madeWith).join(" ");
  if (/freshstack-what-if/i.test(used) && !credits.some((c) => c.href === "/tools/what-if-animation")) {
    out.push(`${id}: made with the What If skill but has no What If credit`);
  }
  if (/elevenlabs/i.test(used) && !credits.some((c) => c.text.includes("elevenlabs.io"))) {
    out.push(`${id}: uses ElevenLabs output but has no elevenlabs.io credit`);
  }
  return out;
}

function checkFile(publicDir: string, id: string, kind: string, f: { src: string; bytes: number; sha256: string }) {
  const file = path.join(publicDir, f.src);
  if (!fs.existsSync(file)) return [`${id}: ${kind} file missing (${f.src})`];
  const buf = fs.readFileSync(file);
  const out: string[] = [];
  if (buf.length !== f.bytes) out.push(`${id}: ${kind} bytes differ from manifest`);
  if (createHash("sha256").update(buf).digest("hex") !== f.sha256) out.push(`${id}: ${kind} sha256 differs from manifest`);
  return out;
}

/** Every disagreement between allowlist, manifest and files; [] when all agree. */
export function validateShowcase(input: {
  allowlist: readonly ShowcaseAllowEntry[];
  manifest: readonly ShowcaseManifestEntry[];
  publicDir: string;
}): string[] {
  const { allowlist, manifest, publicDir } = input;
  const out: string[] = [];
  const allowed = new Map<string, ShowcaseAllowEntry>();
  for (const a of allowlist) {
    if (allowed.has(a.id)) out.push(`${a.id}: duplicate allowlist id`);
    allowed.set(a.id, a);
    if (!a.rights.trim() || /^PENDING/i.test(a.rights.trim())) out.push(`${a.id}: rights note is empty or pending`);
  }
  const listed = new Set(manifest.map((e) => e.id));
  for (const id of allowed.keys()) if (!listed.has(id)) out.push(`${id}: allowlisted but has no generated media (run npm run showcase)`);
  for (const e of manifest) {
    const a = allowed.get(e.id);
    if (!a) { out.push(`${e.id}: media present but not in the allowlist`); continue; }
    if (!isVisualKey(e.visual)) out.push(`${e.id}: unknown visual style ${e.visual}`);
    if (!isStoryKey(e.story)) out.push(`${e.id}: unknown story format ${e.story}`);
    const mapped = SERIES_MAP[seriesOf(a.source) ?? ""];
    if (!mapped) out.push(`${e.id}: series of ${a.source} is not in taxonomy map_from_series`);
    else if (mapped.visual !== e.visual || mapped.story !== e.story)
      out.push(`${e.id}: visual/story must be ${mapped.visual}/${mapped.story} from its series (run npm run showcase)`);
    if (e.poster.src !== `/showcase/${e.id}/poster.jpg`) out.push(`${e.id}: poster path must be /showcase/${e.id}/poster.jpg`);
    if (e.poster.bytes > SHOWCASE_LIMITS.posterBytes) out.push(`${e.id}: poster over ${SHOWCASE_LIMITS.posterBytes} bytes`);
    out.push(...checkFile(publicDir, e.id, "poster", e.poster));
    const from = a.poster === "cover" ? "cover" : "frame";
    if (e.poster.from !== from) out.push(`${e.id}: poster must come from the ${from} (run npm run showcase)`);
    if (e.preview) {
      if (e.preview.src !== `/showcase/${e.id}/preview.mp4`) out.push(`${e.id}: preview path must be /showcase/${e.id}/preview.mp4`);
      if (e.preview.bytes > SHOWCASE_LIMITS.previewBytes) out.push(`${e.id}: preview over ${SHOWCASE_LIMITS.previewBytes} bytes`);
      out.push(...checkFile(publicDir, e.id, "preview", e.preview));
    }
    if (e.link) {
      let host = "";
      try { const u = new URL(e.link.url); host = u.protocol === "https:" ? u.host : ""; } catch {}
      if (!LINK_HOSTS.has(host)) out.push(`${e.id}: link must be an https YouTube or Instagram URL`);
    }
    out.push(...creditProblems(e.id, e.madeWith, a.credits ?? []));
    const expected = new Set(["poster.jpg", ...(e.preview ? ["preview.mp4"] : [])]);
    const folder = path.join(publicDir, "showcase", e.id);
    if (fs.existsSync(folder)) {
      for (const name of fs.readdirSync(folder)) if (!expected.has(name)) out.push(`${e.id}: unexpected file ${name}`);
    }
  }
  const root = path.join(publicDir, "showcase");
  if (fs.existsSync(root)) {
    for (const name of fs.readdirSync(root)) if (!listed.has(name)) out.push(`showcase/${name}: unexpected folder`);
  }
  return out;
}
