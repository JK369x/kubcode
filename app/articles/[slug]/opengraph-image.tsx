import { readFile } from "node:fs/promises";
import path from "node:path";
import { getArticle, getContent } from "@/lib/content";

// Every article has a validated 1200×630 cover crop: serve it as the social
// card, prerendered per article at build time.
export function generateStaticParams() {
  return getContent().articles.map((p) => ({ slug: p.slug }));
}

export const size = { width: 1200, height: 630 };
export const contentType = "image/jpeg";
export const alt = "ภาพปกบทความจาก kubcode";

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const a = getArticle((await params).slug)!;
  const data = await readFile(path.join(process.cwd(), "public", a.cover.og));
  return new Response(data, { headers: { "Content-Type": "image/jpeg" } });
}
