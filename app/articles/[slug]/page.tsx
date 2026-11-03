import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { getArticle, getContent } from "@/lib/content";
import { related } from "@/lib/content-links";
import { renderMdx } from "@/lib/mdx";
import { articleJsonLd, breadcrumbJsonLd, pageMetadata } from "@/lib/seo";
import { JsonLd } from "@/components/JsonLd";
import { RelatedLinks } from "@/components/RelatedLinks";
import { SourceCredits } from "@/components/SourceCredits";
import { TagList } from "@/components/TagList";

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
  const body = await renderMdx(a.body);
  return (
    <main id="main" className="reading">
      <JsonLd data={articleJsonLd(a)} />
      <JsonLd
        data={breadcrumbJsonLd([
          { name: "kubcode", path: "/" },
          { name: "บทความ", path: "/articles" },
          { name: a.title, path: `/articles/${a.slug}` },
        ])}
      />
      <Link className="back" href="/articles">
        กลับไปบทความ
      </Link>
      <article>
        <h1>{a.title}</h1>
        <p className="lead">{a.description}</p>
        <TagList slugs={a.tags} tags={content.tags} />
        <div className="prose">{body}</div>
        <RelatedLinks
          items={related(content, a)}
          headings={{
            tool: "เครื่องมือในบทความนี้",
            skill: "skill ของเราที่เกี่ยวข้อง",
            article: "อ่านต่อ",
          }}
        />
        <SourceCredits page={a} />
      </article>
    </main>
  );
}
