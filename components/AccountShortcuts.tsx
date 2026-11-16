import Link from "next/link";
import { CreditCard, MessageCircleReply, Radio, Send } from "lucide-react";
import type { Capabilities } from "@/lib/account-nav/capabilities";
import { IconTile } from "@/components/site/PageHero";

/**
 * The paid product's doors on /account: channels and posting, comment
 * auto-replies, billing. Shown only to members who may use them.
 */
export function AccountShortcuts({ caps }: { caps: Capabilities }) {
  if (!caps.publishing && !caps.billing) return null;
  const items = [
    caps.publishing && { tone: "social" as const, href: "/account/posts/new", icon: Send, title: "สร้างโพสต์", text: "อัปโหลดคลิปครั้งเดียว แล้วโพสต์หรือตั้งเวลาลงหลายช่องพร้อมกัน" },
    caps.publishing && { tone: "social" as const, href: "/account/channels", icon: Radio, title: "ช่องที่เชื่อมไว้", text: "เชื่อมช่อง TikTok, Instagram, YouTube และดูสถานะการเชื่อมต่อ" },
    caps.publishing && { tone: "social" as const, href: "/account/channels", icon: MessageCircleReply, title: "ตอบคอมเมนต์อัตโนมัติ", text: "ตั้งคำที่คนคอมเมนต์ แล้วให้ระบบตอบกลับพร้อมลิงก์ให้ (Instagram, TikTok)" },
    caps.billing && { tone: "brand" as const, href: "/account/billing", icon: CreditCard, title: "การชำระเงิน", text: "ดูแพ็กเกจ วันหมดอายุ ต่ออายุ หรือเพิ่มช่อง" },
  ].filter(Boolean) as { tone: "social" | "brand"; href: string; icon: typeof Radio; title: string; text: string }[];
  return (
    <section aria-labelledby="shortcuts-h" className="my-7">
      <h2 id="shortcuts-h" className="mb-3 text-[22px] font-semibold">
        เครื่องมือของคุณ
      </h2>
      <ul className="m-0 grid list-none gap-3 p-0 sm:grid-cols-2 lg:grid-cols-4">
        {items.map((it) => (
          <li key={it.title}>
            <Link
              href={it.href}
              className="group/sc flex min-h-full flex-col gap-3 rounded-[22px] border border-input bg-card/90 p-5 no-underline transition-[border-color,translate] duration-200 hover:-translate-y-0.5 hover:border-ring focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-solid focus-visible:outline-ring motion-reduce:transition-none motion-reduce:hover:translate-y-0"
            >
              <IconTile tone={it.tone} size={44}>
                <it.icon />
              </IconTile>
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
