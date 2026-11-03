import { CATEGORY_LABELS } from "@/lib/kb-labels";
import { OG_SIZE, ogImage } from "@/lib/og";
import { getContent, getTool } from "@/lib/content";

// Prerender one card per page at build time (no runtime font/content reads).
export function generateStaticParams() {
  return getContent().tools.map((p) => ({ slug: p.slug }));
}

export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "เครื่องมือที่ kubcode ใช้";

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const t = getTool((await params).slug)!;
  return ogImage({
    eyebrow: `เครื่องมือ · ${CATEGORY_LABELS[t.category]}`,
    title: t.title,
    description: t.description,
  });
}
