import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getContent, getTool, LINK_KINDS } from "@/lib/content";
import { related } from "@/lib/content-links";
import { CATEGORY_LABELS } from "@/lib/kb-labels";
import { renderMdx } from "@/lib/mdx";
import { breadcrumbJsonLd, pageMetadata, toolJsonLd } from "@/lib/seo";
import { JsonLd } from "@/components/JsonLd";
import { ReadingPage } from "@/components/ReadingPage";
import { RelatedLinks } from "@/components/RelatedLinks";
import { SourceCredits } from "@/components/SourceCredits";
import { ToolLogo } from "@/components/ToolLogo";
import { PRICING_LABELS } from "@/lib/kb-labels";
import { stageHref } from "@/lib/tool-index";

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
  const { content: body, toc } = await renderMdx(t.body);
  const crumbs = [
    { name: "kubcode", href: "/" },
    { name: "เครื่องมือ", href: "/tools" },
    { name: CATEGORY_LABELS[t.category], href: stageHref(t.category) },
  ];
  return (
    <ReadingPage
      kind="tool"
      slug={t.slug}
      crumbs={crumbs}
      badge={CATEGORY_LABELS[t.category]}
      updated={t.updated}
      title={t.title}
      titleMark={<ToolLogo slug={t.slug} logo={t.logo} size="page" />}
      lead={t.description}
      tags={t.tags}
      allTags={content.tags}
      toc={toc}
      interactions={{ kind: "tool", slug: t.slug, title: t.name }}
      intro={
        <dl className="tool-facts">
          <div>
            <dt>ราคา</dt>
            <dd>{PRICING_LABELS[t.pricing]}</dd>
          </div>
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
      }
      after={
        <>
          <JsonLd data={toolJsonLd(t)} />
          <JsonLd data={breadcrumbJsonLd([...crumbs.map((c) => ({ name: c.name, path: c.href })), { name: t.title, path: `/tools/${t.slug}` }])} />
          <RelatedLinks
            items={related(content, t)}
            headings={{ article: "ใช้ในบทความ", skill: "ใช้กับ skill ของเรา", tool: "ใช้คู่กับ" }}
          />
          <SourceCredits page={t} />
        </>
      }
    >
      {body}
    </ReadingPage>
  );
}
