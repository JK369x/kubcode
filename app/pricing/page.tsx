import type { Metadata } from "next";
import type { CSSProperties } from "react";
import Link from "next/link";
import { Check, Minus } from "lucide-react";
import { WaitlistButton, WaitlistProvider } from "@/components/WaitlistButton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
} from "@/components/ui/card";
import {
  PLANS,
  billingOpen,
  extraChannelLabel,
  priceLabel,
  type Plan,
  PRODUCT_FAMILIES,
} from "@/lib/plans";

// The Social CTA follows KUBCODE_BILLING_ENABLED, which the web host can change
// without a rebuild (webhost.sh write-env), so render at request time.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "ราคา — kubcode",
  description:
    "ใช้ kubcode ฟรี หรือจ่ายเป็นรายช่องต่อเดือนเพื่อตั้งเวลาโพสต์และตอบคอมเมนต์อัตโนมัติบน YouTube, Instagram และ TikTok จ่ายด้วยบัตรหรือพร้อมเพย์ ไม่ตัดเงินอัตโนมัติ",
  alternates: { canonical: "/pricing" },
};

const PLATFORMS: readonly { name: string; state: "ok" | "soon" }[] = [
  { name: "YouTube", state: "ok" },
  { name: "Instagram", state: "ok" },
  { name: "TikTok", state: "ok" },
  { name: "Facebook", state: "soon" },
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
        อ่านรายละเอียดใน{" "}
        <Link href="/refund">นโยบายการคืนเงินและการยกเลิก</Link>
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

function PlanCta({ plan, open }: { plan: Plan; open: boolean }) {
  const noteId = `plan-${plan.id}-note`;
  if (plan.status === "coming_soon") {
    return (
      <>
        <WaitlistButton
          kind="plan"
          id={plan.id}
          label={`แพ็กเกจ${plan.nameTh}`}
          className="w-full"
        />
        <p className="m-0 text-center text-[13px] leading-[1.6] text-muted-foreground">
          ยังซื้อไม่ได้ ยังไม่เปิดขาย
        </p>
      </>
    );
  }
  if (plan.priceThb === 0) {
    return (
      <Button asChild variant="outline" className="w-full">
        <Link href="/account">เข้าสู่ระบบเพื่อเริ่มใช้</Link>
      </Button>
    );
  }
  if (open) {
    return (
      <Button asChild className="w-full">
        <Link href="/account/billing">สมัคร{plan.nameTh}</Link>
      </Button>
    );
  }
  return (
    <>
      <Button disabled className="w-full" aria-describedby={noteId}>
        เปิดให้สมัครเร็ว ๆ นี้
      </Button>
      <p
        id={noteId}
        className="m-0 text-center text-[13px] leading-[1.6] text-muted-foreground"
      >
        ยังไม่เปิดรับชำระเงิน
      </p>
    </>
  );
}

function PlanCard({ plan, open }: { plan: Plan; open: boolean }) {
  const price = priceLabel(plan);
  const extra = extraChannelLabel(plan);
  const titleId = `plan-${plan.id}`;
  const soon = plan.status === "coming_soon";
  return (
    <Card
      as="li"
      aria-labelledby={titleId}
      data-status={plan.status}
      edge={soon ? "soft" : "strong"}
      className={
        plan.highlighted
          ? "border-2 border-ring hover:border-ring"
          : soon
            ? "bg-muted/60 hover:border-border"
            : undefined
      }
    >
      <CardHeader className="flex-wrap items-start justify-between gap-2">
        <h2
          id={titleId}
          className="m-0 text-[22px] leading-[1.4] font-semibold"
        >
          {plan.nameTh}{" "}
          <span className="block font-brand text-[15px] font-medium text-muted-foreground">
            {plan.families.length > 0 ? plan.families.map((f) => PRODUCT_FAMILIES[f]).join(" + ") : plan.nameEn}
          </span>
        </h2>
        {plan.highlighted && <Badge>แนะนำ</Badge>}
        {soon && <Badge variant="warn">เร็ว ๆ นี้</Badge>}
      </CardHeader>
      <CardDescription>{plan.summaryTh}</CardDescription>
      <p
        className={`m-0 flex flex-wrap items-baseline gap-x-2 ${soon ? "text-muted-foreground" : ""}`}
      >
        <span className="font-brand text-[40px] leading-[1.2] font-semibold tracking-[-0.03em]">
          {price.amount}
        </span>
        <span className="text-[15px] text-muted-foreground">{price.unit}</span>
      </p>
      {extra && (
        <p className="m-0 -mt-2 text-[13px] leading-[1.6] text-muted-foreground">
          {extra}
        </p>
      )}
      <CardContent className="gap-0">
        <ul className="m-0 grid list-none gap-2.5 p-0">
          {plan.features.map((f) => {
            const excluded = f.startsWith("ไม่รวม");
            return (
              <li
                key={f}
                className={`flex gap-2.5 text-[15px] leading-[1.7] ${excluded ? "text-muted-foreground" : ""}`}
              >
                {excluded ? (
                  <Minus aria-hidden className="mt-[5px] size-[18px]" />
                ) : (
                  <Check
                    aria-hidden
                    className="mt-[5px] size-[18px] text-link"
                  />
                )}
                <span className="min-w-0">{f}</span>
              </li>
            );
          })}
        </ul>
      </CardContent>
      <CardFooter className="flex-col items-stretch gap-2 border-t-0 pt-2">
        <PlanCta plan={plan} open={open} />
      </CardFooter>
    </Card>
  );
}

export default function Pricing() {
  const open = billingOpen();
  return (
    <main
      id="main"
      className="mx-auto w-full max-w-[1200px] px-[5%] pt-10 pb-24 md:px-8 md:pt-14"
    >
      <header className="max-w-[60ch]">
        <h1 className="m-0 text-[clamp(32px,4vw,48px)]">ราคา</h1>
        <p className="lead mt-3">
          อ่าน เรียนรู้ และโหลด skill ฟรีได้เลย
          ถ้าต้องการตั้งเวลาโพสต์และตอบคอมเมนต์อัตโนมัติ เลือกแพ็กเกจโซเชียล
          จ่ายตามจำนวนช่องที่เชื่อม ทีละเดือน
        </p>
      </header>

      <WaitlistProvider>
        <ul
          className="m-0 mt-10 grid list-none gap-6 p-0 md:grid-cols-2 xl:grid-cols-[repeat(var(--plans),minmax(0,1fr))]"
          style={{ "--plans": Math.min(PLANS.length, 4) } as CSSProperties}
          aria-label="แพ็กเกจ"
        >
          {PLANS.map((p) => (
            <PlanCard key={p.id} plan={p} open={open} />
          ))}
        </ul>
      </WaitlistProvider>
      <p className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 text-[15px]">
        <span>
          ทุกแพ็กเกจจ่ายทีละเดือน ไม่ตัดเงินอัตโนมัติ · ราคานี้ยังไม่มี VAT
        </span>
        <Link
          href="/roadmap"
          className="inline-flex min-h-6 items-center text-link underline underline-offset-4"
        >
          ดูแผนที่จะมา →
        </Link>
      </p>

      <div className="mt-14 grid gap-6 md:grid-cols-2">
        <section
          aria-labelledby="pay-h"
          className="rounded-2xl border border-border bg-card p-5"
        >
          <h2 id="pay-h" className="m-0 text-[22px]">
            การชำระเงิน
          </h2>
          <ul className="m-0 mt-3 grid list-disc gap-1.5 pl-5 text-[15px] leading-[1.7]">
            <li>
              จ่ายทีละเดือน ไม่ตัดเงินอัตโนมัติ ต่ออายุเองเมื่อต้องการใช้ต่อ
            </li>
            <li>
              บัตรเครดิตหรือเดบิต (Visa / Mastercard) และพร้อมเพย์ ผ่าน Stripe
            </li>
            <li>
              ราคาเป็นเงินบาท ราคานี้ยังไม่มีภาษีมูลค่าเพิ่ม
              เพราะเรายังไม่ได้จดทะเบียน VAT
            </li>
            <li>
              ไม่คืนเงินสำหรับเดือนที่จ่ายแล้ว ยกเว้นเรียกเก็บซ้ำหรือผิดพลาด ดู{" "}
              <Link
                href="/refund"
                className="text-link underline underline-offset-4"
              >
                นโยบายคืนเงิน
              </Link>
            </li>
          </ul>
        </section>
        <section
          aria-labelledby="platforms-h"
          className="rounded-2xl border border-border bg-card p-5"
        >
          <h2 id="platforms-h" className="m-0 text-[22px]">
            แพลตฟอร์มที่รองรับ
          </h2>
          <ul className="m-0 mt-3 grid list-none gap-2 p-0">
            {PLATFORMS.map((pl) => (
              <li
                key={pl.name}
                className="flex items-center justify-between gap-3 text-[15px] leading-[1.7]"
              >
                <span className="font-brand">{pl.name}</span>
                {pl.state === "ok" ? (
                  <Badge variant="ok">รองรับแล้ว</Badge>
                ) : (
                  <Badge variant="warn">ยังไม่รองรับ</Badge>
                )}
              </li>
            ))}
          </ul>
          <p className="m-0 mt-3 text-[13px] leading-[1.6] text-muted-foreground">
            ตอบคอมเมนต์อัตโนมัติ: Instagram ตอบเป็น DM, TikTok
            ตอบเป็นคอมเมนต์สาธารณะ ใช้ตามสมควร (fair use) ตาม
            <Link
              href="/terms#fair-use"
              className="text-link underline underline-offset-4"
            >
              ข้อกำหนด
            </Link>
          </p>
        </section>
      </div>

      <section aria-labelledby="faq-h" className="mt-14 max-w-[820px]">
        <h2 id="faq-h" className="m-0 text-[clamp(27px,2.35vw,34px)]">
          คำถามที่พบบ่อย
        </h2>
        <div className="get-started-faq mt-4">
          {FAQ.map((f) => (
            <details key={f.q}>
              <summary className="text-[16px]">{f.q}</summary>
              <p className="text-[15px] [&_a]:text-link [&_a]:underline">
                {f.a}
              </p>
            </details>
          ))}
        </div>
      </section>
    </main>
  );
}
