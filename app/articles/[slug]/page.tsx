import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { getArticle, getContent } from "@/lib/content";
import { renderMdx } from "@/lib/mdx";

export const dynamicParams = false;

export function generateStaticParams() {
  return getContent().articles.map((a) => ({ slug: a.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const a = getArticle((await params).slug);
  if (!a) return {};
  return { title: a.title, description: a.description };
}

export default async function Article({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const a = getArticle((await params).slug);
  if (!a) notFound();
  const body = await renderMdx(a.body);
  return (
    <main id="main" className="reading">
      <Link className="back" href="/articles">
        กลับไปบทความ
      </Link>
      <article>
        <h1>{a.title}</h1>
        <p className="lead">{a.description}</p>
        <div className="prose">{body}</div>
        <footer className="source-note">
          {a.sources.length > 0 && (
            <>
              ที่มา:{" "}
              {a.sources.map((s, i) => (
                <span key={s.title}>
                  {i > 0 && " · "}
                  {s.url ? (
                    <a href={s.url} rel="noopener noreferrer" target="_blank">
                      {s.title}
                    </a>
                  ) : (
                    s.title
                  )}
                </span>
              ))}
            </>
          )}
          {a.sourceNote && <> · {a.sourceNote}</>}
          <br />
          อัปเดต <time dateTime={a.updated}>{a.updated}</time>
        </footer>
      </article>
    </main>
  );
}
