import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { getContent, getTool, LINK_KINDS } from "@/lib/content";
import { related } from "@/lib/content-links";
import { CATEGORY_LABELS } from "@/lib/kb-labels";
import { renderMdx } from "@/lib/mdx";
import { breadcrumbJsonLd, pageMetadata, toolJsonLd } from "@/lib/seo";
import { JsonLd } from "@/components/JsonLd";
import { RelatedLinks } from "@/components/RelatedLinks";
import { SourceCredits } from "@/components/SourceCredits";
import { TagList } from "@/components/TagList";

export const dynamicParams = false;

export function generateStaticParams() {
  return getContent().tools.map((t) => ({ slug: t.slug }));
}

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const t = getTool((await params).slug);
  return t ? pageMetadata(t) : {};
}

const LINK_LABELS = { repo: "โค้ดต้นทาง", website: "เว็บไซต์", docs: "เอกสาร" } as const;

export default async function ToolPage({ params }: Props) {
  const t = getTool((await params).slug);
  if (!t) notFound();
  const content = getContent();
  const body = await renderMdx(t.body);
  return (
    <main id="main" className="reading">
      <JsonLd data={toolJsonLd(t)} />
      <JsonLd
        data={breadcrumbJsonLd([
          { name: "kubcode", path: "/" },
          { name: "เครื่องมือ", path: "/tools" },
          { name: t.title, path: `/tools/${t.slug}` },
        ])}
      />
      <Link className="back" href="/tools">
        กลับไปเครื่องมือ
      </Link>
      <article>
        <p className="eyebrow">{CATEGORY_LABELS[t.category]}</p>
        <h1>{t.title}</h1>
        <p className="lead">{t.description}</p>
        <TagList slugs={t.tags} tags={content.tags} />
        <dl className="tool-facts">
          <div>
            <dt>ไลเซนส์</dt>
            <dd>{t.license}</dd>
          </div>
          {LINK_KINDS.filter((k) => t.links[k]).map((k) => (
            <div key={k}>
              <dt>{LINK_LABELS[k]}</dt>
              <dd>
                <a href={t.links[k]} rel="noopener noreferrer" target="_blank">
                  {new URL(t.links[k]!).host}
                </a>
              </dd>
            </div>
          ))}
        </dl>
        <div className="prose">{body}</div>
        <RelatedLinks
          items={related(content, t)}
          headings={{
            article: "ใช้ในบทความ",
            skill: "ใช้กับ skill ของเรา",
            tool: "ใช้คู่กับ",
          }}
        />
        <SourceCredits page={t} />
      </article>
    </main>
  );
}
