import type { Metadata } from "next";
import Link from "next/link";
import { cookies, headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { BillingBanner } from "@/components/BillingBanner";
import { BillingCheckout } from "@/components/BillingCheckout";
import { BadgeCheck, CalendarPlus, MessageSquareReply, Plug, Plus, Receipt, Send } from "lucide-react";
import { AccountShell, accountCaps } from "@/components/site/AccountShell";
import { IconTile } from "@/components/site/PageHero";
import { Badge } from "@/components/ui/badge";
import { canonicalHostRedirect, readAuthConfig, signInPath } from "@/lib/auth-policy";
import { MAX_SLOTS, PRICE_PER_CHANNEL_SATANG } from "@/lib/billing/config";
import { getBillingPage, purchaseNote, thaiDateTime } from "@/lib/billing/view";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "การชำระเงิน — kubcode", robots: { index: false, follow: false } };

const STANDING: Record<string, { label: string; variant: "ok" | "warn" | "neutral" }> = {
  active: { label: "ใช้งานอยู่", variant: "ok" },
  grace: { label: "หมดอายุ · ช่วงผ่อนผัน 3 วัน", variant: "warn" },
  lapsed: { label: "หมดอายุ · ช่องถูกพัก", variant: "warn" },
  none: { label: "ยังไม่มีแพ็กเกจ", variant: "neutral" },
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
  if (page.state === "signed-out") redirect(signInPath("/account/billing"));
  const caps = await accountCaps();
  return (
    <AccountShell caps={caps}
      section="billing"
      tone="social"
      eyebrow="kubcode Social"
      title="การชำระเงิน"
      lead="แพ็กเกจโซเชียล 289 ฿ ต่อช่อง ต่อเดือน จ่ายทีละเดือน ไม่ตัดเงินอัตโนมัติ"
    >
        {page.state === "unavailable" ? (
          <p className="setup-notice" role="status">
            ระบบชำระเงินใช้งานไม่ได้ชั่วคราว ลองใหม่ภายหลัง
          </p>
        ) : (
          <>
            <BillingBanner view={page.view} />
            <section aria-labelledby="pass-h" className="grid gap-3 rounded-[22px] border-2 border-transparent p-6 [background:linear-gradient(var(--card),var(--card))_padding-box,linear-gradient(100deg,#c8215a,#7c3aed_52%,#0f766e)_border-box]">
              <div className="flex items-center gap-3">
                <IconTile tone="social" size={40}>
                  <BadgeCheck />
                </IconTile>
                <h2 id="pass-h" className="m-0 text-[22px]">
                  แพ็กเกจของคุณ
                </h2>
              </div>
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
                <section aria-labelledby="buy-h" className="grid gap-3 rounded-[22px] border border-input bg-card/90 p-6">
                  <div className="flex items-center gap-3">
                    <IconTile tone="brand" size={40}>
                      <CalendarPlus />
                    </IconTile>
                    <h2 id="buy-h" className="m-0 text-[22px]">
                      {page.view.standing === "none" ? "ซื้อแพ็กเกจรายเดือน" : "ต่ออายุ 1 เดือน"}
                    </h2>
                  </div>
                  {page.view.standing === "active" && (
                    <p className="m-0 text-[15px] text-muted-foreground">ต่ออายุก่อนหมดได้ เดือนใหม่เริ่มต่อจากวันหมดอายุเดิม วันที่เหลือไม่หาย</p>
                  )}
                  {page.view.standing === "none" && (
                    // UX audit P1-6: say what happens after paying.
                    <p className="m-0 flex flex-wrap items-center gap-x-2 gap-y-1 text-[15px] text-muted-foreground">
                      จ่ายแล้วทำอะไรต่อ:
                      <span className="inline-flex items-center gap-1.5 text-foreground">
                        <Plug aria-hidden className="size-4 text-link" /> เชื่อมช่อง
                      </span>
                      →
                      <span className="inline-flex items-center gap-1.5 text-foreground">
                        <MessageSquareReply aria-hidden className="size-4 text-link" /> ตั้งคำตอบคอมเมนต์
                      </span>
                      →
                      <span className="inline-flex items-center gap-1.5 text-foreground">
                        <Send aria-hidden className="size-4 text-link" /> โพสต์
                      </span>
                    </p>
                  )}
                  <BillingCheckout
                    kind="new"
                    // Smart default (UX audit P1-6): the channels connected now, at least 1;
                    // a renewal also keeps the slots already paid for.
                    initial={Math.max(page.view.slots, page.view.activeChannels, 1)}
                    max={MAX_SLOTS}
                    pricePerChannel={PRICE_PER_CHANNEL_SATANG}
                    label={page.view.standing === "none" ? "ไปหน้าชำระเงิน" : "ต่ออายุ"}
                  />
                </section>
                {page.view.standing === "active" && (
                  <section aria-labelledby="add-h" className="grid gap-3 rounded-[22px] border border-input bg-card/90 p-6">
                    <div className="flex items-center gap-3">
                      <IconTile tone="brand" size={40}>
                        <Plus />
                      </IconTile>
                      <h2 id="add-h" className="m-0 text-[22px]">
                        เพิ่มช่องในเดือนนี้
                      </h2>
                    </div>
                    <BillingCheckout kind="add" initial={1} max={Math.max(1, MAX_SLOTS - page.view.slots)} pricePerChannel={PRICE_PER_CHANNEL_SATANG} label="ซื้อช่องเพิ่ม" />
                  </section>
                )}
              </>
            )}
            {page.view.purchases.length > 0 && (
              <section aria-labelledby="hist-h" className="grid gap-2 rounded-[22px] border border-input bg-card/90 p-6">
                <div className="flex items-center gap-3">
                  <IconTile tone="muted" size={40}>
                    <Receipt />
                  </IconTile>
                  <h2 id="hist-h" className="m-0 text-[22px]">
                    ประวัติการชำระ
                  </h2>
                </div>
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
        <p className="m-0 text-[15px] [&_a]:text-link [&_a]:underline [&_a]:underline-offset-(--link-offset)">
          <Link href="/refund">นโยบายการคืนเงินและการยกเลิก</Link> · <Link href="/account">กลับไปหน้าพื้นที่สมาชิก</Link>
        </p>
    </AccountShell>
  );
}
