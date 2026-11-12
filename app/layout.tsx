import { ThemeToggle } from "@/components/ThemeToggle";
import { AccountMenu } from "@/components/AccountMenu";
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
            <ThemeToggle />
            <Link href="/">คลังทักษะ</Link>
            <Link href="/articles">บทความ</Link>
            <Link href="/tools">เครื่องมือ</Link>
            <Link href="/community">ชุมชน</Link>
            <AccountMenu />
          </nav>
        </header>
        {children}
        <SiteFooter />
        <Toaster position="top-center" theme="system" />
      </body>
    </html>
  );
}
