"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { CheckCircle2, Loader2, MessageSquareReply, Plug, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { send } from "@/lib/interactions/client";

type State = "checking" | "granted" | "waiting" | "closed" | "error";
const TEXT: Record<State, string> = {
  checking: "กำลังตรวจสอบการชำระเงินกับ Stripe…",
  granted: "ชำระเงินสำเร็จ แพ็กเกจของคุณพร้อมใช้แล้ว",
  waiting: "ยังไม่ได้รับยืนยันการชำระเงิน ถ้าจ่ายด้วยพร้อมเพย์ อาจใช้เวลาสักครู่ หน้านี้จะตรวจซ้ำให้อัตโนมัติ",
  closed: "รายการนี้ไม่สำเร็จหรือหมดเวลาแล้ว ไม่มีการเรียกเก็บเงิน",
  error: "ตรวจสอบไม่สำเร็จ ถ้าชำระเงินแล้ว ระบบจะยืนยันให้อัตโนมัติภายในไม่กี่นาที",
};

/** Asks the billing Lambda (via the web host) to check the session; Stripe is the source of truth. */
export function BillingSuccess({ sessionId }: { sessionId: string }) {
  const [state, setState] = useState<State>("checking");
  useEffect(() => {
    let live = true;
    let tries = 0;
    const check = async () => {
      const r = await send<{ result: string }>("/api/billing/fulfil", "POST", { session_id: sessionId });
      if (!live) return;
      if (!r.ok) return setState("error");
      if (r.result === "granted" || r.result === "already_paid") return setState("granted");
      if (r.result === "closed") return setState("closed");
      setState("waiting");
      if (++tries < 10) setTimeout(check, 4000);
    };
    void check();
    return () => {
      live = false;
    };
  }, [sessionId]);
  const granted = state === "granted";
  return (
    <div className="grid gap-5">
      <p className="lead m-0 flex items-start gap-2" role="status" aria-live="polite">
        {granted ? (
          <CheckCircle2 aria-hidden className="mt-1 size-5 shrink-0 text-[#0f766e] dark:text-[#5eead4]" />
        ) : state === "checking" || state === "waiting" ? (
          <Loader2 aria-hidden className="mt-1 size-5 shrink-0 animate-spin motion-reduce:animate-none" />
        ) : null}
        <span>{TEXT[state]}</span>
      </p>
      {/* Next step right after paying (UX audit P0-2): one primary action. */}
      {state !== "closed" && (
        <section aria-labelledby="next-h" className="grid gap-3">
          <h2 id="next-h" className="m-0 text-[18px] font-semibold">
            ขั้นต่อไป
          </h2>
          <ol className="m-0 grid list-none gap-2 p-0 text-[15px]">
            <li className="flex items-center gap-3">
              <Plug aria-hidden className="size-5 shrink-0 text-link" /> เชื่อมช่อง YouTube, Instagram หรือ TikTok
            </li>
            <li className="flex items-center gap-3 text-muted-foreground">
              <MessageSquareReply aria-hidden className="size-5 shrink-0" /> ตั้งคำตอบคอมเมนต์อัตโนมัติ
            </li>
            <li className="flex items-center gap-3 text-muted-foreground">
              <Send aria-hidden className="size-5 shrink-0" /> สร้างโพสต์แรก
            </li>
          </ol>
        </section>
      )}
      <div className="flex flex-wrap gap-3">
        {state !== "closed" && (
          <Button asChild size="lg" className="rounded-full font-semibold">
            <Link href="/account/channels#channels-add">เชื่อมช่องแรก</Link>
          </Button>
        )}
        <Button asChild size="lg" variant="outline" className="rounded-full">
          <Link href="/account/billing">ดูแพ็กเกจ</Link>
        </Button>
      </div>
    </div>
  );
}
