import { Library } from "@/components/Library";
import { getContent } from "@/lib/content";
export default function Home() {
  const articles = getContent().articles.map(({ slug, title, description }) => ({
    slug,
    title,
    description,
  }));
  return <Library articles={articles} />;
}
