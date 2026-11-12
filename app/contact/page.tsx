import type { Metadata } from "next";
import Link from "next/link";
import { SellerContact } from "@/components/SellerContact";

export const metadata: Metadata = {
  title: "ติดต่อเรา — kubcode",
  description: "ผู้ขายและช่องทางติดต่อ kubcode สำหรับคำถามเรื่องบัญชี การชำระเงิน และการคืนเงิน",
  alternates: { canonical: "/contact" },
};

export default function Contact() {
  return (
    <main id="main" className="reading">
      <h1>ติดต่อเรา</h1>
      <p className="lead">
        kubcode ดำเนินการโดยเจ้าของเว็บในฐานะบุคคลธรรมดา ติดต่อเรื่องบัญชี การชำระเงิน การคืนเงิน
        หรือการขอลบข้อมูลได้ทางอีเมลด้านล่าง
      </p>
      <section>
        <h2>ผู้ขายและช่องทางติดต่อ</h2>
        <SellerContact />
      </section>
      <section>
        <h2>เรื่องที่ติดต่อได้</h2>
        <p>
          การชำระเงินและการเรียกเก็บเงินผิดพลาด (ดู <Link href="/refund">นโยบายคืนเงิน</Link>)
          ปัญหาการเชื่อมช่องหรือการโพสต์ การขอลบบัญชีและข้อมูล (ดู <Link href="/privacy">นโยบายความเป็นส่วนตัว</Link>)
          และคำถามเรื่อง <Link href="/pricing">ราคา</Link> เราตอบเป็นภาษาไทยหรืออังกฤษ
        </p>
        <p>อย่าส่งรหัสผ่าน เลขบัตร หรือ API key มาทางอีเมล เราไม่เคยขอข้อมูลเหล่านี้</p>
      </section>
    </main>
  );
}
