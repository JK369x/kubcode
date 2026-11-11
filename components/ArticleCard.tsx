import Link from "next/link";
import { PlayCircle } from "lucide-react";
import type { Article, Tool } from "@/lib/content";
import { thaiDate } from "@/lib/dates";
import { coverTransitionName, titleTransitionName } from "@/lib/view-transition-names";
import { Morph } from "./Morph";
import { PageStars } from "./StarCounts";
import { ToolIconRow } from "./ToolIconRow";
import { SkeletonImage } from "./SkeletonImage";
import styles from "./ArticleIndex.module.css";

/**
 * One article in the index. The title is the card's link (stretched over the
 * card); the tool icons are their own links on top of it.
 */
export function ArticleCard({
  article: a,
  categoryLabel,
  tools,
  featured = false,
  priority = false,
}: {
  article: Article;
  categoryLabel: string;
  tools: Tool[];
  featured?: boolean;
  priority?: boolean;
}) {
  const Heading = featured ? "h2" : "h3";
  return (
    <article className={featured ? `${styles.card} ${styles.featured}` : styles.card}>
      <Morph name={coverTransitionName(a.slug)}>
        <div className={styles.cover}>
          {/* The title is the link text; the cover is decorative here. */}
          <SkeletonImage
            src={a.cover.src}
            alt=""
            fill
            preload={priority}
            fetchPriority={priority ? "high" : undefined}
            sizes={featured ? "(min-width: 900px) 640px, 100vw" : "(min-width: 1100px) 360px, (min-width: 700px) 50vw, 100vw"}
          />
        </div>
      </Morph>
      <div className={styles.text}>
        <span className={styles.badge}>{categoryLabel}</span>
        <Morph name={titleTransitionName("article", a.slug)}>
          <Heading className={styles.title}>
            <Link href={`/articles/${a.slug}`} transitionTypes={["nav-forward"]} className={styles.link}>
              {a.title}
            </Link>
          </Heading>
        </Morph>
        <p className={styles.lead}>{a.description}</p>
        <p className={styles.meta}>
          <time dateTime={a.updated}>{thaiDate(a.updated, "short")}</time>
          <span>อ่าน {a.readingMinutes} นาที</span>
          {a.video && (
            <span className={styles.clip}>
              <PlayCircle size={14} aria-hidden /> มีคลิป
            </span>
          )}
          <PageStars slug={a.slug} className={styles.stars} />
        </p>
        <ToolIconRow tools={tools} className={styles.tools} />
      </div>
    </article>
  );
}
