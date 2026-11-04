import type { Article, Content } from "./content";

export const categoryHref = (key: string) => `/articles/c/${key}`;

export type CategoryChip = { key: string | null; label: string; count: number; href: string; active: boolean };

/** Newest first (by `updated`), then by title for a stable order. */
export function sortArticles(articles: Article[]): Article[] {
  return [...articles].sort((x, y) => y.updated.localeCompare(x.updated) || x.title.localeCompare(y.title, "th"));
}

/**
 * What /articles (or one category page) shows: a hero article (an explicit
 * `featured: true`, else the newest), the rest newest first, and filter chips
 * for the non-empty categories in their configured order.
 */
export function articleIndex(content: Content, category?: string) {
  const all = sortArticles(content.articles);
  const list = category ? all.filter((a) => a.category === category) : all;
  const featured = list.find((a) => a.featured) ?? list[0];
  const rest = list.filter((a) => a !== featured);
  const chips: CategoryChip[] = [
    { key: null, label: "ทั้งหมด", count: all.length, href: "/articles", active: !category },
    ...content.categories
      .map((c) => ({
        key: c.key,
        label: c.th,
        count: all.filter((a) => a.category === c.key).length,
        href: categoryHref(c.key),
        active: c.key === category,
      }))
      .filter((c) => c.count > 0),
  ];
  return { featured, rest, chips };
}
