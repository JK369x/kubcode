/**
 * Homepage filters (owner decision 2026-11-10). Three independent rows that
 * combine with AND:
 *
 * - use case (อยากทำอะไร): what the creator wants to make; every skill has
 *   one. It is the only way to reach the tools (voice, captions, podcast
 *   cutting, coding), which are not a look or a way of telling a story.
 * - แนวภาพ (visual style): how a clip looks.
 * - แนวเรื่อง (story format): how its story is told.
 *
 * Visual and story come from the taxonomy (lib/taxonomy.ts). A skill matches
 * a visual style or story format it declares (lib/catalog.ts), or one of its
 * homepage clips has. Clips match by their own pair. Each row lists only the
 * keys some skill or homepage clip has.
 *
 * Homepage clips are the shelf's (no podcast clips: those live on their
 * skill page). A style skill's facets add those of all its published clips;
 * tools have none.
 */
import { filterSkills, type Skill } from "./catalog";
import { showcaseForSkill, type ShowcaseItem } from "./showcase";
import { STORY_FORMATS, VISUAL_STYLES, type StoryKey, type VisualKey } from "./taxonomy";

export type Axis = "visual" | "story";
export type HomeFilter = { query: string; useCase: string; visual: string; story: string };
export const NO_FILTER: HomeFilter = { query: "", useCase: "all", visual: "all", story: "all" };

/** What the homepage filters over. */
export type HomeData = {
  skills: readonly Skill[];
  /** Clips the homepage may list (the shelf's). */
  clips: readonly ShowcaseItem[];
  /** Every published clip, for skills' facets. */
  published: readonly ShowcaseItem[];
};

/** Clips join the list only while a แนวภาพ or แนวเรื่อง is set. */
export const lookFiltered = (f: HomeFilter) => f.visual !== "all" || f.story !== "all";

/** The visual styles and story formats a skill can be found under. */
export function skillFacets(
  skill: Pick<Skill, "slug" | "visual" | "story">,
  clips: readonly ShowcaseItem[],
): { visual: Set<VisualKey>; story: Set<StoryKey> } {
  // Tools (no visual style of their own) stay out of both rows, even when
  // clips were cut with them: the podcast skill is found by its use case.
  if (!skill.visual) return { visual: new Set(), story: new Set() };
  const own = showcaseForSkill(skill.slug, clips)?.clips ?? [];
  return {
    visual: new Set([...(skill.visual ? [skill.visual] : []), ...own.map((c) => c.visual)]),
    story: new Set([...(skill.story ? [skill.story] : []), ...own.map((c) => c.story)]),
  };
}

const hit = (wanted: string, has: (k: string) => boolean) => wanted === "all" || has(wanted);

/** Skills that pass every row and the search box. */
export function filterHomeSkills(data: HomeData, f: HomeFilter): Skill[] {
  return filterSkills([...data.skills], f.query, f.useCase).filter((s) => {
    const facets = skillFacets(s, data.published);
    return hit(f.visual, (k) => facets.visual.has(k as VisualKey)) && hit(f.story, (k) => facets.story.has(k as StoryKey));
  });
}

/**
 * Homepage clips that pass every row and the search box. Homepage clips are
 * story clips, so a use case other than "story" leaves none.
 */
export function filterHomeClips(clips: readonly ShowcaseItem[], f: HomeFilter): ShowcaseItem[] {
  if (f.useCase !== "all" && f.useCase !== "story") return [];
  const q = f.query.trim().toLocaleLowerCase();
  return clips.filter((c) => {
    if (!hit(f.visual, (k) => c.visual === k) || !hit(f.story, (k) => c.story === k)) return false;
    if (!q) return true;
    const text = [c.label, c.title, VISUAL_STYLES[c.visual].th, VISUAL_STYLES[c.visual].en, STORY_FORMATS[c.story].th, STORY_FORMATS[c.story].en];
    return text.join(" ").toLocaleLowerCase().includes(q);
  });
}

export type FacetOption = { id: string; label: string; count: number };

/**
 * One filter row: "ทั้งหมด" then every key some skill or clip has, in
 * taxonomy order. Counts are skills plus clips that would show if the key
 * were picked, keeping the other rows (not the search box).
 */
export function facetOptions(axis: Axis, data: HomeData, f: HomeFilter): FacetOption[] {
  const { skills, clips, published } = data;
  const labels: Readonly<Record<string, { th: string }>> = axis === "visual" ? VISUAL_STYLES : STORY_FORMATS;
  const present = new Set<string>();
  for (const s of skills) for (const k of skillFacets(s, published)[axis]) present.add(k);
  for (const c of clips) present.add(c[axis]);
  const count = (id: string) => {
    const g = { ...f, query: "", [axis]: id };
    return filterHomeSkills(data, g).length + (lookFiltered(g) ? filterHomeClips(clips, g).length : 0);
  };
  return [
    { id: "all", label: "ทั้งหมด", count: count("all") },
    ...Object.keys(labels).filter((k) => present.has(k)).map((k) => ({ id: k, label: labels[k].th, count: count(k) })),
  ];
}

/** Reads ?use=&visual=&story= into a filter; unknown values fall back to "all". */
export function filterFromSearch(search: string, known: { useCases: readonly string[] }): HomeFilter {
  const p = new URLSearchParams(search);
  const pick = (v: string | null, ok: (k: string) => boolean) => (v && ok(v) ? v : "all");
  return {
    query: p.get("q") ?? "",
    useCase: pick(p.get("use"), (k) => known.useCases.includes(k)),
    visual: pick(p.get("visual"), (k) => Object.hasOwn(VISUAL_STYLES, k)),
    story: pick(p.get("story"), (k) => Object.hasOwn(STORY_FORMATS, k)),
  };
}

/** The query string for a filter, leaving out rows set to "all". */
export function searchFromFilter(f: HomeFilter): string {
  const p = new URLSearchParams();
  if (f.query) p.set("q", f.query);
  if (f.useCase !== "all") p.set("use", f.useCase);
  if (f.visual !== "all") p.set("visual", f.visual);
  if (f.story !== "all") p.set("story", f.story);
  const s = p.toString();
  return s ? `?${s}` : "";
}
