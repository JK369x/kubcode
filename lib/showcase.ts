import { isPublishable, MEDIA_POLICY, PUBLISHED_MEDIA, type MediaPolicy } from "./publication";
import { SHOWCASE_ALLOWLIST, type ShowcaseCredit } from "./showcase-allowlist";
import { SHOWCASE_MANIFEST } from "./showcase-manifest";

/** A showcase clip as the homepage renders it. */
export type ShowcaseItem = {
  id: string;
  label: string;
  title: string;
  /** Key into SHOWCASE_STYLES. */
  style: string;
  /** This clip represents its style on the homepage. */
  cover: boolean;
  aspect: "portrait" | "landscape";
  poster: { src: string; width: number; height: number };
  preview: { src: string } | null;
  link: { url: string; platform: "youtube" | "instagram" } | null;
  credits: readonly ShowcaseCredit[];
};

/**
 * Showcase clips this build may show, in allowlist order. A clip needs its
 * poster approved to appear at all; its preview is kept only if the preview
 * file is approved too.
 */
export function publishedShowcase(
  policy: MediaPolicy = MEDIA_POLICY,
  allowlist: ReadonlySet<string> = PUBLISHED_MEDIA,
): ShowcaseItem[] {
  return SHOWCASE_ALLOWLIST.flatMap((entry) => {
    const m = SHOWCASE_MANIFEST.find((e) => e.id === entry.id);
    if (!m || !isPublishable(m.poster.src, policy, allowlist)) return [];
    return [{
      id: m.id,
      label: entry.label,
      title: m.title,
      style: entry.style,
      cover: entry.cover === true,
      aspect: m.aspect,
      poster: { src: m.poster.src, width: m.poster.width, height: m.poster.height },
      preview: m.preview && isPublishable(m.preview.src, policy, allowlist) ? { src: m.preview.src } : null,
      link: m.link ? { url: m.link.url, platform: m.link.platform } : null,
      credits: entry.credits ?? [],
    }];
  });
}

/** One homepage card: a style, the clip that represents it, and how many clips it has. */
export type ShelfEntry = { style: string; clip: ShowcaseItem; count: number };

/**
 * Groups clips into one entry per style, in first-seen order. The style's
 * cover clip represents it; without one, its first portrait clip (cards are
 * portrait), else its first clip.
 */
export function styleShelf(items: readonly ShowcaseItem[]): ShelfEntry[] {
  const groups = new Map<string, ShowcaseItem[]>();
  for (const item of items) groups.set(item.style, [...(groups.get(item.style) ?? []), item]);
  return [...groups].map(([style, clips]) => ({
    style,
    clip: clips.find((c) => c.cover) ?? clips.find((c) => c.aspect === "portrait") ?? clips[0],
    count: clips.length,
  }));
}
