import type { Metadata } from "next";
import Link from "next/link";
import { cookies, headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { BillingBanner } from "@/components/BillingBanner";
import { BillingCheckout } from "@/components/BillingCheckout";
import { Badge } from "@/components/ui/badge";
import { canonicalHostRedirect, readAuthConfig } from "@/lib/auth-policy";
import { MAX_SLOTS, PRICE_PER_CHANNEL_SATANG } from "@/lib/billing/config";
import { getBillingPage, purchaseNote, thaiDateTime } from "@/lib/billing/view";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "การชำระเงิน — kubcode", robots: { index: false, follow: false } };

const STANDING: Record<string, { label: string; variant: "ok" | "warn" | "secondary" }> = {
  active: { label: "ใช้งานอยู่", variant: "ok" },
  grace: { label: "หมดอายุ · ช่วงผ่อนผัน 3 วัน", variant: "warn" },
  lapsed: { label: "หมดอายุ · ช่องถูกพัก", variant: "warn" },
  none: { label: "ยังไม่มีแพ็กเกจ", variant: "secondary" },
  exempt: { label: "บัญชีเจ้าของเว็บ (ไม่ต้องชำระ)", variant: "ok" },
};

export default async function BillingPage() {
  const env = process.env;
  const page = await getBillingPage(env, async () => {
    if (readAuthConfig(env).ok) {
      const to = canonicalHostRedirect(await headers());
      if (to) redirect(to);
    }
    return cookies();
  });
  if (page.state === "off") notFound();
  if (page.state === "signed-out") redirect("/account");
  return (
    <main id="main" className="account-page">
      <div>
        <h1>การชำระเงิน</h1>
        <p className="lead">แพ็กเกจโซเชียล 289 ฿ ต่อช่อง ต่อเดือน จ่ายทีละเดือน ไม่ตัดเงินอัตโนมัติ</p>
        {page.state === "unavailable" ? (
          <p className="setup-notice" role="status">
            ระบบชำระเงินใช้งานไม่ได้ชั่วคราว ลองใหม่ภายหลัง
          </p>
        ) : (
          <>
            <BillingBanner view={page.view} />
            <section aria-labelledby="pass-h" className="mt-6 grid gap-3 rounded-2xl border border-input bg-card p-5">
              <h2 id="pass-h" className="m-0 text-[22px]">
                แพ็กเกจของคุณ
              </h2>
              <p className="m-0">
                <Badge variant={STANDING[page.view.standing].variant}>{STANDING[page.view.standing].label}</Badge>
              </p>
              {page.view.standing !== "exempt" && (
                <dl className="m-0 grid grid-cols-[max-content_1fr] gap-x-6 gap-y-1 text-[15px]">
                  <dt className="text-muted-foreground">ช่องที่จ่ายแล้ว</dt>
                  <dd className="m-0">{page.view.slots} ช่อง</dd>
                  <dt className="text-muted-foreground">ช่องที่เชื่อมอยู่</dt>
                  <dd className="m-0">
                    {page.view.activeChannels} ช่อง{page.view.pausedChannels ? ` (พักไว้ ${page.view.pausedChannels})` : ""}
                  </dd>
                  <dt className="text-muted-foreground">ใช้ได้ถึง</dt>
                  <dd className="m-0">{page.view.paidUntil ? thaiDateTime(page.view.paidUntil) : "—"}</dd>
                </dl>
              )}
            </section>
            {page.view.standing !== "exempt" && (
              <>
                <section aria-labelledby="buy-h" className="mt-6 grid gap-3 rounded-2xl border border-input bg-card p-5">
                  <h2 id="buy-h" className="m-0 text-[22px]">
                    {page.view.standing === "none" ? "ซื้อแพ็กเกจรายเดือน" : "ต่ออายุ 1 เดือน"}
                  </h2>
                  {page.view.standing === "active" && (
                    <p className="m-0 text-[15px] text-muted-foreground">ต่ออายุก่อนหมดได้ เดือนใหม่เริ่มต่อจากวันหมดอายุเดิม วันที่เหลือไม่หาย</p>
                  )}
                  <BillingCheckout
                    kind="new"
                    initial={Math.max(page.view.slots, page.view.activeChannels, 1)}
                    max={MAX_SLOTS}
                    pricePerChannel={PRICE_PER_CHANNEL_SATANG}
                    label={page.view.standing === "none" ? "ไปหน้าชำระเงิน" : "ต่ออายุ"}
                  />
                </section>
                {page.view.standing === "active" && (
                  <section aria-labelledby="add-h" className="mt-6 grid gap-3 rounded-2xl border border-input bg-card p-5">
                    <h2 id="add-h" className="m-0 text-[22px]">
                      เพิ่มช่องในเดือนนี้
                    </h2>
                    <BillingCheckout kind="add" initial={1} max={Math.max(1, MAX_SLOTS - page.view.slots)} pricePerChannel={PRICE_PER_CHANNEL_SATANG} label="ซื้อช่องเพิ่ม" />
                  </section>
                )}
              </>
            )}
            {page.view.purchases.length > 0 && (
              <section aria-labelledby="hist-h" className="mt-6">
                <h2 id="hist-h" className="text-[22px]">
                  ประวัติการชำระ
                </h2>
                <ul className="m-0 grid list-none gap-2 p-0 text-[15px]">
                  {page.view.purchases.map((p, i) => {
                    const note = purchaseNote(p);
                    return (
                      <li key={i} className="flex flex-wrap justify-between gap-2 border-b border-border py-2">
                        <span className={p.revoked ? "text-muted-foreground line-through decoration-1" : undefined}>
                          {p.kind === "add" ? `เพิ่ม ${p.slots} ช่อง` : `${p.slots} ช่อง 1 เดือน`} · {(p.amountSatang / 100).toLocaleString("en-US")} ฿
                          {p.method ? ` · ${p.method === "promptpay" ? "พร้อมเพย์" : "บัตร"}` : ""}
                        </span>
                        <span className="text-muted-foreground">{p.paidAt ? thaiDateTime(p.paidAt) : ""}</span>
                        {note && (
                          <span className={`basis-full text-[14px] ${note.tone === "warn" ? "text-[#92400e] dark:text-[#fcd34d]" : "text-muted-foreground"}`}>{note.text}</span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}
          </>
        )}
        <p className="mt-6">
          <Link href="/refund">นโยบายการคืนเงินและการยกเลิก</Link> · <Link href="/account">กลับไปหน้าพื้นที่สมาชิก</Link>
        </p>
      </div>
    </main>
  );
}
