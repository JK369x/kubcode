import { rawSkills } from "./catalog";
import type { Content, Page, Ref, RefKind } from "./content";

/** A resolved cross-link, ready to render. */
export type LinkItem = Ref & { title: string; description: string; href: string };

const BASE_PATH: Record<RefKind, string> = {
  article: "/articles/",
  tool: "/tools/",
  skill: "/skills/",
};

export function hrefOf(ref: Ref): string {
  return BASE_PATH[ref.kind] + ref.slug;
}

const key = (ref: Ref) => `${ref.kind}:${ref.slug}`;

function pagesOf(content: Content): Page[] {
  return [...content.articles, ...content.tools];
}

function resolve(content: Content, ref: Ref): LinkItem | undefined {
  if (ref.kind === "skill") {
    const skill = rawSkills.find((s) => s.slug === ref.slug);
    return skill && { ...ref, title: skill.name, description: skill.description, href: hrefOf(ref) };
  }
  const page = pagesOf(content).find((p) => p.kind === ref.kind && p.slug === ref.slug);
  return page && { ...ref, title: page.title, description: page.description, href: hrefOf(ref) };
}

/**
 * Everything linked to `target`: pages it refs plus pages that ref it.
 * "Used by" sections come from here, so refs are written once, on either side.
 */
export function related(content: Content, target: Ref): LinkItem[] {
  const found = new Map<string, Ref>();
  const self = key(target);
  for (const page of pagesOf(content)) {
    const pageRef: Ref = { kind: page.kind, slug: page.slug };
    if (key(pageRef) === self) {
      for (const ref of page.refs) found.set(key(ref), ref);
    } else if (page.refs.some((ref) => key(ref) === self)) {
      found.set(key(pageRef), pageRef);
    }
  }
  found.delete(self);
  return [...found.values()]
    .map((ref) => resolve(content, ref))
    .filter((item): item is LinkItem => item !== undefined);
}

/** Articles and tools carrying `tag`, for /tags/<tag>. */
export function pagesForTag(content: Content, tag: string): LinkItem[] {
  return pagesOf(content)
    .filter((p) => p.tags.includes(tag))
    .map((p) => resolve(content, { kind: p.kind, slug: p.slug })!);
}
