import Link from "next/link";
import { CreditCard, MessageCircleReply, Radio } from "lucide-react";
import type { Capabilities } from "@/lib/account-nav/capabilities";

/**
 * The paid product's doors on /account: channels and posting, comment
 * auto-replies, billing. Shown only to members who may use them.
 */
export function AccountShortcuts({ caps }: { caps: Capabilities }) {
  if (!caps.publishing && !caps.billing) return null;
  const items = [
    caps.publishing && { href: "/account/channels", icon: Radio, title: "ช่องและการโพสต์", text: "เชื่อมช่อง TikTok, Instagram, YouTube แล้วโพสต์หรือตั้งเวลาคลิปเดียวลงหลายช่อง" },
    caps.publishing && { href: "/account/channels", icon: MessageCircleReply, title: "ตอบคอมเมนต์อัตโนมัติ", text: "ตั้งคำที่คนคอมเมนต์ แล้วให้ระบบตอบกลับพร้อมลิงก์ให้ (Instagram, TikTok)" },
    caps.billing && { href: "/account/billing", icon: CreditCard, title: "การชำระเงิน", text: "ดูแพ็กเกจ วันหมดอายุ ต่ออายุ หรือเพิ่มช่อง" },
  ].filter(Boolean) as { href: string; icon: typeof Radio; title: string; text: string }[];
  return (
    <section aria-labelledby="shortcuts-h" className="my-6">
      <h2 id="shortcuts-h" className="mb-3 text-[22px]">
        เครื่องมือของคุณ
      </h2>
      <ul className="m-0 grid list-none gap-3 p-0 sm:grid-cols-2">
        {items.map((it) => (
          <li key={it.title}>
            <Link
              href={it.href}
              className="flex min-h-full gap-3 rounded-2xl border border-input bg-card p-4 no-underline transition-colors hover:border-primary focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              <it.icon aria-hidden className="mt-1 size-5 shrink-0 text-primary" />
              <span>
                <strong className="block text-[17px] text-foreground">{it.title}</strong>
                <span className="text-[15px] leading-[1.6] text-muted-foreground">{it.text}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
