import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BillingSuccess } from "@/components/BillingSuccess";
import { readBillingConfig } from "@/lib/billing/config";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "ชำระเงิน — kubcode", robots: { index: false, follow: false } };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function BillingSuccessPage({ searchParams }: Props) {
  if (readBillingConfig(process.env).mode === "off") notFound();
  const sid = (await searchParams).session_id;
  const sessionId = typeof sid === "string" && /^cs_(test|live)_[A-Za-z0-9]{1,200}$/.test(sid) ? sid : null;
  return (
    <main id="main" className="reading">
      <h1>ขอบคุณที่ชำระเงิน</h1>
      {sessionId ? <BillingSuccess sessionId={sessionId} /> : <p className="lead">ไม่พบรายการชำระเงินในลิงก์นี้</p>}
    </main>
  );
}
