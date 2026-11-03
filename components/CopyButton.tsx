"use client";
import { useState } from "react";

/** Copies the code of the surrounding .code-block and confirms in place. */
export function CopyButton() {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  return (
    <button
      type="button"
      className="code-copy"
      data-state={state}
      onClick={async (e) => {
        const code = e.currentTarget.closest(".code-block")?.querySelector("pre code")?.textContent ?? "";
        try {
          await navigator.clipboard.writeText(code);
          setState("copied");
        } catch {
          setState("failed");
        }
        setTimeout(() => setState("idle"), 2000);
      }}
    >
      {state === "copied" ? "คัดลอกแล้ว" : state === "failed" ? "คัดลอกไม่ได้" : "คัดลอก"}
    </button>
  );
}
