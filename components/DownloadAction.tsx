import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { CardDownloadAction } from "./CardDownloadAction";

export function DownloadAction({ slug }: { slug: string }) {
  return (
    <div className="download" id="download" tabIndex={-1}>
      <CardDownloadAction slug={slug} conditions={false} />
      <p>ต้นแบบนี้ยังไม่เชื่อมระบบสมาชิกและยังไม่มีชุดดาวน์โหลด</p>
      <Link href="/account">ดูขั้นตอนการเป็นสมาชิก <ArrowUpRight size={15} /></Link>
    </div>
  );
}
