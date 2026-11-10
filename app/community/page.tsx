import type { Metadata } from "next";
import { CommunityFeed, JoinPrompt, PopularLists, type PopularPage } from "@/components/Community";
import styles from "@/components/Community.module.css";
import { JsonLd } from "@/components/JsonLd";
import { rawSkills } from "@/lib/catalog";
import { getContent } from "@/lib/content";
import { hrefOf } from "@/lib/content-links";
import { breadcrumbJsonLd, metadataFor } from "@/lib/seo";

export const metadata: Metadata = metadataFor({
  title: "ชุมชน — คุยเรื่องทำคลิปด้วย AI",
  description: "คอมเมนต์ล่าสุดจากสมาชิก และบทความ skill เครื่องมือที่ได้ดาวมากที่สุด",
  path: "/community",
});

function popular(): Array<{ kind: PopularPage["kind"]; label: string; pages: PopularPage[] }> {
  const { articles, tools } = getContent();
  return [
    { kind: "article", label: "บทความ", pages: articles.map((a) => ({ kind: "article", slug: a.slug, title: a.title, href: hrefOf({ kind: "article", slug: a.slug }) })) },
    { kind: "skill", label: "skill", pages: rawSkills.map((s) => ({ kind: "skill", slug: s.slug, title: s.name, href: hrefOf({ kind: "skill", slug: s.slug }) })) },
    { kind: "tool", label: "เครื่องมือ", pages: tools.map((t) => ({ kind: "tool", slug: t.slug, title: t.name, href: hrefOf({ kind: "tool", slug: t.slug }) })) },
  ];
}

export default function Community() {
  const groups = popular();
  return (
    <main id="main" className={styles.page}>
      <JsonLd
        data={breadcrumbJsonLd([
          { name: "kubcode", path: "/" },
          { name: "ชุมชน", path: "/community" },
        ])}
      />
      <header className={styles.head}>
        <h1>ชุมชน kubcode</h1>
        <p className="lead">ดูว่าคนอื่นคุยอะไรกันอยู่ ถามต่อ ตอบกัน หรือให้ดาวหน้าที่ช่วยคุณได้จริง</p>
      </header>
      <JoinPrompt />
      <PopularLists groups={groups} />
      <CommunityFeed />
    </main>
  );
}
