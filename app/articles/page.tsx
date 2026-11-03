import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { articles } from "@/lib/articles";
export default function Articles() {
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
            <p>{a.summary}</p>
          </div>
          <ArrowUpRight />
        </Link>
      ))}
      <p className="source-note">
        บทความเรียบเรียงใหม่จากคู่มือโครงสร้างคลังวิดีโอส่วนตัว
        ไม่ใช่การรับรองชุดเครื่องมือภายนอก
      </p>
    </main>
  );
}
