"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { CHANGELOG } from "@/lib/changelog";
import styles from "./UpdatesBadge.module.css";

/** localStorage key: the newest changelog PR this browser has seen. */
export const SEEN_KEY = "kubcode.updates.seen";
/** At most this many are counted, so a first visit does not shout "10 ใหม่". */
export const MAX_NEW = 5;

/** How many changelog entries are newer than `seen` (PR number), capped. */
export function unseenCount(seen: number | null, prs: readonly number[] = CHANGELOG.map((e) => e.pr)): number {
  const newer = seen === null ? prs.length : prs.filter((pr) => pr > seen).length;
  return Math.min(newer, MAX_NEW);
}

const newest = () => Math.max(...CHANGELOG.map((e) => e.pr));

/** Opening the list in any way (link, bookmark) counts as seen. */
function markSeenNow() {
  try {
    window.localStorage.setItem(SEEN_KEY, String(newest()));
  } catch {}
  window.dispatchEvent(new Event(SEEN_KEY));
}

/** Rendered on /roadmap: the visitor has now seen every release listed. */
export function MarkUpdatesSeen() {
  useEffect(markSeenNow, []);
  return null;
}

/**
 * Header "อัปเดต" (owner 2026-11-23, like "New drops · 5 New"): opens the
 * "เพิ่งปล่อย" list on /roadmap. The "N ใหม่" chip counts releases this browser
 * has not opened yet; it shows nothing until read on the client (the page
 * stays one static HTML) and goes away once the list is opened.
 */
export function UpdatesBadge() {
  const [count, setCount] = useState(0);
  useEffect(() => {
    let seen: number | null = null;
    try {
      const v = Number(window.localStorage.getItem(SEEN_KEY));
      seen = Number.isInteger(v) && v > 0 ? v : null;
    } catch {
      // Storage blocked: no chip rather than a count that never clears.
      return;
    }
    setCount(unseenCount(seen));
    // The header stays mounted across client navigation: clear when /roadmap marks them seen.
    const clear = () => setCount(0);
    window.addEventListener(SEEN_KEY, clear);
    return () => window.removeEventListener(SEEN_KEY, clear);
  }, []);
  const markSeen = () => {
    markSeenNow();
    setCount(0);
  };
  return (
    <Link className={styles.updates} href="/roadmap#shipped-h" onClick={markSeen}>
      <Sparkles aria-hidden="true" />
      <span>อัปเดต</span>
      {count > 0 && (
        <span className={styles.chip}>
          {count} ใหม่<span className="sr-only"> รายการที่ยังไม่ได้ดู</span>
        </span>
      )}
    </Link>
  );
}
