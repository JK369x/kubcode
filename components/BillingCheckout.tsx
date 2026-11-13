"use client";
import { useState } from "react";
import { Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toaster";
import { send } from "@/lib/interactions/client";

const baht = (satang: number) => `${(satang / 100).toLocaleString("en-US", { maximumFractionDigits: 2 })} ฿`;

/**
 * Choose N channels and go to Stripe Checkout. "add" buys extra slots up to
 * the current expiry (prorated by the Lambda; the exact amount shows on Stripe's page).
 */
export function BillingCheckout({
  kind,
  initial,
  max,
  pricePerChannel,
  label,
}: {
  kind: "new" | "add";
  initial: number;
  max: number;
  pricePerChannel: number;
  label: string;
}) {
  const [slots, setSlots] = useState(Math.min(Math.max(initial, 1), max));
  const [busy, setBusy] = useState(false);
  const id = `slots-${kind}`;
  async function pay() {
    setBusy(true);
    const r = await send<{ url: string }>("/api/billing/checkout", "POST", { kind, slots });
    if (r.ok && r.url.startsWith("https://checkout.stripe.com/")) {
      window.location.assign(r.url);
      return;
    }
    setBusy(false);
    toast.error(r.ok ? "เปิดหน้าชำระเงินไม่สำเร็จ" : r.message);
  }
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <label htmlFor={id} className="text-[15px] font-medium">
          {kind === "add" ? "จำนวนช่องที่เพิ่ม" : "จำนวนช่อง"}
        </label>
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" size="icon" aria-label="ลดจำนวนช่อง" disabled={busy || slots <= 1} onClick={() => setSlots((s) => Math.max(1, s - 1))}>
            <Minus aria-hidden />
          </Button>
          <input
            id={id}
            type="number"
            inputMode="numeric"
            min={1}
            max={max}
            value={slots}
            onChange={(e) => {
              const n = Number(e.target.value);
              if (Number.isInteger(n)) setSlots(Math.min(Math.max(n, 1), max));
            }}
            className="h-11 w-20 rounded-md border border-input bg-card px-3 text-center text-[16px]"
          />
          <Button type="button" variant="outline" size="icon" aria-label="เพิ่มจำนวนช่อง" disabled={busy || slots >= max} onClick={() => setSlots((s) => Math.min(max, s + 1))}>
            <Plus aria-hidden />
          </Button>
        </div>
      </div>
      {kind === "new" ? (
        <p className="m-0 text-[15px]" aria-live="polite">
          รวม <strong className="font-brand text-[22px]">{baht(slots * pricePerChannel)}</strong> สำหรับ {slots} ช่อง 1 เดือน
        </p>
      ) : (
        <p className="m-0 text-[15px] text-muted-foreground">คิดตามวันที่เหลือจนถึงวันหมดอายุเดิม (ขั้นต่ำ 10 ฿) ยอดจริงแสดงในหน้าชำระเงิน</p>
      )}
      <Button type="button" onClick={pay} disabled={busy} className="w-full sm:w-auto">
        {busy ? "กำลังเปิดหน้าชำระเงิน…" : label}
      </Button>
      <p className="m-0 text-[13px] leading-[1.6] text-muted-foreground">
        ชำระผ่าน Stripe ด้วยบัตรหรือพร้อมเพย์ ไม่ตัดเงินอัตโนมัติ ไม่คืนเงินเดือนที่จ่ายแล้ว ยกเว้นเรียกเก็บซ้ำหรือผิดพลาด
      </p>
    </div>
  );
}
