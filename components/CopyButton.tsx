"use client";
import { useState } from "react";

/**
 * Copies the code of the surrounding .code-block and confirms in place; a
 * polite live region announces the result to screen readers.
 */
export function CopyButton({ label = "คัดลอก", className }: { label?: string; className?: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const message = state === "copied" ? "คัดลอกแล้ว" : state === "failed" ? "คัดลอกไม่ได้" : "";
  return (
    <>
      <button
        type="button"
        className={className ? `code-copy ${className}` : "code-copy"}
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
        {message || label}
      </button>
      <span className="sr-only" role="status" aria-live="polite">
        {message}
      </span>
    </>
  );
}
