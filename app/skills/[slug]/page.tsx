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
import { SkillClipGrid, SkillCover } from "@/components/SkillClips";
import { showcaseForSkill } from "@/lib/showcase";
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
  // Approved clips made with this skill, if any style names it.
  const showcase = showcaseForSkill(s.slug);
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
            {showcase ? (
              <div className="detail-media">
                <SkillCover showcase={showcase} />
                <SkillClipGrid showcase={showcase} />
              </div>
            ) : (
              <Preview skill={s} />
            )}
            <div className="detail-copy">
              <p className="lead">{showcase?.detail ?? s.description}</p>
              <h2>สิ่งที่ต้องมี</h2>
              <ul>
                {s.requirements.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
              <h2>ใช้ยังไง</h2>
              <ol className="steps">
                <li>ดูคลิปตัวอย่าง แล้วเช็คว่าเป็นแนวที่อยากทำ</li>
                <li>เตรียมเครื่องมือตามรายการ “สิ่งที่ต้องมี” ด้านบน</li>
                <li>
                  {approvedPackageFor(s.slug)
                    ? "ดาวน์โหลดชุด skill (ต้องเข้าสู่ระบบ) แล้วสั่ง AI agent ของคุณเป็นภาษาไทยได้เลย"
                    : "skill นี้ยังไม่มีชุดให้ดาวน์โหลด ระหว่างนี้ใช้คลิปและรายการด้านบนเป็นแนวทาง"}
                </li>
              </ol>
              <DownloadAction slug={s.slug} />
              <Link href="/articles/install-with-permissions">
                อ่านรายการตรวจสอบก่อนติดตั้ง
              </Link>
              <RelatedLinks
                items={related(getContent(), { kind: "skill", slug: s.slug })}
                headings={{ tool: "เครื่องมือที่ใช้", article: "ใช้ในบทความ" }}
              />
              <details className="rights-details">
                <summary>สถานะและสิทธิ์</summary>
                <p>{s.approvalScope}</p>
                <p>
                  ดูตัวอย่างและอ่านข้อกำหนดก่อนเลือก pipeline จากนั้นอ่าน STYLE.md
                  หรือคำแนะนำ shared workflow ในชุดต้นทาง อย่าคัดลอก renderer
                  ข้ามชุดโดยไม่ตรวจ dependency และ source ที่คู่กัน
                </p>
                <p>
                  {approvedPackageFor(s.slug)
                    ? "ชุดดาวน์โหลดคือ source kit จากผู้สร้างต้นทางตามสัญญาอนุญาตที่ระบุ เว็บนี้ยังไม่ได้ยืนยันการติดตั้งหรือ render จาก clean clone"
                    : "ต้นแบบเว็บนี้ไม่ได้แนบ source kit และไม่ได้ยืนยันการติดตั้งหรือ render จาก clean clone"}{" "}
                  ใช้ metadata เพื่อช่วยเลือก ไม่ใช่คำสั่งผลิตงานที่ผ่านการรับรอง
                </p>
                <p>
                  {PUBLICATION_NOTICE}
                  {approvedPackageFor(s.slug) ? "" : " · ยังไม่มีชุดดาวน์โหลด"}
                </p>
                <small className="rights-code">{PREVIEW_NOTICE}</small>
              </details>
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
