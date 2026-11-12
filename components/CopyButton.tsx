"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toaster";
import { cn } from "@/lib/utils";

/**
 * Copies the code of the surrounding .code-block. The result is a toast
 * (announced by the toaster's live region); the button also says
 * "คัดลอกแล้ว" for two seconds so the eye does not have to leave it.
 */
export function CopyButton({ label = "คัดลอก", className }: { label?: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  const big = className?.includes("code-copy-big");
  return (
    <Button
      type="button"
      variant={big ? "default" : "outline"}
      size={big ? "default" : "sm"}
      className={cn("code-copy", className)}
      data-state={copied ? "copied" : "idle"}
      onClick={async (e) => {
        const code = e.currentTarget.closest(".code-block")?.querySelector("pre code")?.textContent ?? "";
        try {
          await navigator.clipboard.writeText(code);
          setCopied(true);
          toast.success(label === "คัดลอก" ? "คัดลอกแล้ว" : `${label} แล้ว`);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          toast.error("คัดลอกไม่ได้", { description: "เลือกข้อความในกล่องแล้วคัดลอกเองได้" });
        }
      }}
    >
      {copied ? "คัดลอกแล้ว" : label}
    </Button>
  );
}
