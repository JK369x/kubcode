import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AccountShell } from "@/components/site/AccountShell";
import { Button } from "@/components/ui/button";
import { readBillingConfig } from "@/lib/billing/config";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "ยกเลิกการชำระเงิน — kubcode", robots: { index: false, follow: false } };

export default function BillingCancelPage() {
  if (readBillingConfig(process.env).mode === "off") notFound();
  return (
    <AccountShell
      eyebrow="การชำระเงิน"
      title="ยกเลิกการชำระเงินแล้ว"
      lead="ไม่มีการเรียกเก็บเงิน กลับไปเลือกจำนวนช่องแล้วลองใหม่ได้ทุกเมื่อ"
    >
      <p className="m-0">
        <Button asChild variant="outline" size="lg" className="rounded-full">
          <Link href="/account/billing">กลับไปหน้าการชำระเงิน</Link>
        </Button>
      </p>
    </AccountShell>
  );
}
