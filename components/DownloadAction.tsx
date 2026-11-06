import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { DOWNLOAD_LIMIT } from "@/lib/downloads/limits";
import { approvedPackageFor } from "@/lib/packages";
import { CardDownloadAction } from "./CardDownloadAction";

/** The download box on a skill page: the action, then the package's facts. */
export function DownloadAction({ slug }: { slug: string }) {
  const pkg = approvedPackageFor(slug);
  return (
    <div className="download" id="download" tabIndex={-1}>
      <CardDownloadAction slug={slug} conditions={false} />
      {pkg ? (
        <>
          <dl className="download-facts">
            <div>
              <dt>เวอร์ชัน</dt>
              <dd>{pkg.version}</dd>
            </div>
            <div>
              <dt>ขนาดไฟล์</dt>
              <dd>ไม่เกิน {pkg.maxKb} KB</dd>
            </div>
            <div>
              <dt>สัญญาอนุญาต</dt>
              <dd>{pkg.licence}</dd>
            </div>
            <div>
              <dt>เครดิต</dt>
              <dd>{pkg.credit}</dd>
            </div>
          </dl>
          <p>
            มีคำสั่ง สคริปต์ และเอกสารอ้างอิง ไม่รวมคลิปตัวอย่าง ต้องคงไฟล์ LICENSE ไว้เมื่อแจกต่อ
          </p>
          <p>สมาชิกที่เข้าสู่ระบบดาวน์โหลดได้ฟรี วันละไม่เกิน {DOWNLOAD_LIMIT} ครั้งต่อบัญชี</p>
        </>
      ) : (
        <p>skill นี้ยังไม่มีชุดดาวน์โหลด</p>
      )}
      <Link href="/account">เข้าสู่ระบบหรือสมัครสมาชิก <ArrowUpRight size={15} /></Link>
    </div>
  );
}
