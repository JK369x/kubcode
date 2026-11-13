"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
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
  return (
    <>
      <p className="lead" role="status" aria-live="polite">
        {TEXT[state]}
      </p>
      <p>
        <Link href="/account/billing">ดูแพ็กเกจของคุณ</Link> · <Link href="/account/channels">ไปที่ช่องที่เชื่อมไว้</Link>
      </p>
    </>
  );
}
