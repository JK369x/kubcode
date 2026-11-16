import { ThemeToggle } from "@/components/ThemeToggle";
import { AccountMenu } from "@/components/AccountMenu";
import { MobileNav } from "@/components/MobileNav";
import { MAIN_LINKS } from "@/lib/main-links";
import { SiteFooter } from "@/components/SiteFooter";
import { Toaster } from "@/components/ui/toaster";
import type { Metadata } from "next";
import Link from "next/link";
import "@fontsource/anuphan/400.css";
import "@fontsource/anuphan/500.css";
import "@fontsource/anuphan/600.css";
import "@fontsource/archivo/500.css";
import "@fontsource/archivo/600.css";
import "./globals.css";
import { CANONICAL_ORIGIN } from "@/lib/auth-policy";
export const metadata: Metadata = {
  metadataBase: new URL(CANONICAL_ORIGIN),
  title: "kubcode — คลังทักษะและงานทดลอง",
  description:
    "ดูคลิปจริงของแต่ละสไตล์ โหลดชุดคำสั่งฟรี แล้วทำคลิปแนวเดียวกันในคอมของคุณ พร้อมบทความและข้อมูลเครื่องมือ",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="th"
      data-theme="dark"
      data-scroll-behavior="smooth"
      suppressHydrationWarning
    >
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{document.documentElement.dataset.theme=localStorage.getItem('jk-theme')==='light'?'light':'dark'}catch(e){}",
          }}
        />
      </head>
      <body>
        <a className="skip" href="#main">
          ข้ามไปเนื้อหา
        </a>
        <header className="header" style={{ viewTransitionName: "site-header" }}>
          <Link className="brand" href="/">
            kubcode
          </Link>
          <nav aria-label="หลัก">
            {/* Desktop: inline links + theme. Phones (≤560px): hidden; the
                MobileNav sheet carries them (UX audit P1-1). */}
            <span className="header-links">
              <ThemeToggle />
              {MAIN_LINKS.map((l) => (
                <Link key={l.href} href={l.href}>
                  {l.label}
                </Link>
              ))}
            </span>
            <AccountMenu />
            <MobileNav />
          </nav>
        </header>
        {children}
        <SiteFooter />
        <Toaster position="top-center" theme="system" />
      </body>
    </html>
  );
}
