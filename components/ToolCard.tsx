import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { TOOL_CATEGORIES, type Tool } from "@/lib/content";
import { CATEGORY_LABELS, PRICING_LABELS } from "@/lib/kb-labels";
import { titleTransitionName } from "@/lib/view-transition-names";
import { Morph } from "./Morph";
import { ToolLogo } from "./ToolLogo";
import { ToolStars } from "./StarCounts";
import styles from "./ToolIndex.module.css";

/** "ใช้ใน 2 บทความ และ 1 skill", or null when nothing links to the tool. */
export function usageText({ articles, skills }: { articles: number; skills: number }): string | null {
  const parts = [articles && `${articles} บทความ`, skills && `${skills} skill`].filter(Boolean);
  return parts.length ? `ใช้ใน ${parts.join(" และ ")}` : null;
}

/**
 * One tool in the index. The name is the card's link (stretched over the
 * card); the maker's site is a separate, secondary link on top of it.
 */
export function ToolCard({ tool: t, usage }: { tool: Tool; usage: { articles: number; skills: number } }) {
  const external = t.links.website ?? t.links.repo;
  const used = usageText(usage);
  return (
    <article className={styles.card}>
      <div className={styles.top}>
        <ToolLogo slug={t.slug} logo={t.logo} size="card" />
        <div className={styles.heading}>
          <Morph name={titleTransitionName("tool", t.slug)}>
            <h2 className={styles.name}>
              <Link href={`/tools/${t.slug}`} transitionTypes={["nav-forward"]} className={styles.link}>
                {t.name}
              </Link>
            </h2>
          </Morph>
          <p className={styles.stage}>
            <span className={styles.step} aria-label={`ขั้นที่ ${TOOL_CATEGORIES.indexOf(t.category) + 1}`}>
              {TOOL_CATEGORIES.indexOf(t.category) + 1}
            </span>
            {CATEGORY_LABELS[t.category]}
          </p>
        </div>
      </div>
      <p className={styles.description}>{t.description}</p>
      <div className={styles.foot}>
        <div className={styles.facts}>
          <span className={`${styles.price} ${styles[`price-${t.pricing}`]}`}>{PRICING_LABELS[t.pricing]}</span>
          {used && <span>{used}</span>}
          <ToolStars slug={t.slug} className={styles.stars} />
        </div>
        {external && (
          <a
            className={styles.external}
            href={external}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`เปิด ${new URL(external).host} (แท็บใหม่)`}
          >
            {new URL(external).host.replace(/^www\./, "")}
            <ArrowUpRight size={14} aria-hidden />
          </a>
        )}
      </div>
    </article>
  );
}
