import type { Skill } from "./catalog";
import {
  isPublishable,
  MEDIA_POLICY,
  PUBLISHED_MEDIA,
  type MediaPolicy,
} from "./publication";

/** Local-only presentation derivatives, not replacement source media or a rights grant.
 * Each cover is a real frame at 4s; crops remove intro plates, never source credits
 * from the original video. Original videos/posters and detail attribution stay intact.
 */
export const MEDIA_COVERS: Record<string, {
  poster: string; video: string; second: number;
  crop: readonly [number, number, number, number]; width: number; height: number;
}> = {
  "growkaz-stickman": {
    poster: "/previews/growkaz-stickman-cover.jpg",
    video: "/previews/growkaz-stickman-claude.mp4",
    second: 4, crop: [0, 240, 1080, 1600], width: 1080, height: 1600,
  },
  "thai-survival": {
    poster: "/previews/thai-survival-cover.jpg",
    video: "/previews/thai-survival-claude.mp4",
    second: 4, crop: [0, 300, 1080, 1600], width: 1080, height: 1600,
  },
};

/**
 * Catalog cover for a skill under the publication policy. A derived cover is
 * its own artwork: it needs its own publication approval, plus a published
 * source video present in the skill's examples. Approving the video never
 * approves the derivative. The fallback example poster is re-checked too, so
 * a raw (unpublished) skill cannot leak media through this helper.
 */
export function coverFor(
  skill: Pick<Skill, "slug" | "examples">,
  policy: MediaPolicy = MEDIA_POLICY,
  allowlist: ReadonlySet<string> = PUBLISHED_MEDIA,
): string | undefined {
  const ok = (url: string | null | undefined) => isPublishable(url, policy, allowlist);
  const cover = MEDIA_COVERS[skill.slug];
  if (
    cover &&
    ok(cover.poster) &&
    ok(cover.video) &&
    skill.examples.some(example => example.video === cover.video)
  ) return cover.poster;
  return skill.examples.find(example => ok(example.poster))?.poster;
}
