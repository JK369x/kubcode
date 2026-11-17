import type { Metadata } from "next";
import Link from "next/link";
import {
  BookOpen,
  CalendarClock,
  CalendarX,
  Check,
  Clapperboard,
  CreditCard,
  Download,
  Github,
  Link2,
  Minus,
  QrCode,
  Receipt,
  Send,
  ShieldCheck,
  MessageSquareReply,
} from "lucide-react";
import { PricingShowcase } from "@/components/pricing/PricingShowcase";
import { COMPARE, type Cell } from "@/components/pricing/compare";
import { PlatformLogo, type Platform } from "@/components/PlatformLogo";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { PLANS, billingOpen } from "@/lib/plans";
import styles from "./pricing.module.css";

// The Social CTA follows KUBCODE_BILLING_ENABLED, which the web host can change
// without a rebuild (webhost.sh write-env), so render at request time.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "ราคา — kubcode",
  description:
    "ใช้ kubcode ฟรี หรือจ่ายเป็นรายช่องต่อเดือนเพื่อตั้งเวลาโพสต์และตอบคอมเมนต์อัตโนมัติบน YouTube, Instagram และ TikTok จ่ายด้วยบัตรหรือพร้อมเพย์ ไม่ตัดเงินอัตโนมัติ",
  alternates: { canonical: "/pricing" },
};

const PLATFORMS: readonly { id: Platform; name: string; state: "ok" | "soon"; noteTh: string }[] = [
  { id: "youtube", name: "YouTube", state: "ok", noteTh: "ตั้งเวลาโพสต์ Shorts และวิดีโอ" },
  { id: "instagram", name: "Instagram", state: "ok", noteTh: "ตั้งเวลา Reels · คอมเมนต์คีย์เวิร์ด → DM" },
  { id: "tiktok", name: "TikTok", state: "ok", noteTh: "ตั้งเวลาโพสต์ · ตอบคอมเมนต์แบบสาธารณะ" },
  { id: "facebook", name: "Facebook", state: "ok", noteTh: "ตั้งเวลา Reels ลงเพจ (ตอบคอมเมนต์อัตโนมัติเร็ว ๆ นี้)" },
];

export const FAQ: readonly { q: string; a: React.ReactNode }[] = [
  {
    q: "ยกเลิกยังไง",
    a: "ไม่ต้องกดยกเลิก เราไม่ตัดเงินอัตโนมัติ ถ้าไม่ต้องการใช้ต่อก็แค่ไม่ต่ออายุเดือนถัดไป คุณยังใช้ได้ครบจนถึงวันสุดท้ายของเดือนที่จ่ายแล้ว",
  },
  {
    q: "ขอเงินคืนได้ไหม",
    a: (
      <>
        เดือนที่จ่ายแล้วไม่คืนเงิน รวมถึงกรณีเลิกใช้กลางเดือน
        ยกเว้นเราเรียกเก็บเงินซ้ำหรือเรียกเก็บผิดพลาด ซึ่งเราคืนเต็มจำนวน
        อ่านรายละเอียดใน <Link href="/refund">นโยบายการคืนเงินและการยกเลิก</Link>
      </>
    ),
  },
  {
    q: "หมดเดือนแล้ว โพสต์ที่ตั้งเวลาไว้จะเป็นยังไง",
    a: "ถ้าไม่ต่ออายุ โพสต์ที่ตั้งเวลาไว้หลังวันหมดอายุจะไม่ถูกโพสต์ และการตอบคอมเมนต์อัตโนมัติจะหยุด ช่องที่เชื่อมไว้ คลิป และการตั้งค่าของคุณยังอยู่ ไม่ถูกลบ เมื่อต่ออายุแล้วกลับมาใช้ต่อได้",
  },
  {
    q: "แพ็กเกจโซเชียลได้ skill สำหรับสมาชิกด้วยไหม",
    a: "ไม่ได้ แพ็กเกจโซเชียลรวมการเชื่อมช่อง ตั้งเวลาโพสต์ และตอบคอมเมนต์อัตโนมัติเท่านั้น skill สำหรับสมาชิก (เช่น Deep Sea Docs) จะอยู่ในสกิลแพ็กและโซเชียล + สกิล ซึ่งยังไม่เปิดขาย กด “แจ้งฉันเมื่อเปิด” ที่การ์ดได้ ส่วน skill ฟรียังโหลดได้ฟรีเหมือนเดิม",
  },
  {
    q: "แพ็กเกจที่ขึ้นว่า “เร็ว ๆ นี้” ซื้อได้หรือยัง",
    a: "ยังซื้อไม่ได้ ราคาและสิ่งที่ได้แสดงไว้ให้ดูล่วงหน้า ถ้าสนใจ กด “แจ้งฉันเมื่อเปิด” แล้วเราจะแจ้งคุณเมื่อเปิด",
  },
  {
    q: "จ่ายด้วยอะไรได้บ้าง",
    a: "บัตรเครดิตหรือเดบิต Visa / Mastercard และพร้อมเพย์ ผ่านหน้าชำระเงินของ Stripe เราไม่เห็นและไม่เก็บเลขบัตรของคุณ",
  },
  {
    q: "ราคานี้รวม VAT หรือยัง",
    a: "ราคานี้ยังไม่มีภาษีมูลค่าเพิ่ม เพราะเรายังไม่ได้จดทะเบียน VAT ราคาที่เห็นคือราคาที่จ่ายจริง",
  },
  {
    q: "ราคาจะเปลี่ยนไหม",
    a: "ถ้าเปลี่ยน เราจะประกาศล่วงหน้าอย่างน้อย 30 วัน ราคาใหม่มีผลกับเดือนที่จ่ายหลังจากนั้น เดือนที่จ่ายแล้วไม่เปลี่ยน",
  },
];

const ROW_ICONS = {
  book: BookOpen,
  download: Download,
  link: Link2,
  calendar: CalendarClock,
  send: Send,
  reply: MessageSquareReply,
  clapperboard: Clapperboard,
} as const;

function CellMark({ cell }: { cell: Cell }) {
  if (cell === true)
    return (
      <span className={styles.yes}>
        <Check aria-hidden="true" />
        <span className="sr-only">มี</span>
      </span>
    );
  if (cell === false)
    return (
      <span className={styles.no}>
        <Minus aria-hidden="true" />
        <span className="sr-only">ไม่มี</span>
      </span>
    );
  return <span className={styles.cellText}>{cell}</span>;
}

/** Desktop: one table. Phones: one accordion item per plan, listing its rows. */
function Comparison() {
  return (
    <section aria-labelledby="compare-h" className={styles.section}>
      <h2 id="compare-h" className={styles.h2}>
        เทียบแพ็กเกจ
      </h2>
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <caption className="sr-only">เทียบสิ่งที่ได้ในแต่ละแพ็กเกจ</caption>
          <thead>
            <tr>
              <th scope="col">
                <span className="sr-only">สิ่งที่ได้</span>
              </th>
              {PLANS.map((p) => (
                <th key={p.id} scope="col" data-highlighted={p.highlighted ? "" : undefined}>
                  <span className={styles.thName}>{p.nameTh}</span>
                  <span className={styles.thPrice}>{p.priceThb === 0 ? "ฟรี" : `${p.priceThb} ฿`}</span>
                  {p.status === "coming_soon" && <Badge variant="warn">เร็ว ๆ นี้</Badge>}
                </th>
              ))}
            </tr>
          </thead>
          {COMPARE.map((g) => (
            <tbody key={g.titleTh}>
              <tr className={styles.groupRow}>
                <th scope="colgroup" colSpan={PLANS.length + 1}>
                  {g.titleTh}
                </th>
              </tr>
              {g.rows.map((r) => {
                const Icon = ROW_ICONS[r.icon];
                return (
                  <tr key={r.labelTh}>
                    <th scope="row">
                      <Icon aria-hidden="true" />
                      {r.labelTh}
                    </th>
                    {PLANS.map((p) => (
                      <td key={p.id} data-highlighted={p.highlighted ? "" : undefined}>
                        <CellMark cell={r.cells[p.id] ?? false} />
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          ))}
        </table>
      </div>
      <Accordion type="single" collapsible className={styles.compareMobile}>
        {PLANS.map((p) => (
          <AccordionItem key={p.id} value={p.id}>
            <AccordionTrigger>
              <span className={styles.accTitle}>
                {p.nameTh}
                <span className={styles.thPrice}>{p.priceThb === 0 ? "ฟรี" : `${p.priceThb} ฿`}</span>
              </span>
            </AccordionTrigger>
            <AccordionContent>
              <ul className={styles.accList}>
                {COMPARE.flatMap((g) => g.rows).map((r) => {
                  const Icon = ROW_ICONS[r.icon];
                  const cell = r.cells[p.id] ?? false;
                  return (
                    <li key={r.labelTh} data-off={cell === false ? "" : undefined}>
                      <Icon aria-hidden="true" />
                      <span>{r.labelTh}</span>
                      <CellMark cell={cell} />
                    </li>
                  );
                })}
              </ul>
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </section>
  );
}

export default function Pricing() {
  const open = billingOpen();
  return (
    <main id="main" className={styles.main}>
      <PricingShowcase open={open} />

      <Comparison />

      <div className={styles.twoUp}>
        <section aria-labelledby="platforms-h" className={styles.panel}>
          <h2 id="platforms-h" className={styles.h3}>
            แพลตฟอร์มที่รองรับ
          </h2>
          <ul className={styles.platformGrid}>
            {PLATFORMS.map((pl) => (
              <li key={pl.id} data-state={pl.state}>
                <PlatformLogo platform={pl.id} size={28} tone={pl.state === "ok" ? "brand" : "muted"} decorative />
                <span className={styles.platformName}>{pl.name}</span>
                {pl.state === "ok" ? <Badge variant="ok">รองรับแล้ว</Badge> : <Badge variant="warn">ยังไม่รองรับ</Badge>}
                <span className={styles.platformNote}>{pl.noteTh}</span>
              </li>
            ))}
          </ul>
          <p className={styles.small}>
            ตอบคอมเมนต์อัตโนมัติ: Instagram ตอบเป็น DM, TikTok ตอบเป็นคอมเมนต์สาธารณะ ใช้ตามสมควร (fair use) ตาม
            <Link href="/terms#fair-use">ข้อกำหนด</Link>
          </p>
        </section>

        <section aria-labelledby="pay-h" className={styles.panel}>
          <h2 id="pay-h" className={styles.h3}>
            การชำระเงิน
          </h2>
          <ul className={styles.payMethods} aria-label="วิธีจ่าย">
            <li>
              <CreditCard aria-hidden="true" />
              <span>
                <b>บัตรเครดิต / เดบิต</b>
                Visa · Mastercard
              </span>
            </li>
            <li>
              <QrCode aria-hidden="true" />
              <span>
                <b>พร้อมเพย์</b>
                สแกนจ่ายด้วยแอปธนาคาร
              </span>
            </li>
          </ul>
          <ul className={styles.payTerms}>
            <li>
              <CalendarX aria-hidden="true" />
              จ่ายทีละเดือน ไม่ตัดเงินอัตโนมัติ ต่ออายุเองเมื่อต้องการใช้ต่อ
            </li>
            <li>
              <Receipt aria-hidden="true" />
              ราคาเป็นเงินบาท ราคานี้ยังไม่มีภาษีมูลค่าเพิ่ม เพราะเรายังไม่ได้จดทะเบียน VAT
            </li>
            <li>
              <ShieldCheck aria-hidden="true" />
              จ่ายผ่าน Stripe เราไม่เห็นและไม่เก็บเลขบัตรของคุณ
            </li>
            <li>
              <Minus aria-hidden="true" />
              <span>
                ไม่คืนเงินสำหรับเดือนที่จ่ายแล้ว ยกเว้นเรียกเก็บซ้ำหรือผิดพลาด ดู <Link href="/refund">นโยบายคืนเงิน</Link>
              </span>
            </li>
          </ul>
        </section>
      </div>

      <section aria-labelledby="faq-h" className={styles.section}>
        <h2 id="faq-h" className={styles.h2}>
          คำถามที่พบบ่อย
        </h2>
        <Accordion type="multiple" className={styles.faq}>
          {FAQ.map((f, i) => (
            <AccordionItem key={f.q} value={`faq-${i}`}>
              <AccordionTrigger>{f.q}</AccordionTrigger>
              {/* forceMount: answers stay in the HTML (search, no-JS, tests); Radix hides closed ones. */}
              <AccordionContent forceMount className={styles.faqAnswer}>
                {f.a}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </section>

      <section aria-labelledby="trust-h" className={styles.trust}>
        <h2 id="trust-h" className={styles.h3}>
          เขียนระบบเอง ใช้กับช่องของเราเอง
        </h2>
        <p>
          ระบบตั้งเวลาโพสต์และตอบคอมเมนต์ใน kubcode Social เราเขียนขึ้นเองและใช้กับช่อง YouTube, Instagram และ TikTok ของเรา
          การโพสต์ส่งผ่าน API ทางการของแต่ละแพลตฟอร์ม ส่วน kubcode MCP (สั่งจาก AI agent) <Badge variant="secondary">กำลังทำ</Badge>
        </p>
        <div className={styles.trustLinks}>
          <Link href="/?product=social#social-heading">ดูตัวอย่างการทำงาน</Link>
          <Link href="/roadmap">ดูแผนงาน</Link>
          <a href="https://github.com/JK369x/kubcode" target="_blank" rel="noopener noreferrer">
            <Github aria-hidden="true" />
            โค้ดเปิดให้ดูบน GitHub
          </a>
        </div>
      </section>
    </main>
  );
}
