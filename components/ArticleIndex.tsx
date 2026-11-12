import Link from "next/link";
import type { Content } from "@/lib/content";
import { articleIndex } from "@/lib/article-index";
import { articleTools } from "@/lib/tool-index";
import { ArticleCard } from "./ArticleCard";
import { LatestComments } from "./Community";
import { StarCountsProvider } from "./StarCounts";
import styles from "./ArticleIndex.module.css";
import { chipVariants } from "@/components/ui/toggle-variants";
import { Badge } from "@/components/ui/badge";

/** /articles and /articles/c/<key>: hero article, category filter, card grid. */
export function ArticleIndex({ content, category }: { content: Content; category?: string }) {
  const { featured, rest, chips } = articleIndex(content, category);
  const label = (key: string) => content.categories.find((c) => c.key === key)?.th ?? key;
  const current = category ? content.categories.find((c) => c.key === category) : undefined;
  return (
    <main id="main" className={styles.page}>
      <header className={styles.head}>
        <h1>{current ? current.th : "อ่านก่อนลงมือ"}</h1>
        <p className="lead">
          {current ? current.description : "บันทึกวิธีคิดจากงานจริง แยกเครื่องมือ ข้อกำหนด และสิทธิ์ให้ชัด"}
        </p>
      </header>
      <nav aria-label="หมวดบทความ" className={styles.chips}>
        <ul>
          {chips.map((c) => (
            <li key={c.href}>
              <Link href={c.href} aria-current={c.active ? "page" : undefined} className={chipVariants({ className: "text-sm" })}>
                {c.label}
                <Badge variant="secondary" className={styles.count}>{c.count}</Badge>
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <StarCountsProvider kind="article">
      {featured && <ArticleCard article={featured} categoryLabel={label(featured.category)} tools={articleTools(content, featured)} featured priority />}
      {rest.length > 0 && (
        <section aria-label="บทความอื่น" className={styles.grid}>
          {rest.map((a) => (
            <ArticleCard key={a.slug} article={a} categoryLabel={label(a.category)} tools={articleTools(content, a)} />
          ))}
        </section>
      )}
      </StarCountsProvider>
      {!category && <LatestComments />}
      <p className="source-note">เขียนด้วยคำของเราเอง และให้เครดิตต้นทางท้ายทุกบทความ ไม่ใช่การรับรองชุดเครื่องมือภายนอก</p>
    </main>
  );
}
