/** Shared view-transition name for a page title in lists and on its page. */
export const titleTransitionName = (kind: "article" | "tool", slug: string) => `kb-title-${kind}-${slug}`;
