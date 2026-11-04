import { TOOL_CATEGORIES, type Content, type Tool, type ToolCategory } from "./content";
import { related } from "./content-links";
import { CATEGORY_LABELS } from "./kb-labels";

export const stageHref = (key: ToolCategory) => `/tools/c/${key}`;

/** `step` is the stage's place in the eight-stage pipeline (1–8); null for "all". */
export type StageChip = { key: ToolCategory | null; label: string; step: number | null; count: number; href: string; active: boolean };

const stepOf = (c: ToolCategory) => TOOL_CATEGORIES.indexOf(c) + 1;

/** Production order (stage), then name. */
export function sortTools(tools: Tool[]): Tool[] {
  return [...tools].sort((x, y) => stepOf(x.category) - stepOf(y.category) || x.name.localeCompare(y.name, "en"));
}

/**
 * What /tools (or one stage page) shows: the tools in production order and
 * filter chips for the non-empty stages, numbered by their pipeline step.
 */
export function toolIndex(content: Content, stage?: ToolCategory) {
  const all = sortTools(content.tools);
  const chips: StageChip[] = [
    { key: null, label: "ทั้งหมด", step: null, count: all.length, href: "/tools", active: !stage },
    ...TOOL_CATEGORIES.map((c) => ({
      key: c,
      label: CATEGORY_LABELS[c],
      step: stepOf(c),
      count: all.filter((x) => x.category === c).length,
      href: stageHref(c),
      active: c === stage,
    })).filter((c) => c.count > 0),
  ];
  return { tools: stage ? all.filter((x) => x.category === stage) : all, chips };
}

/** How many articles and skills link to (or from) a tool, for its card. */
export function toolUsage(content: Content, tool: Tool): { articles: number; skills: number } {
  const links = related(content, { kind: "tool", slug: tool.slug });
  return {
    articles: links.filter((l) => l.kind === "article").length,
    skills: links.filter((l) => l.kind === "skill").length,
  };
}

/** Tools an article links to (or that link to it), in production order. */
export function articleTools(content: Content, article: { slug: string }): Tool[] {
  const slugs = new Set(related(content, { kind: "article", slug: article.slug }).filter((l) => l.kind === "tool").map((l) => l.slug));
  return sortTools(content.tools.filter((t) => slugs.has(t.slug)));
}
