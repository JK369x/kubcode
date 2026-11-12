import Link from "next/link";
import type { Content, ToolCategory } from "@/lib/content";
import { CATEGORY_LABELS } from "@/lib/kb-labels";
import { toolIndex, toolUsage } from "@/lib/tool-index";
import { StarCountsProvider } from "./StarCounts";
import { ToolCard } from "./ToolCard";
import styles from "./ToolIndex.module.css";
import { chipVariants } from "@/components/ui/toggle-variants";

/** /tools and /tools/c/<stage>: production-line filter and a card grid. */
export function ToolIndex({ content, stage }: { content: Content; stage?: ToolCategory }) {
  const { tools, chips } = toolIndex(content, stage);
  return (
    <main id="main" className={styles.page}>
      <header className={styles.head}>
        <h1>{stage ? CATEGORY_LABELS[stage] : "เครื่องมือที่เราใช้ทำคลิป"}</h1>
        <p className="lead">
          {stage
            ? `เครื่องมือขั้น${CATEGORY_LABELS[stage]}ที่เราใช้จริง พร้อมเงื่อนไขการใช้และลิงก์ต้นทาง`
            : "เรียงตามขั้นตอนทำคลิป ตั้งแต่เขียนบทจนรวมไฟล์ แต่ละตัวมีหมายเหตุไลเซนส์และลิงก์ไปต้นทาง"}
        </p>
      </header>
      <nav aria-label="ขั้นตอนทำคลิป" className={styles.line}>
        <ol>
          {chips.map((c) => (
            <li key={c.href}>
              <Link href={c.href} aria-current={c.active ? "page" : undefined} className={chipVariants({ className: "pr-3.5 pl-2 text-sm" })}>
                {c.step !== null && (
                  <span className={styles.step} aria-hidden="true">
                    {c.step}
                  </span>
                )}
                {c.label}
                <span className={styles.count}>{c.count}</span>
              </Link>
            </li>
          ))}
        </ol>
      </nav>
      <StarCountsProvider>
        <section aria-label="รายการเครื่องมือ" className={styles.grid}>
          {tools.map((t) => (
            <ToolCard key={t.slug} tool={t} usage={toolUsage(content, t)} />
          ))}
        </section>
      </StarCountsProvider>
      <p className="source-note">
        โลโก้เป็นของเจ้าของผลิตภัณฑ์แต่ละราย ใช้เพื่อบอกว่าหมายถึงผลิตภัณฑ์ใดเท่านั้น ไม่ได้แปลว่าเจ้าของรับรองเว็บนี้
      </p>
    </main>
  );
}
