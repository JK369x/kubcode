import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getArticle, getContent } from "@/lib/content";
import { related } from "@/lib/content-links";
import { renderMdx } from "@/lib/mdx";
import { articleJsonLd, breadcrumbJsonLd, pageMetadata } from "@/lib/seo";
import { JsonLd } from "@/components/JsonLd";
import { ReadingPage } from "@/components/ReadingPage";
import { RelatedLinks } from "@/components/RelatedLinks";
import { SourceCredits } from "@/components/SourceCredits";

export const dynamicParams = false;

export function generateStaticParams() {
  return getContent().articles.map((a) => ({ slug: a.slug }));
}

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const a = getArticle((await params).slug);
  return a ? pageMetadata(a) : {};
}

export default async function Article({ params }: Props) {
  const a = getArticle((await params).slug);
  if (!a) notFound();
  const content = getContent();
  const { content: body, toc } = await renderMdx(a.body);
  const crumbs = [
    { name: "kubcode", href: "/" },
    { name: "บทความ", href: "/articles" },
  ];
  return (
    <ReadingPage
      kind="article"
      slug={a.slug}
      crumbs={crumbs}
      badge={content.categories.find((c) => c.key === a.category)?.th ?? "บทความ"}
      updated={a.updated}
      title={a.title}
      lead={a.description}
      tags={a.tags}
      allTags={content.tags}
      toc={toc}
      cover={a.cover}
      after={
        <>
          <JsonLd data={articleJsonLd(a)} />
          <JsonLd data={breadcrumbJsonLd([...crumbs.map((c) => ({ name: c.name, path: c.href })), { name: a.title, path: `/articles/${a.slug}` }])} />
          <RelatedLinks
            items={related(content, a)}
            headings={{ tool: "เครื่องมือในบทความนี้", skill: "skill ของเราที่เกี่ยวข้อง", article: "อ่านต่อ" }}
          />
          <SourceCredits page={a} />
        </>
      }
    >
      {body}
    </ReadingPage>
  );
}
