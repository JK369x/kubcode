import { OG_SIZE, ogImage } from "@/lib/og";
import { getContent, getArticle } from "@/lib/content";

// Prerender one card per page at build time (no runtime font/content reads).
export function generateStaticParams() {
  return getContent().articles.map((p) => ({ slug: p.slug }));
}

export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "บทความจาก kubcode";

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const a = getArticle((await params).slug)!;
  return ogImage({ eyebrow: "บทความ", title: a.title, description: a.description });
}
