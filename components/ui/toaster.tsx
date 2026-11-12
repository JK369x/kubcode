"use client";
import { useEffect, useState, type ComponentProps } from "react";
import { DingToaster, toast } from "@/components/ding-toaster";

/** Thai names for the toast region and the close button (screen readers). */
export const TOAST_LABELS = { region: "การแจ้งเตือน", dismiss: "ปิดการแจ้งเตือน" } as const;

/**
 * The CSP nonce of this page, if it has one. Next puts the request's nonce on
 * its own <script> tags when the response carries a nonce CSP; browsers hide
 * the attribute value but keep the `nonce` property. Reading it here keeps
 * pages static (no headers() in the root layout).
 */
export function pageNonce(doc: Document = document): string | undefined {
  for (const el of doc.querySelectorAll<HTMLElement>("script[nonce], style[nonce], link[nonce]")) {
    if (el.nonce) return el.nonce;
  }
  return undefined;
}

/**
 * ding's toaster with our labels, mounted after hydration so its stylesheet
 * is injected once, with the page's nonce (ding injects only on first mount).
 * Colours and fonts come from our tokens (app/globals.css `.tst-viewport`).
 */
export function Toaster(props: Omit<ComponentProps<typeof DingToaster>, "nonce" | "labels">) {
  const [nonce, setNonce] = useState<string | null>(null);
  useEffect(() => setNonce(pageNonce() ?? ""), []);
  if (nonce === null) return null;
  return <DingToaster {...props} labels={TOAST_LABELS} nonce={nonce || undefined} />;
}

export { toast };
