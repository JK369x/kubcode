import Link from "next/link";
import { cookies } from "next/headers";
import type { ReactNode } from "react";
import { capabilitiesFromCookies, type Capabilities } from "@/lib/account-nav/capabilities";
import { SESSION_COOKIE_NAME } from "@/lib/auth-policy";
import { CreditCard, LayoutDashboard, Radio, Send, Settings2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { PageHero } from "./PageHero";
import styles from "./AccountShell.module.css";

/**
 * Account sub-pages (owner, 2026-11-15: every page in the pricing-A style):
 * the page hero, a section strip with the same doors and the same gating as
 * the header menu (#102: channels / posts need publishing, billing needs
 * billing on), and the content column. Each page keeps its own access checks.
 */
export type AccountSection = "overview" | "channels" | "posts" | "billing" | "settings";

const DOORS: readonly { id: AccountSection; href: string; label: string; icon: typeof Radio }[] = [
  { id: "overview", href: "/account", label: "บัญชี", icon: LayoutDashboard },
  { id: "channels", href: "/account/channels", label: "ช่องและการโพสต์", icon: Radio },
  { id: "posts", href: "/account/posts", label: "โพสต์ของฉัน", icon: Send },
  { id: "billing", href: "/account/billing", label: "การชำระเงิน", icon: CreditCard },
  { id: "settings", href: "/account/settings", label: "ตั้งค่าบัญชี", icon: Settings2 },
];

/** Capabilities for the section strip (same source as the header menu). */
export async function accountCaps(): Promise<Capabilities> {
  return capabilitiesFromCookies(process.env, (await cookies()).get(SESSION_COOKIE_NAME)?.value);
}

export function AccountShell({
  section,
  caps,
  eyebrow = "พื้นที่สมาชิก",
  title,
  accent,
  lead,
  tone = "brand",
  actions,
  wide = false,
  children,
}: {
  section?: AccountSection;
  /** From accountCaps(); without it the strip shows only บัญชี and ตั้งค่า. */
  caps?: Capabilities;
  eyebrow?: ReactNode;
  title: ReactNode;
  accent?: ReactNode;
  lead?: ReactNode;
  tone?: "brand" | "studio" | "social";
  /** Primary action beside the title (e.g. "สร้างโพสต์"). */
  actions?: ReactNode;
  /** Wider column for two-pane pages (composer). */
  wide?: boolean;
  children: ReactNode;
}) {
  const shown = DOORS.filter(
    (d) => d.id === "overview" || d.id === "settings" || (d.id === "billing" ? caps?.billing : caps?.publishing) || d.id === section,
  );
  return (
    <main id="main" className={cn(styles.page, wide && styles.wide)}>
      <div className={styles.head}>
        <PageHero eyebrow={eyebrow} title={title} accent={accent} lead={lead} tone={tone} />
        {actions && <div className={styles.actions}>{actions}</div>}
      </div>
      {section && shown.length > 1 && (
        <nav className={styles.strip} aria-label="พื้นที่สมาชิก">
          <ul>
            {shown.map((d) => (
              <li key={d.id}>
                <Link href={d.href} aria-current={d.id === section ? "page" : undefined}>
                  <d.icon aria-hidden="true" />
                  {d.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}
      <div className={styles.body}>{children}</div>
    </main>
  );
}

/** A content card in the account pages (same shape as the overview cards). */
export function AccountCard({
  title,
  icon,
  tone = "brand",
  children,
  id,
  className,
}: {
  title?: ReactNode;
  icon?: ReactNode;
  tone?: "brand" | "studio" | "social" | "muted";
  children: ReactNode;
  id?: string;
  className?: string;
}) {
  return (
    <section className={cn(styles.card, className)} aria-labelledby={title && id ? id : undefined}>
      {title && (
        <div className={styles.cardHead}>
          {icon && (
            <span className={styles.cardIcon} data-tone={tone} aria-hidden="true">
              {icon}
            </span>
          )}
          <h2 id={id} className={styles.cardTitle}>
            {title}
          </h2>
        </div>
      )}
      {children}
    </section>
  );
}
