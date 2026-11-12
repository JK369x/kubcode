// Homepage hero, option B "phone stage" (owner decision 2026-11-11,
// ~/Studio/work/kubcode-hero-options/DECISION.md): which clips the picker
// shows, in what order, and the colours of each clip's aura.
import type { ShowcaseItem } from "./showcase";
import { SHOWCASE_AGENTS } from "./showcase-allowlist";
import { STORY_FORMATS, VISUAL_STYLES } from "./taxonomy";

/**
 * One card per series beat, so the row is not seven near-identical zombie
 * episodes. Clips this build may not publish are skipped.
 */
export const HERO_FEATURED: readonly string[] = [
  "2026-10-25_zombie-condo_ep01_tomorrow-invasion",
  "2026-11-01_freshstack-what-if_ep03_internet-gone-week",
  "2026-10-29_mall-infection_ep01_first-night",
  "2026-11-01_what-if-studio_ep01_mute-touch",
  "2026-10-28_satire-stories_ep01_elon-dream-low-poly",
  "2026-10-25_zombie-condo_ep04_shopping-cart",
  "2026-11-01_freshstack-what-if_ep05_no-one-can-lie",
  "2026-10-30_mall-infection_ep02_stairs",
  "low-poly-urban-study",
  "2026-10-26_zombie-condo_ep06_fire-stairs-voice",
];

/** Aura colours hand-picked from each poster (deep background, accent glow). */
const COLOURS: Readonly<Record<string, readonly [deep: string, accent: string]>> = {
  "2026-10-25_zombie-condo_ep01_tomorrow-invasion": ["#2a2152", "#c04ad0"],
  "2026-10-25_zombie-condo_ep04_shopping-cart": ["#2c2440", "#c99a52"],
  "2026-10-26_zombie-condo_ep06_fire-stairs-voice": ["#1f2a36", "#5fb37e"],
  "2026-10-29_mall-infection_ep01_first-night": ["#0f211c", "#4cc49a"],
  "2026-10-30_mall-infection_ep02_stairs": ["#24251a", "#b8b24a"],
  "2026-10-28_satire-stories_ep01_elon-dream-low-poly": ["#2a2218", "#c8964a"],
  "2026-11-01_freshstack-what-if_ep03_internet-gone-week": ["#1e1838", "#ff7a3c"],
  "2026-11-01_freshstack-what-if_ep05_no-one-can-lie": ["#3a1f1c", "#ff6a4a"],
  "2026-11-01_what-if-studio_ep01_mute-touch": ["#33201a", "#f2a64a"],
  "low-poly-urban-study": ["#1a2028", "#8ab0d0"],
};
const DEFAULT_COLOURS = ["#2a2152", "#bb98ff"] as const;

export type HeroClip = {
  id: string;
  label: string;
  poster: { src: string; width: number; height: number };
  /** Muted loop; null when only the poster may be shown. */
  preview: string | null;
  visualTh: string;
  storyTh: string;
  agent: string;
  deep: string;
  accent: string;
};

export function heroClips(items: readonly ShowcaseItem[]): HeroClip[] {
  return HERO_FEATURED.flatMap((id) => {
    const c = items.find((i) => i.id === id);
    if (!c) return [];
    const [deep, accent] = COLOURS[id] ?? DEFAULT_COLOURS;
    return [{
      id: c.id,
      label: c.label,
      poster: c.poster,
      preview: c.preview?.src ?? null,
      visualTh: VISUAL_STYLES[c.visual]?.th ?? c.visual,
      storyTh: STORY_FORMATS[c.story]?.th ?? c.story,
      agent: SHOWCASE_AGENTS[c.madeBy.agent] ?? c.madeBy.agent,
      deep,
      accent,
    }];
  });
}

/** Line 2 of the headline types this for the selected clip ("ทำแนว<แนวเรื่อง>"). */
export const headlinePhrase = (c: Pick<HeroClip, "storyTh" | "visualTh">) => "ทำแนว" + (c.storyTh || c.visualTh || "นี้");

/** Thai-safe typing units: grapheme clusters, so tone marks never appear alone. */
export function graphemes(text: string): string[] {
  const Seg = (Intl as unknown as { Segmenter?: new (l: string, o: { granularity: string }) => { segment(s: string): Iterable<{ segment: string }> } }).Segmenter;
  return Seg ? [...new Seg("th", { granularity: "grapheme" }).segment(text)].map((s) => s.segment) : [...text];
}

/** How many leading graphemes two phrases share (the typewriter keeps these). */
export function commonPrefix(a: readonly string[], b: readonly string[]): number {
  let k = 0;
  while (k < a.length && k < b.length && a[k] === b[k]) k++;
  return k;
}
