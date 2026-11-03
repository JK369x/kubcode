import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { getContent } from "@/lib/content";
export default function Articles() {
  const { articles } = getContent();
  return (
    <main id="main" className="reading-index">
      <h1>อ่านก่อนลงมือ</h1>
      <p className="lead">
        บันทึกวิธีคิดจากงานจริง แยกเครื่องมือ ข้อกำหนด และสิทธิ์ให้ชัด
      </p>
      {articles.map((a) => (
        <Link className="article-row" key={a.slug} href={"/articles/" + a.slug}>
          <div>
            <h2>{a.title}</h2>
            <p>{a.description}</p>
          </div>
          <ArrowUpRight />
        </Link>
      ))}
      <p className="source-note">
        เขียนด้วยคำของเราเอง และให้เครดิตต้นทางท้ายทุกบทความ
        ไม่ใช่การรับรองชุดเครื่องมือภายนอก
      </p>
    </main>
  );
}
