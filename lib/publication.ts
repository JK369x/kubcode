import type { Example, Skill } from "./catalog";

/**
 * Media publication policy.
 *
 * - "local-study": every local preview is shown, exactly as the raw catalog
 *   declares it. For dev/test, or an explicitly local production build.
 * - "licensed-only": only preview URLs listed in PUBLISHED_MEDIA are shown;
 *   everything else is removed from exported data (not hidden with CSS).
 *
 * Fail closed: an explicit "licensed-only" overrides every local allowance,
 * a production build without an explicit "local-study" is licensed-only, and
 * any unrecognised mode value (in any environment) is licensed-only.
 */
export type MediaPolicy = "local-study" | "licensed-only";

export function resolveMediaPolicy(input: {
  nodeEnv: string | undefined;
  mode: string | undefined;
}): MediaPolicy {
  const { nodeEnv, mode } = input;
  if (mode === "licensed-only") return "licensed-only";
  if (mode === "local-study") return "local-study";
  // Any other non-empty value is a typo or an unknown mode: fail closed.
  if (mode !== undefined && mode !== "") return "licensed-only";
  // No mode given. Next always defines NODE_ENV (production for every
  // command except `next dev`); only dev/test or a plain Node/tsx run
  // without NODE_ENV keep the local unfiltered behaviour.
  if (nodeEnv === undefined || nodeEnv === "development" || nodeEnv === "test") {
    return "local-study";
  }
  return "licensed-only";
}

/**
 * Build-time policy. Static `process.env.X` property access on purpose: Next
 * inlines NODE_ENV and NEXT_PUBLIC_* into server and client bundles alike, so
 * server render and hydration resolve the same policy. Do not destructure
 * process.env or use a computed key here — that would not be inlined.
 */
export const MEDIA_POLICY: MediaPolicy = resolveMediaPolicy({
  nodeEnv: process.env.NODE_ENV,
  mode: process.env.NEXT_PUBLIC_MEDIA_MODE,
});

/**
 * Exact public paths (e.g. "/previews/x.mp4") whose publication rights have
 * been verified. Each path is matched by strict string equality — no prefix,
 * case, query or filename inference. A video and a poster derived from it are
 * separate entries; approving one never approves the other.
 *
 * Intentionally empty: no preview's publication rights are verified yet.
 */
export const PUBLISHED_MEDIA: ReadonlySet<string> = new Set<string>([]);

export function isPublishable(
  url: string | null | undefined,
  policy: MediaPolicy = MEDIA_POLICY,
  allowlist: ReadonlySet<string> = PUBLISHED_MEDIA,
): url is string {
  if (typeof url !== "string" || url === "") return false;
  if (policy === "local-study") return true;
  return allowlist.has(url);
}

/** Thai notices for withheld media; shown instead of any stand-in artwork. */
export const RIGHTS_PENDING_LABEL = "สื่อรอยืนยันสิทธิ์เผยแพร่";
export const RIGHTS_PENDING_NOTE =
  "สื่อตัวอย่างของผู้เขียนนี้ยังไม่แสดงบนเว็บสาธารณะ ระหว่างรอยืนยันสิทธิ์เผยแพร่";
export const PUBLICATION_NOTICE = MEDIA_POLICY === "licensed-only"
  ? "สื่อตัวอย่างรอยืนยันสิทธิ์เผยแพร่ · ยังไม่มีชุดดาวน์โหลด"
  : "ตัวอย่างสำหรับศึกษาในเครื่อง · สิทธิ์เผยแพร่ยังไม่ยืนยัน · ยังไม่มีชุดดาวน์โหลด";
export const VIDEO_WITHHELD_NOTE =
  "วิดีโอตัวอย่างยังไม่แสดงบนเว็บสาธารณะ ระหว่างรอยืนยันสิทธิ์เผยแพร่";
export const POSTER_WITHHELD_NOTE =
  "ภาพปกตัวอย่างยังไม่แสดงบนเว็บสาธารณะ ระหว่างรอยืนยันสิทธิ์เผยแพร่";

function publishExample(
  example: Example,
  policy: MediaPolicy,
  allowlist: ReadonlySet<string>,
): Example {
  const { video, poster, ...rest } = example;
  const keepVideo = isPublishable(video, policy, allowlist);
  const keepPoster = isPublishable(poster, policy, allowlist);
  const droppedVideo = Boolean(video) && !keepVideo;
  const droppedPoster = Boolean(poster) && !keepPoster;
  if (!droppedVideo && !droppedPoster) return { ...example };

  const out: Example = { ...rest, mediaWithheld: "rights-pending" };
  if (keepVideo) out.video = video;
  else if (video === null) out.video = null;
  if (keepPoster) out.poster = poster;
  if (!keepVideo && !keepPoster) {
    // Nothing playable remains: drop claims of a real/playable sample but
    // keep the truthful source attribution (author/model/renderer/voice).
    out.label = `${example.author} — ${RIGHTS_PENDING_LABEL}`;
    out.notes = RIGHTS_PENDING_NOTE;
  } else {
    // Original notes describe the full media pair; state what was withheld.
    out.notes = droppedVideo ? VIDEO_WITHHELD_NOTE : POSTER_WITHHELD_NOTE;
  }
  return out;
}

/**
 * Catalog as exported for the given policy. Local-study returns the raw list
 * itself (unchanged behaviour). Licensed-only returns fresh copies with every
 * unapproved video/poster removed; ids, slugs, metadata and order are kept,
 * and the raw definitions are never mutated.
 */
export function publishSkills(
  raw: readonly Skill[],
  policy: MediaPolicy = MEDIA_POLICY,
  allowlist: ReadonlySet<string> = PUBLISHED_MEDIA,
): Skill[] {
  if (policy === "local-study") return [...raw];
  return raw.map((skill) => ({
    ...skill,
    requirements: [...skill.requirements],
    examples: skill.examples.map((example) =>
      publishExample(example, policy, allowlist),
    ),
  }));
}

/** True when a skill had example media that this build withheld. */
export function hasWithheldMedia(skill: Pick<Skill, "examples">): boolean {
  return skill.examples.some((example) => example.mediaWithheld === "rights-pending");
}
