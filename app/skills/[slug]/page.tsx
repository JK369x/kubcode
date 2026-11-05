import { skills, PREVIEW_NOTICE } from "@/lib/catalog";
import { PUBLICATION_NOTICE } from "@/lib/publication";
import { statusLabel } from "@/lib/status-labels";
import { notFound } from "next/navigation";
import { Preview } from "@/components/Preview";
import { DownloadAction } from "@/components/DownloadAction";
import { approvedPackageFor } from "@/lib/packages";
import Link from "next/link";
import type { Metadata } from "next";
import { getContent } from "@/lib/content";
import { related } from "@/lib/content-links";
import { breadcrumbJsonLd, metadataFor } from "@/lib/seo";
import { JsonLd } from "@/components/JsonLd";
import { RelatedLinks } from "@/components/RelatedLinks";
import { PageRail } from "@/components/PageRail";
export function generateStaticParams() {
  return skills.map((s) => ({ slug: s.slug }));
}
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const s = skills.find((s) => s.slug === slug);
  if (!s) return {};
  return metadataFor({
    title: `${s.name} — skill ของ kubcode`,
    description: s.description,
    path: `/skills/${s.slug}`,
  });
}
export default async function Detail({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const s = skills.find((s) => s.slug === slug);
  if (!s) notFound();
  return (
    <main id="main" className="detail-page">
      <JsonLd
        data={breadcrumbJsonLd([
          { name: "kubcode", path: "/" },
          { name: s.name, path: `/skills/${s.slug}` },
        ])}
      />
      <Link className="back" href="/">
        กลับไปคลังทักษะ
      </Link>
      <div className="detail-with-rail">
        <div className="detail-main">
          <div className="detail-heading">
            <h1>{s.name}</h1>
            <p>
              v{s.version} · {statusLabel(s.status)}
            </p>
          </div>
          <div className="detail-grid">
            <Preview skill={s} />
            <div className="detail-copy">
              <p className="lead">{s.description}</p>
              <h2>ก่อนเริ่มใช้งาน</h2>
              <ul>
                {s.requirements.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
              <h2>วิธีใช้ในขอบเขตนี้</h2>
              <p>
                ดูตัวอย่างและอ่านข้อกำหนดก่อนเลือก pipeline จากนั้นอ่าน STYLE.md
                หรือคำแนะนำ shared workflow ในชุดต้นทาง อย่าคัดลอก renderer
                ข้ามชุดโดยไม่ตรวจ dependency และ source ที่คู่กัน
              </p>
              <p>
                {approvedPackageFor(s.slug)
                  ? "ชุดดาวน์โหลดด้านล่างคือ skill kit จากผู้สร้างต้นทาง เว็บนี้ยังไม่ได้ยืนยันการติดตั้งหรือ render จาก clean clone"
                  : "ต้นแบบเว็บนี้ไม่ได้แนบ source kit และไม่ได้ยืนยันการติดตั้งหรือ render จาก clean clone"}{" "}
                ใช้ metadata เพื่อช่วยเลือก ไม่ใช่คำสั่งผลิตงานที่ผ่านการรับรอง
              </p>
              <h2>สถานะและสิทธิ์</h2>
              <p>{s.approvalScope}</p>
              <p>{PUBLICATION_NOTICE}</p>
              <small className="rights-code">{PREVIEW_NOTICE}</small>
              <DownloadAction slug={s.slug} />
              <Link href="/articles/install-with-permissions">
                อ่านรายการตรวจสอบก่อนติดตั้ง
              </Link>
              <RelatedLinks
                items={related(getContent(), { kind: "skill", slug: s.slug })}
                headings={{ tool: "เครื่องมือที่ใช้", article: "ใช้ในบทความ" }}
              />
            </div>
          </div>
        </div>
        <PageRail
          toc={[]}
          target={{ kind: "skill", slug: s.slug, title: s.name }}
        />
      </div>
    </main>
  );
}
