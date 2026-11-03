import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { getContent } from "@/lib/content";
import { pagesForTag } from "@/lib/content-links";
import { breadcrumbJsonLd, metadataFor, tagHref, tagIsIndexable } from "@/lib/seo";
import { JsonLd } from "@/components/JsonLd";

export const dynamicParams = false;

export function generateStaticParams() {
  return getContent().tags.map((t) => ({ tag: t.slug }));
}

type Props = { params: Promise<{ tag: string }> };

function findTag(slug: string) {
  return getContent().tags.find((t) => t.slug === slug);
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const tag = findTag((await params).tag);
  if (!tag) return {};
  return metadataFor({
    title: `${tag.th} (${tag.en})`,
    description: tag.description,
    path: tagHref(tag.slug),
    noindex: !tagIsIndexable(getContent(), tag.slug),
  });
}

export default async function TagPage({ params }: Props) {
  const tag = findTag((await params).tag);
  if (!tag) notFound();
  const items = pagesForTag(getContent(), tag.slug);
  return (
    <main id="main" className="reading-index">
      <JsonLd
        data={breadcrumbJsonLd([
          { name: "kubcode", path: "/" },
          { name: `#${tag.th}`, path: tagHref(tag.slug) },
        ])}
      />
      <p className="eyebrow">แท็ก · {tag.en}</p>
      <h1>#{tag.th}</h1>
      <p className="lead">{tag.description}</p>
      {items.map((i) => (
        <Link className="article-row" key={i.href} href={i.href}>
          <div>
            <h2>{i.title}</h2>
            <p>{i.description}</p>
          </div>
          <ArrowUpRight />
        </Link>
      ))}
    </main>
  );
}
