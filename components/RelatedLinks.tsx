import Link from "next/link";
import type { RefKind } from "@/lib/content";
import type { LinkItem } from "@/lib/content-links";

/**
 * "Used by" / related sections, one per kind, computed from refs.
 * Renders nothing for kinds without items.
 */
export function RelatedLinks({
  items,
  headings,
}: {
  items: LinkItem[];
  headings: Partial<Record<RefKind, string>>;
}) {
  const kinds = (Object.keys(headings) as RefKind[]).filter((k) =>
    items.some((i) => i.kind === k),
  );
  if (kinds.length === 0) return null;
  return (
    <aside className="related" aria-label="ลิงก์ที่เกี่ยวข้อง">
      {kinds.map((kind) => (
        <section key={kind}>
          <h2>{headings[kind]}</h2>
          <ul>
            {items
              .filter((i) => i.kind === kind)
              .map((i) => (
                <li key={i.href}>
                  <Link href={i.href}>{i.title}</Link>
                  <p>{i.description}</p>
                </li>
              ))}
          </ul>
        </section>
      ))}
    </aside>
  );
}
