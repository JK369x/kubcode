import { jsonLdText } from "@/lib/seo";

/** Structured data for search engines; text is escaped against </script>. */
export function JsonLd({ data }: { data: unknown }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: jsonLdText(data) }}
    />
  );
}
