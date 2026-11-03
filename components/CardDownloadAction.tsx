"use client";

import Link from "next/link";
import { LockKeyhole, ArrowUpRight } from "lucide-react";
import styles from "./CardDownloadAction.module.css";

/** One honest unavailable treatment across catalog and detail. Never a ready switch. */
export function CardDownloadAction({ slug, name, conditions = true }: {
  slug: string; name?: string; conditions?: boolean;
}) {
  const label = "ดูเงื่อนไขการดาวน์โหลด" + (name ? " " + name : "");
  const state = "download-state-" + encodeURIComponent(slug);
  return (
    <div className={styles.root} data-conditions={conditions ? "link" : "none"}>
      <button type="button" className={styles.unavailable} disabled aria-describedby={state}>
        <LockKeyhole size={15} aria-hidden="true" />
        <span className={styles.copy}>
          <span className={styles.label}>ดาวน์โหลด skill</span>
          <span className={styles.state} id={state}>ยังไม่เปิดดาวน์โหลด</span>
        </span>
      </button>
      {conditions && <Link className={styles.conditions} href={"/skills/" + encodeURIComponent(slug) + "#download"} aria-label={label}>
        <ArrowUpRight size={16} aria-hidden="true" />
        <span>เงื่อนไข</span>
      </Link>}
    </div>
  );
}
