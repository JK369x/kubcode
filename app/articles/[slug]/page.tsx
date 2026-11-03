import { articles } from "@/lib/articles";
import { notFound } from "next/navigation";
import Link from "next/link";
export function generateStaticParams() {
  return articles.map((a) => ({ slug: a.slug }));
}
export default async function Article({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const a = articles.find((a) => a.slug === slug);
  if (!a) notFound();
  return (
    <main id="main" className="reading">
      <Link className="back" href="/articles">
        กลับไปบทความ
      </Link>
      <article>
        <h1>{a.title}</h1>
        <p className="lead">{a.summary}</p>
        {a.sections.map((s) => (
          <section key={s.heading}>
            <h2>{s.heading}</h2>
            <p>{s.body}</p>
          </section>
        ))}
        <p className="source-note">
          ที่มา: คู่มือ STRUCTURE.md และ shared voice README ของคลังส่วนตัว ·
          เรียบเรียงเพื่อใช้ในต้นแบบนี้ · ไม่มีการทดสอบ renderer
          ใหม่จากบทความนี้
        </p>
      </article>
    </main>
  );
}
