import Link from "next/link";

/** Site footer: what kubcode is, plus the pages people look for at the bottom. */
export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="site-footer-about">
        <strong>kubcode</strong>
        <p>คลังวิธีทำคลิปสั้นภาษาไทย บอกเครดิตและสิทธิ์ของทุกคลิปที่แสดง</p>
      </div>
      <nav aria-label="ลิงก์ท้ายเว็บ" className="site-footer-links">
        <Link href="/">คลังคลิป</Link>
        <Link href="/articles">บทความ</Link>
        <Link href="/tools">เครื่องมือ</Link>
        <Link href="/privacy">นโยบายความเป็นส่วนตัว</Link>
      </nav>
    </footer>
  );
}
