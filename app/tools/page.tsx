import type { Metadata } from "next";
import { TitleTransition } from "@/components/TitleTransition";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { getContent, TOOL_CATEGORIES } from "@/lib/content";
import { CATEGORY_LABELS } from "@/lib/kb-labels";
import { breadcrumbJsonLd, metadataFor } from "@/lib/seo";
import { JsonLd } from "@/components/JsonLd";

export const metadata: Metadata = metadataFor({
  title: "เครื่องมือทำคลิปที่เราใช้จริง",
  description:
    "รวมเครื่องมือที่ใช้ทำคลิป ตั้งแต่เขียนบท เสียง เรนเดอร์ ไปจนถึงซับไตเติล พร้อมหมายเหตุไลเซนส์และลิงก์ต้นทาง",
  path: "/tools",
});

export default function Tools() {
  const { tools } = getContent();
  return (
    <main id="main" className="reading-index">
      <JsonLd
        data={breadcrumbJsonLd([
          { name: "kubcode", path: "/" },
          { name: "เครื่องมือ", path: "/tools" },
        ])}
      />
      <h1>เครื่องมือที่เราใช้</h1>
      <p className="lead">
        เรียงตามขั้นตอนทำคลิป อธิบายด้วยคำของเราเอง และลิงก์ไปต้นทางทุกตัว
      </p>
      {TOOL_CATEGORIES.filter((c) => tools.some((t) => t.category === c)).map((c) => (
        <section key={c} className="tool-group">
          <h2>{CATEGORY_LABELS[c]}</h2>
          {tools
            .filter((t) => t.category === c)
            .map((t) => (
              <Link className="article-row" key={t.slug} href={`/tools/${t.slug}`} transitionTypes={["nav-forward"]}>
                <div>
                  <TitleTransition kind="tool" slug={t.slug}>
                    <h3>{t.title}</h3>
                  </TitleTransition>
                  <p>{t.description}</p>
                </div>
                <ArrowUpRight />
              </Link>
            ))}
        </section>
      ))}
      {tools.length === 0 && <p>ยังไม่มีหน้าเครื่องมือ</p>}
    </main>
  );
}
