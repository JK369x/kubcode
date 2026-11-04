/** Shared view-transition name for a page title in lists and on its page. */
export const titleTransitionName = (kind: "article" | "tool", slug: string) => `kb-title-${kind}-${slug}`;

/** Shared view-transition name for an article cover in cards and on its page. */
export const coverTransitionName = (slug: string) => `kb-cover-article-${slug}`;

/** Shared view-transition name for a tool logo in cards and on its page. */
export const logoTransitionName = (slug: string) => `kb-logo-tool-${slug}`;
