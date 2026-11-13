import Link from "next/link";
import { SELLER } from "@/lib/seller";

const SITE_LINKS = [
  { href: "/", label: "คลังคลิป" },
  { href: "/articles", label: "บทความ" },
  { href: "/tools", label: "เครื่องมือ" },
  { href: "/community", label: "ชุมชน" },
  { href: "/roadmap", label: "แผนที่จะมา" },
] as const;

/** Stripe and card networks look for these on every page (ADR 0007). */
export const POLICY_LINKS = [
  { href: "/pricing", label: "ราคา" },
  { href: "/refund", label: "นโยบายคืนเงิน" },
  { href: "/contact", label: "ติดต่อเรา" },
  { href: "/terms", label: "ข้อกำหนด" },
  { href: "/privacy", label: "ความเป็นส่วนตัว" },
] as const;

/** Site footer: what kubcode is, who sells it, and the pages people look for at the bottom. */
export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="site-footer-about">
        <strong>kubcode</strong>
        <p>คลังวิธีทำคลิปสั้นภาษาไทย บอกเครดิตและสิทธิ์ของทุกคลิปที่แสดง</p>
        <p>ผู้ขาย: {SELLER.name} ({SELLER.kind})</p>
      </div>
      <nav aria-label="ลิงก์ท้ายเว็บ" className="site-footer-nav">
        <ul className="site-footer-links">
          {SITE_LINKS.map((l) => (
            <li key={l.href}>
              <Link href={l.href}>{l.label}</Link>
            </li>
          ))}
        </ul>
        <ul className="site-footer-links" aria-label="ราคาและนโยบาย">
          {POLICY_LINKS.map((l) => (
            <li key={l.href}>
              <Link href={l.href}>{l.label}</Link>
            </li>
          ))}
        </ul>
      </nav>
    </footer>
  );
}
