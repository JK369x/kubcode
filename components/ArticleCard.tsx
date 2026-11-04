import Image from "next/image";
import Link from "next/link";
import { PlayCircle } from "lucide-react";
import type { Article } from "@/lib/content";
import { thaiDate } from "@/lib/dates";
import { coverTransitionName, titleTransitionName } from "@/lib/view-transition-names";
import { Morph } from "./Morph";
import styles from "./ArticleIndex.module.css";

/** One article in the index: the whole card is a single link. */
export function ArticleCard({
  article: a,
  categoryLabel,
  featured = false,
  priority = false,
}: {
  article: Article;
  categoryLabel: string;
  featured?: boolean;
  priority?: boolean;
}) {
  const Heading = featured ? "h2" : "h3";
  return (
    <Link
      href={`/articles/${a.slug}`}
      transitionTypes={["nav-forward"]}
      className={featured ? `${styles.card} ${styles.featured}` : styles.card}
    >
      <Morph name={coverTransitionName(a.slug)}>
        <div className={styles.cover}>
          {/* The title is the link text; the cover is decorative here. */}
          <Image
            src={a.cover.src}
            alt=""
            fill
            priority={priority}
            sizes={featured ? "(min-width: 900px) 640px, 100vw" : "(min-width: 1100px) 360px, (min-width: 700px) 50vw, 100vw"}
          />
        </div>
      </Morph>
      <div className={styles.text}>
        <span className={styles.badge}>{categoryLabel}</span>
        <Morph name={titleTransitionName("article", a.slug)}>
          <Heading className={styles.title}>{a.title}</Heading>
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
        </p>
      </div>
    </Link>
  );
}
