import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArticleIndex } from "@/components/ArticleIndex";
import { categoryHref } from "@/lib/article-index";
import { getContent } from "@/lib/content";
import { breadcrumbJsonLd, categoryIsIndexable, metadataFor } from "@/lib/seo";
import { JsonLd } from "@/components/JsonLd";

export const dynamicParams = false;

/** One page per non-empty category; empty categories 404. */
export function generateStaticParams() {
  const { categories, articles } = getContent();
  return categories.filter((c) => articles.some((a) => a.category === c.key)).map((c) => ({ category: c.key }));
}

type Props = { params: Promise<{ category: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { category } = await params;
  const content = getContent();
  const c = content.categories.find((x) => x.key === category);
  if (!c) return {};
  return metadataFor({
    title: `${c.th} — บทความ kubcode`,
    description: c.description,
    path: categoryHref(c.key),
    noindex: !categoryIsIndexable(content, c.key),
  });
}

export default async function CategoryPage({ params }: Props) {
  const { category } = await params;
  const content = getContent();
  const c = content.categories.find((x) => x.key === category);
  if (!c) notFound();
  return (
    <>
      <JsonLd
        data={breadcrumbJsonLd([
          { name: "kubcode", path: "/" },
          { name: "บทความ", path: "/articles" },
          { name: c.th, path: categoryHref(c.key) },
        ])}
      />
      <ArticleIndex content={content} category={category} />
    </>
  );
}
