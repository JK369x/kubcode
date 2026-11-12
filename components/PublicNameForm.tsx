"use client";
import { useEffect, useId, useState } from "react";
import { send } from "@/lib/interactions/client";
import { toast } from "@/components/ui/toaster";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FieldLabel } from "@/components/ui/field";

/**
 * Edits the name shown with this member's comments. Prefilled with the
 * current name (the provider display name until the member changes it).
 */
export function PublicNameForm() {
  const id = useId();
  const [name, setName] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/interactions/profile", { credentials: "same-origin", cache: "no-store" })
      .then(async (res) => (res.ok ? ((await res.json()) as { publicName: string }).publicName : null))
      .then((n) => (n === null ? setStatus("ยังแก้ชื่อที่แสดงไม่ได้บนเซิร์ฟเวอร์นี้") : setName(n)))
      .catch(() => setStatus("โหลดชื่อที่แสดงไม่สำเร็จ"));
  }, []);

  return (
    <section className="membership" aria-labelledby={`${id}-h`}>
      <h2 id={`${id}-h`}>ชื่อที่แสดงกับคอมเมนต์</h2>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (name === null) return;
          setBusy(true);
          const r = await send<{ publicName: string }>("/api/interactions/profile", "POST", { publicName: name });
          setBusy(false);
          if (r.ok) {
            setName(r.publicName);
            toast.success(r.publicName ? `บันทึกชื่อแล้ว: ${r.publicName}` : "บันทึกแล้ว คอมเมนต์จะแสดงเป็น “สมาชิก”");
          } else toast.error(r.message);
        }}
      >
        <FieldLabel htmlFor={id}>ชื่อนี้แสดงต่อสาธารณะคู่กับคอมเมนต์ของคุณ เว้นว่างไว้เพื่อแสดงเป็น “สมาชิก”</FieldLabel>
        <Input
          id={id}
          value={name ?? ""}
          maxLength={40}
          disabled={name === null || busy}
          onChange={(e) => setName(e.target.value)}
          autoComplete="nickname"
        />
        <Button type="submit" disabled={name === null || busy}>
          บันทึกชื่อ
        </Button>
        <p role="status" aria-live="polite">
          {status}
        </p>
      </form>
    </section>
  );
}
