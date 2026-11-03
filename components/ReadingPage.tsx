import Link from "next/link";
import { TitleTransition } from "@/components/TitleTransition";
import type { CSSProperties, ReactNode } from "react";
import type { Tag } from "@/lib/content";
import type { TocItem } from "@/lib/mdx";
import { FontSizeControl } from "./FontSizeControl";
import { TagList } from "./TagList";
import { TocNav } from "./TocNav";


const enter = (i: number) => ({ "--i": i }) as CSSProperties;

export function ReadingPage({
  kind,
  slug,
  crumbs,
  badge,
  updated,
  title,
  lead,
  tags,
  allTags,
  toc,
  intro,
  children,
  after,
}: {
  kind: "article" | "tool";
  slug: string;
  crumbs: Array<{ name: string; href: string }>;
  badge: string;
  updated: string;
  title: string;
  lead: string;
  tags: string[];
  allTags: Tag[];
  toc: TocItem[];
  /** Rendered above the prose, inside the reading column (e.g. tool facts). */
  intro?: ReactNode;
  children: ReactNode;
  /** Full-width sections after the prose (related links, credits, comments). */
  after?: ReactNode;
}) {
  const date = new Date(`${updated}T00:00:00Z`).toLocaleDateString("th-TH", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  return (
    <main id="main" className="reading-page">
      <header className="reading-head">
        <nav aria-label="เส้นทางหน้า" className="crumbs enter" style={enter(0)}>
          <ol>
            {crumbs.map((c) => (
              <li key={c.href}>
                <Link href={c.href} transitionTypes={["nav-back"]}>
                  {c.name}
                </Link>
              </li>
            ))}
            <li aria-current="page">{title}</li>
          </ol>
        </nav>
        <p className="reading-meta enter" style={enter(1)}>
          <span className="kind-badge">{badge}</span>
          <span>
            อัปเดต <time dateTime={updated}>{date}</time>
          </span>
        </p>
        <TitleTransition kind={kind} slug={slug}>
          {/* No entrance animation: on list → page navigation the title morphs. */}
          <h1>{title}</h1>
        </TitleTransition>
        <p className="lead enter" style={enter(2)}>
          {lead}
        </p>
        <div className="enter" style={enter(3)}>
          <TagList slugs={tags} tags={allTags} />
        </div>
        <div className="reading-rule enter" style={enter(4)}>
          <FontSizeControl />
        </div>
      </header>
      <div className={toc.length > 1 ? "reading-grid has-toc" : "reading-grid"}>
        <div className="reading-col">
          {toc.length > 1 && (
            <details className="toc-mobile">
              <summary>สารบัญ</summary>
              <TocNav items={toc} spy={false} />
            </details>
          )}
          {intro}
          <article className="prose" aria-label={title}>
            {children}
          </article>
        </div>
        {toc.length > 1 && (
          <aside className="toc-col" aria-label="สารบัญ">
            <p className="toc-label">สารบัญ</p>
            <TocNav items={toc} spy />
          </aside>
        )}
      </div>
      <div className="reading-after">{after}</div>
    </main>
  );
}
