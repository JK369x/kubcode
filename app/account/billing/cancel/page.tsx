import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { readBillingConfig } from "@/lib/billing/config";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "ยกเลิกการชำระเงิน — kubcode", robots: { index: false, follow: false } };

export default function BillingCancelPage() {
  if (readBillingConfig(process.env).mode === "off") notFound();
  return (
    <main id="main" className="reading">
      <h1>ยกเลิกการชำระเงินแล้ว</h1>
      <p className="lead">ไม่มีการเรียกเก็บเงิน กลับไปเลือกจำนวนช่องแล้วลองใหม่ได้ทุกเมื่อ</p>
      <p>
        <Link href="/account/billing">กลับไปหน้าการชำระเงิน</Link>
      </p>
    </main>
  );
}
