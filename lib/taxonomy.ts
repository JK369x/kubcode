/**
 * Two independent ways to describe a clip (owner decision 2026-11-10):
 *
 * - visual style (แนวภาพ): how the clip looks, the kit and renderer;
 * - story format (แนวเรื่อง): how the story is told, the script formula.
 *
 * One story format can use many visual styles and the other way round, so the
 * homepage filters them separately. The keys and Thai labels come from the
 * studio's taxonomy (~/Studio/taxonomy.json, copied to lib/taxonomy.json so
 * the build does not depend on the studio folder; a test keeps the copy in
 * step when the studio file is present).
 *
 * The site adds a few keys for catalogue skills the studio has not filed yet
 * (SITE_VISUALS / SITE_STORIES). Move them into the studio file when it
 * gains them.
 */
import taxonomy from "./taxonomy.json";

export type TaxonomyLabel = { th: string; en: string };

/** Site-only visual styles: catalogue skills with no studio series yet. */
const SITE_VISUALS = {
  // make-short: Blender scenes built in code, bean-shaped characters.
  "blender-3d": { th: "3D Blender", en: "3D Blender" },
} satisfies Record<string, TaxonomyLabel>;

/** Site-only story formats. */
const SITE_STORIES = {
  // make-short's formula: a history paradox, told as fact.
  "paradox-fact": { th: "ข้อเท็จจริงย้อนแย้ง", en: "Paradox Fact" },
} satisfies Record<string, TaxonomyLabel>;

const pick = (r: Record<string, { th: string; en: string }>) =>
  Object.fromEntries(Object.entries(r).map(([k, v]) => [k, { th: v.th, en: v.en }]));

export type VisualKey = keyof typeof taxonomy.visual_styles | keyof typeof SITE_VISUALS;
export type StoryKey = keyof typeof taxonomy.story_formats | keyof typeof SITE_STORIES;

/** Every visual style, studio order first, then the site's own. */
export const VISUAL_STYLES = { ...pick(taxonomy.visual_styles), ...SITE_VISUALS } as Readonly<Record<VisualKey, TaxonomyLabel>>;
/** Every story format, studio order first, then the site's own. */
export const STORY_FORMATS = { ...pick(taxonomy.story_formats), ...SITE_STORIES } as Readonly<Record<StoryKey, TaxonomyLabel>>;

export const SITE_ONLY_KEYS = { visual: Object.keys(SITE_VISUALS), story: Object.keys(SITE_STORIES) } as const;

export const isVisualKey = (k: string): k is VisualKey => Object.hasOwn(VISUAL_STYLES, k);
export const isStoryKey = (k: string): k is StoryKey => Object.hasOwn(STORY_FORMATS, k);

export type Classification = { visual: VisualKey; story: StoryKey };

/** The studio's series -> [visual style, story format] map. */
export const SERIES_MAP: Readonly<Record<string, Classification>> = Object.fromEntries(
  Object.entries(taxonomy.map_from_series).map(([series, [visual, story]]) => [
    series,
    { visual: visual as VisualKey, story: story as StoryKey },
  ]),
);

/**
 * The series a showcase source belongs to: `studio:<date>_<series>_epNN_...`
 * names it in the clip folder; `style:<series>/...` is a style kit's own demo.
 */
export function seriesOf(source: string): string | null {
  const studio = source.match(/^studio:\d{4}-\d{2}-\d{2}_(.+?)_ep\d+/);
  if (studio) return studio[1];
  const style = source.match(/^style:([^/]+)\//);
  return style ? style[1] : null;
}

/** A source's visual style and story format, from its series. Throws for an unmapped series. */
export function classifySource(source: string): Classification {
  const series = seriesOf(source);
  const found = series ? SERIES_MAP[series] : undefined;
  if (!found) throw new Error(`${source}: series ${series ?? "?"} is not in taxonomy map_from_series`);
  return found;
}
