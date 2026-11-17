import Link from "next/link";
import { ChevronRight, CreditCard, MessageCircleReply, Radio, Send } from "lucide-react";
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
  // Owner 2026-11-16: these read as disabled. Now: full-ink title, readable
  // description, icon tile, a chevron, and a hover lift + border, so each
  // card reads as a link.
  return (
    <section aria-labelledby="shortcuts-h" className="grid gap-3">
      <h2 id="shortcuts-h" className="m-0 text-[20px] font-semibold">
        เครื่องมือของคุณ
      </h2>
      <ul className="m-0 grid list-none gap-3 p-0 sm:grid-cols-2">
        {items.map((it) => (
          <li key={it.title}>
            <Link
              href={it.href}
              className="group/sc flex min-h-full items-center gap-4 rounded-[18px] border border-input bg-card p-4 text-foreground no-underline shadow-[0_1px_0_rgb(255_255_255/0.03)_inset] transition-[border-color,translate,box-shadow] duration-200 hover:-translate-y-0.5 hover:border-ring hover:shadow-[0_14px_30px_-18px_rgb(124_58_237/0.7)] focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-solid focus-visible:outline-ring motion-reduce:transition-none motion-reduce:hover:translate-y-0"
            >
              <IconTile tone={it.tone} size={44}>
                <it.icon />
              </IconTile>
              <span className="min-w-0 flex-1">
                <strong className="block text-[16px] font-semibold text-foreground">{it.title}</strong>
                <span className="block text-[14px] leading-[1.55] text-foreground/75">{it.text}</span>
              </span>
              <ChevronRight aria-hidden="true" className="size-5 shrink-0 text-foreground/60 transition-transform duration-200 group-hover/sc:translate-x-0.5 group-hover/sc:text-link motion-reduce:transition-none" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
