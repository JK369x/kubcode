import { ThemeToggle } from "@/components/ThemeToggle";
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import "@fontsource/anuphan/400.css";
import "@fontsource/anuphan/500.css";
import "@fontsource/anuphan/600.css";
import "@fontsource/archivo/500.css";
import "@fontsource/archivo/600.css";
import "./globals.css";
export const metadata: Metadata = {
  title: "kubcode — คลังทักษะและงานทดลอง",
  description:
    "ดูตัวอย่างจริง เข้าใจเครื่องมือ และอ่านก่อนใช้งาน คลังส่วนตัวต้นแบบในเครื่อง",
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
        <header className="header">
          <Link className="brand" href="/">
            kubcode
          </Link>
          <nav aria-label="หลัก">
            <ThemeToggle />
            <Link href="/">คลังทักษะ</Link>
            <Link href="/articles">บทความ</Link>
            <Link className="account-link" href="/account">
              พื้นที่สมาชิก <ArrowUpRight size={16} />
            </Link>
          </nav>
        </header>
        {children}
        <footer>
          <strong>kubcode</strong>
          <span>Personal library / Local prototype</span>
          <p>
            ตัวอย่างสำหรับตรวจในเครื่องเท่านั้น · ยังไม่อนุญาตเผยแพร่ซ้ำ
            <br />
            สมาชิกและดาวน์โหลดยังไม่เปิดใช้งาน
          </p>
        </footer>
      </body>
    </html>
  );
}
