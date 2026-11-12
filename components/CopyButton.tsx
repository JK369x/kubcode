"use client";
import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toaster";
import { cn } from "@/lib/utils";

/**
 * Small icon-only copy button in the top-right corner inside a .code-block's
 * text box (owner, 2026-11-12). Copies the block's code; the icon turns into
 * a check for 2 s and a toast confirms (announced by the toaster's live
 * region). The accessible name stays the same ("คัดลอกโค้ด" / "คัดลอก prompt").
 */
export function CopyButton({ label = "คัดลอกโค้ด", className }: { label?: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-label={label}
      title={label}
      className={cn(
        "code-copy absolute top-1.5 right-1.5 z-[1] size-8 bg-card/85 text-muted-foreground backdrop-blur-[2px] hover:enabled:text-foreground md:size-8 data-[state=copied]:text-link",
        className,
      )}
      data-state={copied ? "copied" : "idle"}
      onClick={async (e) => {
        const code = e.currentTarget.closest(".code-block")?.querySelector("pre code")?.textContent ?? "";
        try {
          await navigator.clipboard.writeText(code);
          setCopied(true);
          toast.success(label === "คัดลอกโค้ด" ? "คัดลอกโค้ดแล้ว" : `${label} แล้ว`);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          toast.error("คัดลอกไม่ได้", { description: "เลือกข้อความในกล่องแล้วคัดลอกเองได้" });
        }
      }}
    >
      {copied ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
    </Button>
  );
}
