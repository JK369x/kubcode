"use client";
import Link from "next/link";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { Bell, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toaster";
import { send } from "@/lib/interactions/client";
import { WAITLIST_COUNT_MIN } from "@/lib/roadmap";
import type { WaitlistKind, WaitlistTarget } from "@/lib/waitlist/targets";

type Body = { available?: boolean; signedIn?: boolean; joined?: WaitlistTarget[]; counts?: Record<string, number> };
type State =
  | { phase: "loading"; counts: Record<string, number> }
  | { phase: "off"; counts: Record<string, number> }
  | { phase: "signed-out"; counts: Record<string, number> }
  | { phase: "ready"; joined: Set<string>; counts: Record<string, number> };

const key = (t: WaitlistTarget) => `${t.kind}:${t.id}`;

const Ctx = createContext<{ state: State; setJoined: (t: WaitlistTarget, on: boolean) => void } | null>(null);

/** Loads the member's waitlist and the public counts once per page (pages stay static). */
export function WaitlistProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>({ phase: "loading", counts: {} });
  useEffect(() => {
    let live = true;
    fetch("/api/waitlist", { credentials: "same-origin", cache: "no-store" })
      .then(async (r) => (await r.json().catch(() => ({}))) as Body)
      .catch(() => ({}) as Body)
      .then((b) => {
        if (!live) return;
        const counts = b.counts ?? {};
        if (b.available !== true) setState({ phase: "off", counts: {} });
        else if (!b.signedIn) setState({ phase: "signed-out", counts });
        else setState({ phase: "ready", joined: new Set((b.joined ?? []).map(key)), counts });
      });
    return () => {
      live = false;
    };
  }, []);
  const setJoined = useCallback((t: WaitlistTarget, on: boolean) => {
    setState((s) => {
      if (s.phase !== "ready") return s;
      const joined = new Set(s.joined);
      const counts = { ...s.counts };
      const k = key(t);
      if (on) joined.add(k);
      else joined.delete(k);
      // Keep a shown count in step with this member's own click.
      if (counts[k] !== undefined) {
        counts[k] += on ? 1 : -1;
        if (counts[k] < WAITLIST_COUNT_MIN) delete counts[k];
      }
      return { phase: "ready", joined, counts };
    });
  }, []);
  const value = useMemo(() => ({ state, setJoined }), [state, setJoined]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** "42 คนรออยู่", or null below WAITLIST_COUNT_MIN / while loading. */
export function useWaitlistCount(kind: WaitlistKind, id: string): number | null {
  const ctx = useContext(Ctx);
  return ctx?.state.counts[key({ kind, id })] ?? null;
}

/**
 * "แจ้งฉันเมื่อเปิด". Signed out (or before the state loads): a link to sign
 * in. Signed in: a toggle button that stores one row per member per target.
 * Nothing is emailed yet, so the copy promises no channel. With `showCount`,
 * the public count (≥ WAITLIST_COUNT_MIN) sits next to the button and is part
 * of its accessible name.
 */
export function WaitlistButton({
  kind,
  id,
  label,
  className,
  showCount = false,
}: {
  kind: WaitlistKind;
  id: string;
  label: string;
  className?: string;
  showCount?: boolean;
}) {
  const ctx = useContext(Ctx);
  const [busy, setBusy] = useState(false);
  const state = ctx?.state ?? { phase: "loading" as const, counts: {} };
  const target = { kind, id };
  const count = showCount ? (state.counts[key(target)] ?? null) : null;
  const countText = count !== null ? `${count.toLocaleString("en-US")} คนรออยู่` : null;
  const countSuffix = countText ? ` · ${countText}` : "";

  const wrap = (button: ReactNode) =>
    countText ? (
      <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
        {button}
        <span className="text-[13px] text-muted-foreground" aria-hidden>
          {countText}
        </span>
      </span>
    ) : (
      button
    );

  if (state.phase === "off") {
    return wrap(
      <Button variant="outline" className={className} disabled>
        <Bell aria-hidden /> แจ้งฉันเมื่อเปิด (ยังใช้ไม่ได้ชั่วคราว)
      </Button>,
    );
  }
  if (state.phase !== "ready") {
    return wrap(
      <Button asChild variant="outline" className={className}>
        <Link href="/account" aria-label={`แจ้งฉันเมื่อเปิด: ${label} (เข้าสู่ระบบก่อน)${countSuffix}`}>
          <Bell aria-hidden /> แจ้งฉันเมื่อเปิด
        </Link>
      </Button>,
    );
  }
  const joined = state.joined.has(key(target));
  const toggle = async () => {
    setBusy(true);
    const r = await send<{ joined: boolean }>("/api/waitlist", "POST", target);
    setBusy(false);
    if (!r.ok) {
      toast.error(r.message);
      return;
    }
    ctx?.setJoined(target, r.joined);
    if (r.joined) toast.success(`เราจะแจ้งคุณเมื่อ ${label} เปิด`);
    else toast.success(`ยกเลิกการแจ้งเตือน ${label} แล้ว`);
  };
  return wrap(
    <Button
      type="button"
      variant={joined ? "secondary" : "outline"}
      className={className}
      aria-label={
        joined
          ? `เราจะแจ้งคุณเมื่อเปิด: ${label} (กดอีกครั้งเพื่อยกเลิก)${countSuffix}`
          : `แจ้งฉันเมื่อเปิด: ${label}${countSuffix}`
      }
      disabled={busy}
      onClick={toggle}
    >
      {joined ? (
        <>
          <Check aria-hidden /> เราจะแจ้งคุณเมื่อเปิด
        </>
      ) : (
        <>
          <Bell aria-hidden /> แจ้งฉันเมื่อเปิด
        </>
      )}
    </Button>,
  );
}
