"use client";
import Link from "next/link";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { Bell, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toaster";
import { send } from "@/lib/interactions/client";
import type { WaitlistKind, WaitlistTarget } from "@/lib/waitlist/targets";

type State =
  | { phase: "loading" }
  | { phase: "off" }
  | { phase: "signed-out" }
  | { phase: "ready"; joined: Set<string> };

const key = (t: WaitlistTarget) => `${t.kind}:${t.id}`;

const Ctx = createContext<{ state: State; setJoined: (t: WaitlistTarget, on: boolean) => void } | null>(null);

/** Loads the member's waitlist once per page (pages stay static). */
export function WaitlistProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>({ phase: "loading" });
  useEffect(() => {
    let live = true;
    fetch("/api/waitlist", { credentials: "same-origin", cache: "no-store" })
      .then(async (r) => (await r.json().catch(() => ({}))) as { available?: boolean; signedIn?: boolean; joined?: WaitlistTarget[] })
      .catch(() => ({}) as { available?: boolean })
      .then((b: { available?: boolean; signedIn?: boolean; joined?: WaitlistTarget[] }) => {
        if (!live) return;
        if (b.available !== true) setState({ phase: "off" });
        else if (!b.signedIn) setState({ phase: "signed-out" });
        else setState({ phase: "ready", joined: new Set((b.joined ?? []).map(key)) });
      });
    return () => {
      live = false;
    };
  }, []);
  const setJoined = useCallback((t: WaitlistTarget, on: boolean) => {
    setState((s) => {
      if (s.phase !== "ready") return s;
      const joined = new Set(s.joined);
      if (on) joined.add(key(t));
      else joined.delete(key(t));
      return { phase: "ready", joined };
    });
  }, []);
  const value = useMemo(() => ({ state, setJoined }), [state, setJoined]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/**
 * "แจ้งฉันเมื่อเปิด". Signed out (or before the state loads): a link to sign
 * in. Signed in: a toggle button that stores one row per
 * member per target. Nothing is emailed yet, so the copy promises no channel.
 */
export function WaitlistButton({ kind, id, label, className }: { kind: WaitlistKind; id: string; label: string; className?: string }) {
  const ctx = useContext(Ctx);
  const [busy, setBusy] = useState(false);
  const state = ctx?.state ?? { phase: "loading" as const };
  const target = { kind, id };

  if (state.phase === "off") {
    return (
      <Button variant="outline" className={className} disabled>
        <Bell aria-hidden /> แจ้งฉันเมื่อเปิด (ยังใช้ไม่ได้ชั่วคราว)
      </Button>
    );
  }
  if (state.phase !== "ready") {
    return (
      <Button asChild variant="outline" className={className}>
        <Link href="/account" aria-label={`แจ้งฉันเมื่อเปิด: ${label} (เข้าสู่ระบบก่อน)`}>
          <Bell aria-hidden /> แจ้งฉันเมื่อเปิด
        </Link>
      </Button>
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
  return (
    <Button
      type="button"
      variant={joined ? "secondary" : "outline"}
      className={className}
      aria-label={joined ? `เราจะแจ้งคุณเมื่อเปิด: ${label} (กดอีกครั้งเพื่อยกเลิก)` : `แจ้งฉันเมื่อเปิด: ${label}`}
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
    </Button>
  );
}
