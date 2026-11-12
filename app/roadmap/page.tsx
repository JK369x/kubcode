import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardDescription } from "@/components/ui/card";
import { WaitlistButton, WaitlistProvider } from "@/components/WaitlistButton";
import { NOT_YET_LABEL, ROADMAP_SECTIONS, roadmapItems } from "@/lib/roadmap";

export const metadata: Metadata = {
  title: "แผนที่จะมา — kubcode",
  description:
    "สิ่งที่ใช้ได้ใน kubcode ตอนนี้ สิ่งที่กำลังทำ และแนวคิดในอนาคต สิ่งที่ยังไม่เปิดไม่มีราคาหรือวันที่สัญญาไว้",
  alternates: { canonical: "/roadmap" },
};

export default function Roadmap() {
  return (
    <main
      id="main"
      className="mx-auto w-full max-w-[1200px] px-[5%] pt-10 pb-24 md:px-8 md:pt-14"
    >
      <header className="max-w-[62ch]">
        <h1 className="m-0 text-[clamp(32px,4vw,48px)]">แผนที่จะมา</h1>
        <p className="lead mt-3">
          รายการ "กำลังทำ" และ "ในอนาคต" ยังไม่เปิดให้ใช้
          ไม่มีราคาและไม่มีวันที่สัญญาไว้ และอาจเปลี่ยนแปลงได้
          สิ่งที่คุณจ่ายเงินได้ตอนนี้อยู่ใน{" "}
          <Link
            href="/pricing"
            className="text-link underline underline-offset-4"
          >
            หน้าราคา
          </Link>
        </p>
      </header>
      <WaitlistProvider>
        <div className="mt-10 grid gap-10 lg:grid-cols-3 lg:gap-6">
          {ROADMAP_SECTIONS.map((s) => {
            const items = roadmapItems(s.status);
            return (
              <section key={s.status} aria-labelledby={`rm-${s.status}`}>
                <h2
                  id={`rm-${s.status}`}
                  className="m-0 text-[clamp(24px,2.1vw,28px)]"
                >
                  {s.titleTh}
                </h2>
                <p className="m-0 mt-1 text-[13px] leading-[1.6] text-muted-foreground">
                  {s.leadTh}
                </p>
                <ul className="m-0 mt-4 grid list-none gap-4 p-0">
                  {items.map((i) => (
                    <Card
                      as="li"
                      key={i.id}
                      edge="soft"
                      className="gap-2 hover:border-border"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <h3 className="m-0 min-w-0 flex-1 text-[17px] leading-[1.5] font-semibold">
                          {i.titleTh}
                        </h3>
                        {s.status === "now" ? (
                          <Badge variant="ok">ใช้ได้แล้ว</Badge>
                        ) : (
                          <Badge variant="warn">{NOT_YET_LABEL}</Badge>
                        )}
                      </div>
                      <CardDescription className="text-[15px] leading-[1.7]">
                        {i.descriptionTh}
                      </CardDescription>
                      {s.status !== "now" && i.quarter && (
                        <p className="m-0 text-[13px] text-muted-foreground">
                          เป้าหมายคร่าว ๆ {i.quarter} (ไม่ใช่คำสัญญา)
                        </p>
                      )}
                      {s.status !== "now" && (
                        <WaitlistButton
                          kind="roadmap"
                          id={i.id}
                          label={i.titleTh}
                          className="mt-1 w-full sm:w-auto sm:self-start"
                        />
                      )}
                    </Card>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      </WaitlistProvider>
    </main>
  );
}
