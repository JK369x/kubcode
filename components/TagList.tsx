import Link from "next/link";
import type { Tag } from "@/lib/content";
import { tagHref } from "@/lib/seo";

export function TagList({ slugs, tags }: { slugs: string[]; tags: Tag[] }) {
  if (slugs.length === 0) return null;
  return (
    <ul className="tag-list" aria-label="แท็ก">
      {slugs.map((slug) => (
        <li key={slug}>
          <Link href={tagHref(slug)}>#{tags.find((t) => t.slug === slug)?.th ?? slug}</Link>
        </li>
      ))}
    </ul>
  );
}
