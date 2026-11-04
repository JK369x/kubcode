import Link from "next/link";
import { TitleTransition } from "@/components/TitleTransition";
import Image from "next/image";
import { Morph } from "./Morph";
import { coverTransitionName } from "@/lib/view-transition-names";
import type { CSSProperties, ReactNode } from "react";
import type { Tag } from "@/lib/content";
import type { TocItem } from "@/lib/mdx";
import { FontSizeControl } from "./FontSizeControl";
import { TagList } from "./TagList";
import { TocNav } from "./TocNav";
import { PageRail } from "./PageRail";
import type { InteractionTarget } from "./PageInteractions";

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
  interactions,
  cover,
  titleMark,
  headerTools,
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
  /** Sections after the prose (related links, credits). */
  after?: ReactNode;
  /** Stars + comments in the right rail (tool and skill pages). */
  interactions?: InteractionTarget;
  /** Article cover shown as the hero image under the header. */
  cover?: { src: string; alt: string; width: number; height: number };
  /** Shown before the title, e.g. a tool's logo. */
  titleMark?: ReactNode;
  /** Shown under the tags, e.g. the tools an article uses. */
  headerTools?: ReactNode;
}) {
  const date = new Date(`${updated}T00:00:00Z`).toLocaleDateString("th-TH", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  return (
    <main id="main" className="reading-page">
      <div
        className={
          toc.length > 1 || interactions
            ? "reading-grid has-rail"
            : "reading-grid"
        }
      >
        <div className="reading-main">
          <header className="reading-head">
            <nav
              aria-label="เส้นทางหน้า"
              className="crumbs enter"
              style={enter(0)}
            >
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
            {titleMark ? (
              <div className="reading-title-row">
                {titleMark}
                <TitleTransition kind={kind} slug={slug}>
                  <h1>{title}</h1>
                </TitleTransition>
              </div>
            ) : (
              <TitleTransition kind={kind} slug={slug}>
                {/* No entrance animation: on list → page navigation the title morphs. */}
                <h1>{title}</h1>
              </TitleTransition>
            )}
            <p className="lead enter" style={enter(2)}>
              {lead}
            </p>
            <div className="enter" style={enter(3)}>
              <TagList slugs={tags} tags={allTags} />
            </div>
            {headerTools && (
              <div className="reading-tools enter" style={enter(3)}>
                {headerTools}
              </div>
            )}
            <div className="reading-rule enter" style={enter(4)}>
              <FontSizeControl />
            </div>
          </header>
          {cover && (
            <Morph name={coverTransitionName(slug)}>
              <figure className="reading-hero">
                <Image src={cover.src} alt={cover.alt} fill priority sizes="(min-width: 1180px) 760px, 100vw" />
              </figure>
            </Morph>
          )}
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
          <div className="reading-after">{after}</div>
        </div>
        {/* The rail sits beside the whole page from the top, so it fits the
          first screen and stays in view while reading. */}
        <PageRail toc={toc} target={interactions} />
      </div>
    </main>
  );
}
