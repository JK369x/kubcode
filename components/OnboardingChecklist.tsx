"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Check, X } from "lucide-react";
import { PlatformLogo } from "@/components/PlatformLogo";
import type { Onboarding, StepId } from "@/lib/onboarding/view";

const DISMISS_KEY = "kubcode-onboarding-dismissed";

const COPY: Record<StepId, { title: string; todo: string; cta: string }> = {
  pay: { title: "จ่ายแพ็กเกจ", todo: "เลือกจำนวนช่อง แล้วจ่ายทีละเดือน", cta: "ดูแพ็กเกจ" },
  connect: { title: "เชื่อมช่องแรก", todo: "YouTube, Instagram หรือ TikTok", cta: "เชื่อมช่อง" },
  rule: { title: "ตั้งคำตอบคอมเมนต์", todo: "คนพิมพ์คำนี้ → ได้ลิงก์ทันที", cta: "ตั้งคำตอบ" },
  post: { title: "โพสต์แรก", todo: "อัปโหลดครั้งเดียว ลงได้หลายช่อง", cta: "สร้างโพสต์" },
};

function href(id: StepId, o: Onboarding): string {
  switch (id) {
    case "pay":
      return "/account/billing";
    case "connect":
      return "/account/channels";
    case "rule":
      return o.ruleChannelId ? `/account/channels/${o.ruleChannelId}/automations?template=link` : "/account/channels";
    case "post":
      return "/account/posts/new";
  }
}

const date = (iso: string) => new Intl.DateTimeFormat("th-TH", { day: "numeric", month: "short", timeZone: "Asia/Bangkok" }).format(new Date(iso));

/**
 * "เริ่มใช้ kubcode Social" (UX audit §3). Full on /account, compact atop
 * channels/posts. Self-contained: give it the server-computed state; it hides
 * itself once the member dismisses a completed checklist (this browser).
 */
export function OnboardingChecklist({ data, compact = false }: { data: Onboarding | null; compact?: boolean }) {
  const [dismissed, setDismissed] = useState<boolean | null>(null);
  useEffect(() => {
    try {
      setDismissed(localStorage.getItem(DISMISS_KEY) === "1");
    } catch {
      setDismissed(false);
    }
  }, []);
  if (!data) return null;
  if (compact && data.complete) return null;
  // Owner 2026-11-16: once everything is done it is one slim line, not a
  // card (and the member can hide even that, in this browser).
  if (data.complete) {
    if (dismissed ?? true) return null;
    return (
      <p className="my-4 flex min-h-11 items-center gap-2 rounded-full border border-input bg-card px-4 text-[14px] text-foreground" role="status">
        <span className="inline-grid size-5 place-items-center rounded-full bg-[#dcfce7] text-[#166534]" aria-hidden>
          <Check className="size-3.5" />
        </span>
        ตั้งค่าครบแล้ว
        <span className="text-muted-foreground">· ช่อง คำตอบคอมเมนต์ และโพสต์แรกพร้อมแล้ว</span>
        <button
          type="button"
          className="ml-auto inline-flex size-9 items-center justify-center rounded-full border-0 bg-transparent hover:bg-muted"
          aria-label="ซ่อนข้อความนี้"
          onClick={() => {
            try {
              localStorage.setItem(DISMISS_KEY, "1");
            } catch {}
            setDismissed(true);
          }}
        >
          <X aria-hidden className="size-4" />
        </button>
      </p>
    );
  }
  const done = data.steps.filter((s) => s.done).length;
  const next = data.steps.find((s) => !s.done);
  // Until the pass is paid, the later steps are shown but locked (their pages are paid-only).
  const locked = data.steps.some((s) => s.id === "pay" && !s.done);

  if (compact) {
    if (!next) return null;
    return (
      <aside aria-label="ขั้นต่อไป" className="my-4 flex flex-wrap items-center gap-3 rounded-2xl border border-input bg-card px-4 py-3 text-[15px]">
        <span className="font-semibold">
          เริ่มใช้ kubcode Social {done}/{data.steps.length}
        </span>
        <span className="text-muted-foreground">ขั้นต่อไป: {COPY[next.id].title}</span>
        <Link href={href(next.id, data)} className="ml-auto inline-flex min-h-11 items-center font-medium">
          {COPY[next.id].cta} →
        </Link>
      </aside>
    );
  }

  return (
    <section aria-labelledby="onboarding-h" className="my-6 grid gap-4 rounded-2xl border border-input bg-card p-5">
      <div className="flex flex-wrap items-center gap-3">
        <h2 id="onboarding-h" className="m-0 text-[20px]">
          เริ่มใช้ kubcode Social
        </h2>
        <span className="text-[14px] text-muted-foreground" aria-label={`ทำแล้ว ${done} จาก ${data.steps.length} ขั้น`}>
          {done}/{data.steps.length}
        </span>
        <span aria-hidden className="flex gap-1">
          {data.steps.map((s) => (
            <span key={s.id} className={`size-2 rounded-full ${s.done ? "bg-primary" : "bg-muted-foreground/30"}`} />
          ))}
        </span>
      </div>
      <ol className="m-0 grid list-none gap-2 p-0">
        {data.steps.map((s) => {
          const c = COPY[s.id];
          const isNext = next?.id === s.id;
          return (
            <li key={s.id} className={`flex flex-wrap items-center gap-3 rounded-xl px-3 py-2 ${isNext ? "bg-primary/10" : ""}`}>
              <span
                aria-hidden
                className={`inline-flex size-6 shrink-0 items-center justify-center rounded-full border ${s.done ? "border-primary bg-primary text-primary-foreground" : "border-input"}`}
              >
                {s.done ? <Check className="size-4" /> : null}
              </span>
              <span className="min-w-0">
                <span className="block font-medium">
                  {c.title}
                  <span className="sr-only">{s.done ? " (เสร็จแล้ว)" : " (ยังไม่ได้ทำ)"}</span>
                </span>
                <span className="block text-[14px] text-muted-foreground">
                  {s.id === "pay" && s.done && data.paidUntil ? `ใช้ได้ถึง ${date(data.paidUntil)}` : c.todo}
                </span>
              </span>
              {s.id === "connect" && !s.done && (
                <span aria-hidden className="flex gap-1">
                  <PlatformLogo platform="youtube" size={18} decorative />
                  <PlatformLogo platform="instagram" size={18} decorative />
                  <PlatformLogo platform="tiktok" size={18} decorative />
                </span>
              )}
              {!s.done && locked && s.id !== "pay" && <span className="ml-auto text-[13px] text-muted-foreground">หลังจ่ายแพ็กเกจ</span>}
              {!s.done && !(locked && s.id !== "pay") && (
                <Link
                  href={href(s.id, data)}
                  className={`ml-auto inline-flex min-h-11 items-center rounded-md px-4 font-medium no-underline ${isNext ? "bg-primary text-primary-foreground" : "border border-input"}`}
                >
                  {c.cta}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
