import { isPublishable, MEDIA_POLICY, PUBLISHED_MEDIA, type MediaPolicy } from "./publication";
import { SHOWCASE_ALLOWLIST, SHOWCASE_VISUALS, type ShowcaseCredit, type ShowcaseMadeBy } from "./showcase-allowlist";
import type { StoryKey, VisualKey } from "./taxonomy";
import type { Logo, Tool } from "./content";
import { SHOWCASE_MANIFEST } from "./showcase-manifest";

/** A showcase clip as the homepage renders it. */
export type ShowcaseItem = {
  id: string;
  label: string;
  title: string;
  /** How the clip looks: a taxonomy visual style (and SHOWCASE_VISUALS key). */
  visual: VisualKey;
  /** How its story is told: a taxonomy story format. */
  story: StoryKey;
  /** This clip represents its visual style on the homepage. */
  cover: boolean;
  aspect: "portrait" | "landscape";
  poster: { src: string; width: number; height: number };
  preview: { src: string } | null;
  link: { url: string; platform: "youtube" | "instagram" } | null;
  credits: readonly ShowcaseCredit[];
  /** The agent and model that made the clip, shown on its card. */
  madeBy: ShowcaseMadeBy;
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
      visual: m.visual,
      story: m.story,
      cover: entry.cover === true,
      aspect: m.aspect,
      poster: { src: m.poster.src, width: m.poster.width, height: m.poster.height },
      preview: m.preview && isPublishable(m.preview.src, policy, allowlist) ? { src: m.preview.src } : null,
      link: m.link ? { url: m.link.url, platform: m.link.platform } : null,
      credits: entry.credits ?? [],
      madeBy: entry.madeBy,
    }];
  });
}

const isPodcast = (item: ShowcaseItem) => SHOWCASE_VISUALS[item.visual]?.section === "podcast";

/** Clips for the homepage shelf: every visual style except the podcast section. */
export function cartoonShowcase(items: readonly ShowcaseItem[]): ShowcaseItem[] {
  return items.filter((i) => !isPodcast(i));
}

/**
 * One homepage card: a visual style, the clip that represents it, how many
 * clips it has and the story formats those clips use (first-seen order).
 */
export type ShelfEntry = { visual: VisualKey; clip: ShowcaseItem; count: number; stories: StoryKey[] };

/**
 * Groups clips into one entry per visual style, in first-seen order. The
 * style's cover clip represents it; without one, its first portrait clip
 * (cards are portrait), else its first clip.
 */
export function visualShelf(items: readonly ShowcaseItem[]): ShelfEntry[] {
  const groups = new Map<VisualKey, ShowcaseItem[]>();
  for (const item of items) groups.set(item.visual, [...(groups.get(item.visual) ?? []), item]);
  return [...groups].map(([visual, clips]) => ({
    visual,
    clip: clips.find((c) => c.cover) ?? clips.find((c) => c.aspect === "portrait") ?? clips[0],
    count: clips.length,
    stories: [...new Set(clips.map((c) => c.story))],
  }));
}

/** A tool as a visual-style card shows it: a small logo with the product name. */
export type StyleTool = { slug: string; name: string; logo: Logo };

/**
 * Each visual style's tools, resolved against the /tools pages (server side,
 * where content is readable) in the order the style lists them.
 */
export function styleToolsFrom(tools: readonly Tool[]): Record<string, StyleTool[]> {
  const bySlug = new Map(tools.map((t) => [t.slug, t]));
  return Object.fromEntries(
    Object.entries(SHOWCASE_VISUALS).map(([visual, s]) => [
      visual,
      (s?.tools ?? []).flatMap((slug) => {
        const t = bySlug.get(slug);
        return t ? [{ slug: t.slug, name: t.name, logo: t.logo }] : [];
      }),
    ]),
  );
}

/** A catalogue skill's approved clips: every clip of every visual style that names it. */
export type SkillShowcase = { cover: ShowcaseItem; clips: ShowcaseItem[]; detail?: string };

/**
 * Approved showcase clips for a catalogue skill, or null when none of its
 * visual styles has a published clip. The cover is the first such style's
 * cover clip.
 */
export function showcaseForSkill(
  slug: string,
  items: readonly ShowcaseItem[] = publishedShowcase(),
): SkillShowcase | null {
  const visuals = Object.entries(SHOWCASE_VISUALS).filter(([, s]) => s?.skill === slug).map(([key]) => key);
  const clips = items.filter((c) => visuals.includes(c.visual));
  if (clips.length === 0) return null;
  const first = visualShelf(clips)[0];
  return { cover: first.clip, clips, detail: SHOWCASE_VISUALS[first.visual]?.detail };
}
