import { Library } from "@/components/Library";
import { getContent } from "@/lib/content";
import { styleToolsFrom } from "@/lib/showcase";
export default function Home() {
  const content = getContent();
  const articles = content.articles.map(({ slug, title, description }) => ({
    slug,
    title,
    description,
  }));
  return <Library articles={articles} styleTools={styleToolsFrom(content.tools)} />;
}
