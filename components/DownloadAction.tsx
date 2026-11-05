import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { DOWNLOAD_LIMIT } from "@/lib/downloads/limits";
import { approvedPackageFor } from "@/lib/packages";
import { CardDownloadAction } from "./CardDownloadAction";

export function DownloadAction({ slug }: { slug: string }) {
  const pkg = approvedPackageFor(slug);
  return (
    <div className="download" id="download" tabIndex={-1}>
      <CardDownloadAction slug={slug} conditions={false} />
      {pkg ? (
        <>
          <p>
            ชุด skill เวอร์ชัน {pkg.version} (คำสั่ง สคริปต์ และเอกสารอ้างอิง ไม่รวมคลิปตัวอย่าง)
            สัญญาอนุญาต {pkg.licence} · เครดิต {pkg.credit} ต้องคงไฟล์ LICENSE ไว้เมื่อแจกต่อ
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
