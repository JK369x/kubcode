import Link from "next/link";
import { AlertTriangle, CalendarClock } from "lucide-react";
import type { BillingView } from "@/lib/billing/store";
import { REMINDER_TEXT, thaiDateTime } from "@/lib/billing/view";

/** In-site expiry reminder (ADR 0008: no email). Server-rendered; null when nothing is due. */
export function BillingBanner({ view }: { view: BillingView }) {
  if (!view.reminder || !view.paidUntil) return null;
  const r = REMINDER_TEXT[view.reminder];
  const Icon = r.tone === "warn" ? AlertTriangle : CalendarClock;
  return (
    <div
      role="status"
      className={`my-4 flex flex-wrap items-center gap-3 rounded-2xl border p-4 text-[15px] leading-[1.7] ${
        r.tone === "warn" ? "border-[#92400e]/40 bg-[#fef3c7] text-[#5c2c06]" : "border-input bg-card text-foreground"
      }`}
    >
      <Icon aria-hidden className="size-5 shrink-0" />
      <p className="m-0 min-w-0 flex-1">{r.text(thaiDateTime(view.paidUntil))}</p>
      <Link href="/account/billing" className="inline-flex min-h-11 items-center font-medium underline underline-offset-4">
        ต่ออายุ
      </Link>
    </div>
  );
}
